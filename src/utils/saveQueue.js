/**
 * Serialized, debounced persistence of edit-mode changes (issue #50).
 *
 * Until now every edit blocked the whole page behind an overlay until its
 * request chain settled: safe, but on a slow server each caption keystroke
 * batch, resize or pan/zoom froze the editor for the duration of a full
 * album.json rewrite. This queue keeps the safety without the freeze:
 *
 * - run(task): tasks run one at a time, in submission order, so two writes
 *   of the same album are never in flight together (each one rewrites the
 *   whole album.json server-side) and their order is the user's order.
 * - schedule(key, task): debounced writes, typically one key per page. A
 *   burst of edits on a page (typing, dragging a corner, wheel zooming)
 *   becomes one request; the task should read the latest local state when
 *   it runs, so nothing is lost by dropping the earlier ones.
 * - flush(): sends every debounced write now. Structural actions (delete a
 *   page, move an element to another page) call it first, so pending edits
 *   reach the server before them, in order.
 * - Transient failures (423 album busy, 502/503/504, network errors) are
 *   retried a few times; other failures reject run(), or are reported to
 *   onError for debounced writes.
 */

export const DEFAULT_DEBOUNCE_MS = 400
export const DEFAULT_RETRY_DELAYS_MS = [300, 1000, 3000]

/**
 * Whether a failed request is worth retrying as is. Errors from
 * albumApi.js carry the HTTP status; fetch() itself rejects with a
 * TypeError when the network fails.
 *
 * @param {Error} error
 * @returns {boolean}
 */
export function isRetryable(error) {
    if (error == null) {
        return false
    }
    if (error.status === undefined) {
        return error instanceof TypeError
    }
    return error.status === 423 || error.status === 502 || error.status === 503 || error.status === 504
}

export class SaveQueue {
    /**
     * @param {object} options
     * @param {number} [options.debounceMs] - delay of schedule()
     * @param {number[]} [options.retryDelaysMs] - waits before each retry
     * @param {Function} [options.onError] - (error, key) for failed debounced writes
     * @param {Function} [options.onChange] - (pending) whenever the pending count changes
     * @param {Function} [options.setTimer] - injectable setTimeout (tests)
     * @param {Function} [options.clearTimer] - injectable clearTimeout (tests)
     */
    constructor({
        debounceMs = DEFAULT_DEBOUNCE_MS,
        retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
        onError = () => {},
        onChange = () => {},
        setTimer = (fn, ms) => setTimeout(fn, ms),
        clearTimer = (id) => clearTimeout(id),
    } = {}) {
        this.debounceMs = debounceMs
        this.retryDelaysMs = retryDelaysMs
        this.onError = onError
        this.onChange = onChange
        this.setTimer = setTimer
        this.clearTimer = clearTimer
        this.chain = Promise.resolve()
        this.queued = 0
        this.timers = new Map()
    }

    /** Number of writes not yet settled: queued, running or debounced. */
    get pending() {
        return this.queued + this.timers.size
    }

    notify() {
        this.onChange(this.pending)
    }

    /**
     * Run `task` after every task submitted before it.
     *
     * @param {Function} task - () => Promise
     * @returns {Promise} the task's result, after retries
     */
    run(task) {
        return this.enqueue(task, null)
    }

    /**
     * @param {Function} task - () => Promise
     * @param {Function|null} report - when set, failures are handed to it
     *        (inside the queue, before idle() resolves) instead of rejecting
     */
    enqueue(task, report) {
        this.queued++
        this.notify()
        const result = this.chain.then(() => this.attempt(task, 0))
        // A failure must not stop the tasks queued after it.
        const settled = result.then(() => {}, error => {
            if (report) {
                report(error)
            }
        })
        this.chain = settled.then(() => {
            this.queued--
            this.notify()
        })
        return report ? settled : result
    }

    async attempt(task, retry) {
        try {
            return await task()
        } catch (error) {
            if (isRetryable(error) && retry < this.retryDelaysMs.length) {
                await new Promise(resolve => this.setTimer(resolve, this.retryDelaysMs[retry]))
                return this.attempt(task, retry + 1)
            }
            throw error
        }
    }

    /**
     * Debounced run(): `task` runs once no other task was scheduled under
     * the same key for `debounceMs`. Only the last task of a burst runs.
     *
     * @param {string} key - e.g. "page:<id>"
     * @param {Function} task - () => Promise
     */
    schedule(key, task) {
        const existing = this.timers.get(key)
        if (existing) {
            this.clearTimer(existing.timer)
        }
        const timer = this.setTimer(() => this.fire(key), this.debounceMs)
        this.timers.set(key, { timer, task })
        this.notify()
    }

    fire(key) {
        const entry = this.timers.get(key)
        if (!entry) {
            return
        }
        this.timers.delete(key)
        this.enqueue(entry.task, error => this.onError(error, key))
    }

    /** Drop a debounced write, e.g. of a page that is being deleted. */
    cancel(key) {
        const entry = this.timers.get(key)
        if (entry) {
            this.clearTimer(entry.timer)
            this.timers.delete(key)
            this.notify()
        }
    }

    /**
     * Queue every debounced write now, in scheduling order. Tasks run()
     * afterwards are guaranteed to run after them.
     *
     * @returns {Promise} resolves once the queue is idle
     */
    flush() {
        for (const [key, entry] of [...this.timers.entries()]) {
            this.clearTimer(entry.timer)
            this.fire(key)
        }
        return this.idle()
    }

    /** @returns {Promise} resolves when nothing is queued nor running */
    async idle() {
        while (this.queued > 0) {
            await this.chain
        }
    }
}
