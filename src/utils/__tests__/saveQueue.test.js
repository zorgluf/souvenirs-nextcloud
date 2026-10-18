import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SaveQueue, isRetryable } from '../saveQueue.js'

function deferred() {
    let resolve, reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}

function httpError(status) {
    const error = new Error('HTTP ' + status)
    error.status = status
    return error
}

describe('isRetryable', () => {
    it('always retries a busy album: the server applied nothing', () => {
        expect(isRetryable(httpError(423))).toBe(true)
        expect(isRetryable(httpError(423), true)).toBe(true)
    })

    it('retries gateway errors and network failures of idempotent writes only', () => {
        // the server may have applied the write before the gateway gave up
        expect(isRetryable(httpError(504))).toBe(false)
        expect(isRetryable(new TypeError('Failed to fetch'))).toBe(false)
        expect(isRetryable(httpError(503), true)).toBe(true)
        expect(isRetryable(new TypeError('Failed to fetch'), true)).toBe(true)
    })

    it('never retries real failures', () => {
        for (const idempotent of [false, true]) {
            expect(isRetryable(httpError(404), idempotent)).toBe(false)
            expect(isRetryable(httpError(400), idempotent)).toBe(false)
            expect(isRetryable(httpError(500), idempotent)).toBe(false)
            expect(isRetryable(new Error('bug'), idempotent)).toBe(false)
        }
    })
})

describe('SaveQueue', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('runs tasks one at a time, in submission order', async () => {
        const queue = new SaveQueue()
        const log = []
        const first = deferred()
        const a = queue.run(() => { log.push('a start'); return first.promise.then(() => log.push('a end')) })
        const b = queue.run(() => { log.push('b start'); return Promise.resolve() })
        await Promise.resolve()
        expect(log).toEqual(['a start'])
        first.resolve()
        await Promise.all([a, b])
        expect(log).toEqual(['a start', 'a end', 'b start'])
    })

    it('keeps going after a failed task', async () => {
        const queue = new SaveQueue()
        const failed = queue.run(() => Promise.reject(httpError(404)))
        const next = queue.run(() => Promise.resolve('ok'))
        await expect(failed).rejects.toMatchObject({ status: 404 })
        await expect(next).resolves.toBe('ok')
    })

    it('debounces a burst of scheduled writes into one, using the last task', async () => {
        const queue = new SaveQueue({ debounceMs: 400 })
        const calls = []
        queue.schedule('page:1', () => { calls.push(1); return Promise.resolve() })
        vi.advanceTimersByTime(200)
        queue.schedule('page:1', () => { calls.push(2); return Promise.resolve() })
        vi.advanceTimersByTime(200)
        queue.schedule('page:1', () => { calls.push(3); return Promise.resolve() })
        expect(queue.pending).toBe(1)
        vi.advanceTimersByTime(400)
        await queue.idle()
        expect(calls).toEqual([3])
        expect(queue.pending).toBe(0)
    })

    it('keeps one debounced write per key', async () => {
        const queue = new SaveQueue()
        const calls = []
        queue.schedule('page:1', () => { calls.push('p1'); return Promise.resolve() })
        queue.schedule('page:2', () => { calls.push('p2'); return Promise.resolve() })
        await queue.flush()
        expect(calls.sort()).toEqual(['p1', 'p2'])
    })

    it('flush() sends pending writes before the tasks run after it', async () => {
        const queue = new SaveQueue()
        const log = []
        queue.schedule('page:1', () => { log.push('caption'); return Promise.resolve() })
        queue.flush()
        await queue.run(() => { log.push('delete page'); return Promise.resolve() })
        expect(log).toEqual(['caption', 'delete page'])
    })

    it('cancel() drops a debounced write', async () => {
        const queue = new SaveQueue()
        const task = vi.fn(() => Promise.resolve())
        queue.schedule('page:1', task)
        queue.cancel('page:1')
        vi.advanceTimersByTime(10000)
        await queue.idle()
        expect(task).not.toHaveBeenCalled()
        expect(queue.pending).toBe(0)
    })

    it('retries transient failures, then succeeds', async () => {
        const queue = new SaveQueue({ retryDelaysMs: [10, 20] })
        let attempts = 0
        const result = queue.run(() => (++attempts < 3 ? Promise.reject(httpError(423)) : Promise.resolve('saved')))
        await vi.runAllTimersAsync()
        await expect(result).resolves.toBe('saved')
        expect(attempts).toBe(3)
    })

    it('does not repeat a non-idempotent write after a gateway error', async () => {
        const queue = new SaveQueue({ retryDelaysMs: [10] })
        let attempts = 0
        await expect(queue.run(() => { attempts++; return Promise.reject(httpError(504)) })).rejects.toBeTruthy()
        expect(attempts).toBe(1)
    })

    it('retries debounced writes, which are idempotent, after a gateway error', async () => {
        const queue = new SaveQueue({ retryDelaysMs: [10] })
        let attempts = 0
        queue.schedule('page:1', () => (++attempts < 2 ? Promise.reject(httpError(504)) : Promise.resolve()))
        queue.flush()
        await vi.runAllTimersAsync()
        await queue.idle()
        expect(attempts).toBe(2)
    })

    it('gives up after the last retry', async () => {
        const queue = new SaveQueue({ retryDelaysMs: [10] })
        let attempts = 0
        const result = queue.run(() => { attempts++; return Promise.reject(httpError(503)) }, { idempotent: true })
        const assertion = expect(result).rejects.toMatchObject({ status: 503 })
        await vi.runAllTimersAsync()
        await assertion
        expect(attempts).toBe(2)
    })

    it('does not retry real failures', async () => {
        const queue = new SaveQueue({ retryDelaysMs: [10] })
        let attempts = 0
        await expect(queue.run(() => { attempts++; return Promise.reject(httpError(404)) })).rejects.toBeTruthy()
        expect(attempts).toBe(1)
    })

    it('reports failed debounced writes to onError with their key', async () => {
        const onError = vi.fn()
        const queue = new SaveQueue({ onError, retryDelaysMs: [] })
        queue.schedule('page:9', () => Promise.reject(httpError(404)))
        await queue.flush()
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }), 'page:9')
    })

    it('reports the pending count on every change', async () => {
        const counts = []
        const queue = new SaveQueue({ onChange: n => counts.push(n) })
        queue.schedule('page:1', () => Promise.resolve())
        await queue.flush()
        expect(counts[0]).toBe(1)
        expect(counts[counts.length - 1]).toBe(0)
    })
})
