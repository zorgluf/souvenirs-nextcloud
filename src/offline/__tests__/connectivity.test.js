import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Whether the server is to be used (issue #22): what the requests report,
// and the user's choice to work offline. The module keeps its state for the
// life of the page, so each test loads it anew.

const FORCED_KEY = 'souvenirs-offline-forced'

let serverUp
let worker
// window listeners of the loaded module, removed after each test: those of
// a previous load would otherwise keep reacting
let registered = []

async function load() {
    vi.resetModules()
    const add = globalThis.addEventListener
    globalThis.addEventListener = function(type, listener, options) {
        registered.push([type, listener])
        return add.call(this, type, listener, options)
    }
    try {
        return await import('../connectivity.js')
    } finally {
        globalThis.addEventListener = add
    }
}

function csrfCalls() {
    return globalThis.fetch.mock.calls.filter(call => String(call[0]).includes('/csrftoken')).length
}

beforeEach(() => {
    globalThis.localStorage.clear()
    serverUp = true
    vi.stubGlobal('fetch', vi.fn(async () => {
        if (!serverUp) {
            throw new TypeError('Failed to fetch')
        }
        return new Response(JSON.stringify({ token: 'fresh' }))
    }))
    // a service worker in control, acknowledging what it is told
    worker = { postMessage: vi.fn((message, ports) => ports[0].postMessage({ ok: true })) }
    Object.defineProperty(globalThis.navigator, 'serviceWorker', { configurable: true, value: { controller: worker } })
})

afterEach(() => {
    for (const [type, listener] of registered) {
        globalThis.removeEventListener(type, listener)
    }
    registered = []
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete globalThis.navigator.serviceWorker
})

describe('working offline by choice', () => {
    it('starts connected, with the choice off', async () => {
        const { connectivity } = await load()
        expect(connectivity.forced).toBe(false)
        expect(connectivity.online).toBe(true)
    })

    it('treats the server as unreachable, and tells the service worker', async () => {
        const { connectivity, setForcedOffline } = await load()
        expect(await setForcedOffline(true)).toBe(false)
        expect(connectivity.forced).toBe(true)
        expect(connectivity.online).toBe(false)
        expect(globalThis.localStorage.getItem(FORCED_KEY)).toBe('1')
        expect(worker.postMessage.mock.calls[0][0]).toEqual({ type: 'forced', value: true })
        expect(csrfCalls()).toBe(0)
    })

    it('ignores what requests report, and never probes the server', async () => {
        vi.useFakeTimers()
        const { connectivity, setForcedOffline, reportOnline, reportOffline, refreshToken } = await load()
        await setForcedOffline(true)
        // a request sent before the choice comes back
        reportOnline()
        expect(connectivity.online).toBe(false)
        reportOffline()
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
        expect(await refreshToken()).toBe(false)
        expect(csrfCalls()).toBe(0)
        expect(connectivity.online).toBe(false)
    })

    it('stays offline when the network interface comes back', async () => {
        const { connectivity, setForcedOffline } = await load()
        await setForcedOffline(true)
        globalThis.dispatchEvent(new Event('online'))
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(connectivity.online).toBe(false)
        expect(csrfCalls()).toBe(0)
    })

    it('survives a reload of the page', async () => {
        const first = await load()
        await first.setForcedOffline(true)
        const { connectivity } = await load()
        expect(connectivity.forced).toBe(true)
        expect(connectivity.online).toBe(false)
    })

    it('goes back online: the worker first, then the server, then the listeners', async () => {
        const { connectivity, setForcedOffline, onReconnect } = await load()
        await setForcedOffline(true)
        const reconnected = vi.fn()
        onReconnect(reconnected)
        const order = []
        worker.postMessage.mockImplementation((message, ports) => {
            order.push('worker:' + message.value)
            ports[0].postMessage({ ok: true })
        })
        globalThis.fetch.mockImplementation(async () => {
            order.push('server')
            return new Response(JSON.stringify({ token: 'fresh' }))
        })
        expect(await setForcedOffline(false)).toBe(true)
        expect(order).toEqual(['worker:false', 'server'])
        expect(connectivity.forced).toBe(false)
        expect(connectivity.online).toBe(true)
        expect(globalThis.localStorage.getItem(FORCED_KEY)).toBeNull()
        expect(reconnected).toHaveBeenCalledTimes(1)
    })

    it('goes back to probing when the server does not answer', async () => {
        vi.useFakeTimers()
        const { connectivity, setForcedOffline, onReconnect } = await load()
        await setForcedOffline(true)
        const reconnected = vi.fn()
        onReconnect(reconnected)
        serverUp = false
        expect(await setForcedOffline(false)).toBe(false)
        expect(connectivity.forced).toBe(false)
        expect(connectivity.online).toBe(false)
        serverUp = true
        await vi.advanceTimersByTimeAsync(6000)
        expect(connectivity.online).toBe(true)
        expect(reconnected).toHaveBeenCalledTimes(1)
    })

    it('works without a service worker', async () => {
        delete globalThis.navigator.serviceWorker
        const { connectivity, setForcedOffline, syncForcedOffline } = await load()
        await setForcedOffline(true)
        expect(connectivity.online).toBe(false)
        expect(await syncForcedOffline()).toBe(false)
        expect(await setForcedOffline(false)).toBe(true)
    })

    it('tells the worker the choice kept on this device at start-up', async () => {
        globalThis.localStorage.setItem(FORCED_KEY, '1')
        const { syncForcedOffline } = await load()
        expect(await syncForcedOffline()).toBe(true)
        expect(worker.postMessage.mock.calls[0][0]).toEqual({ type: 'forced', value: true })
    })

    it('follows the choice made in another tab', async () => {
        const { connectivity } = await load()
        const change = newValue => {
            const event = new Event('storage')
            event.key = FORCED_KEY
            event.newValue = newValue
            globalThis.dispatchEvent(event)
        }
        change('1')
        expect(connectivity.forced).toBe(true)
        expect(connectivity.online).toBe(false)
        change(null)
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(connectivity.forced).toBe(false)
        expect(connectivity.online).toBe(true)
    })
})
