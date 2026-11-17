/**
 * Whether the Nextcloud server can be reached (issue #22).
 *
 * navigator.onLine only says the device has a network interface up; what
 * matters here is the server answering. So the state also follows what the
 * requests themselves report (reportOffline / reportOnline), and while
 * offline the server is probed with a growing delay until it answers again.
 *
 * The probe is Nextcloud's CSRF token endpoint: reachable without a session,
 * and its answer is useful - a page restored from the offline shell holds a
 * stale token, which uploads over WebDAV would be refused for.
 *
 * The user can also choose to work offline (`forced`), e.g. on a slow or
 * paid network: the server is then treated as unreachable whatever the
 * network says, nothing probes it, and the service worker - told of the
 * choice - lets no request leave the device. The choice is kept per device.
 */

import { reactive } from 'vue'
import { generateUrl } from '@nextcloud/router'

const PROBE_DELAYS_MS = [5000, 15000, 30000, 60000]

const FORCED_KEY = 'souvenirs-offline-forced'
/** How long the service worker is given to acknowledge the choice. */
const WORKER_ACK_MS = 2000

function storedForced() {
    try {
        return globalThis.localStorage.getItem(FORCED_KEY) === '1'
    } catch (error) {
        // no storage (private mode, tests): the choice lasts for the page
        return false
    }
}

function storeForced(forced) {
    try {
        if (forced) {
            globalThis.localStorage.setItem(FORCED_KEY, '1')
        } else {
            globalThis.localStorage.removeItem(FORCED_KEY)
        }
    } catch (error) {
        // see storedForced
    }
}

function interfaceUp() {
    return !(globalThis.navigator && globalThis.navigator.onLine === false)
}

const initiallyForced = storedForced()

/**
 * Reactive: can be used in templates and watchers.
 * - `online`: whether the server is to be used - false while `forced`;
 * - `forced`: whether the user chose to work offline.
 */
export const connectivity = reactive({
    online: !initiallyForced && interfaceUp(),
    forced: initiallyForced,
})

const listeners = new Set()
let probeTimer = null
let probeAttempt = 0

/**
 * Hand a fresh CSRF token to Nextcloud's own token holder (@nextcloud/auth
 * listens on the global event bus), so OC.requestToken returns it.
 */
function publishToken(token) {
    try {
        if (globalThis._nc_event_bus && typeof token === 'string' && token !== '') {
            globalThis._nc_event_bus.emit('csrf-token-update', { token })
        }
    } catch (error) {
        // no event bus (tests, very old server): the page token stays
    }
}

/**
 * Ask the server for a fresh CSRF token. Resolves to whether it answered.
 *
 * @returns {Promise<boolean>}
 */
export async function refreshToken() {
    if (connectivity.forced) {
        return false
    }
    try {
        const response = await fetch(generateUrl('/csrftoken'), { cache: 'no-store', credentials: 'same-origin' })
        if (!response.ok) {
            // The server answered: it is reachable, whatever it said - except
            // through a gateway that gave up or in maintenance mode, which
            // requests treat as unreachable too (see remote.js errorKind).
            return ![502, 503, 504].includes(response.status)
        }
        const data = await response.json()
        publishToken(data && data.token)
        return true
    } catch (error) {
        return false
    }
}

function stopProbing() {
    if (probeTimer != null) {
        clearTimeout(probeTimer)
        probeTimer = null
    }
    probeAttempt = 0
}

function scheduleProbe() {
    if (probeTimer != null) {
        return
    }
    const delay = PROBE_DELAYS_MS[Math.min(probeAttempt, PROBE_DELAYS_MS.length - 1)]
    probeAttempt++
    probeTimer = setTimeout(async () => {
        probeTimer = null
        if (await refreshToken()) {
            reportOnline()
        } else {
            scheduleProbe()
        }
    }, delay)
}

/** A request reached the server. */
export function reportOnline() {
    if (connectivity.forced) {
        // a request sent before the user chose to work offline
        return
    }
    stopProbing()
    if (!connectivity.online) {
        connectivity.online = true
        for (const listener of [...listeners]) {
            try {
                listener()
            } catch (error) {
                console.error('souvenirs: connectivity listener failed', error)
            }
        }
    }
}

/** A request could not reach the server. */
export function reportOffline() {
    connectivity.online = false
    if (!connectivity.forced) {
        scheduleProbe()
    }
}

/** Whether the server answers, now that it may be asked again. */
async function reconnect() {
    if (interfaceUp() && await refreshToken()) {
        reportOnline()
    } else {
        reportOffline()
    }
    return connectivity.online
}

/**
 * Tell the service worker whether requests may leave the device. Resolves
 * to whether it acknowledged - false without a worker in control.
 *
 * @param {boolean} forced
 * @returns {Promise<boolean>}
 */
function tellWorker(forced) {
    const container = globalThis.navigator && globalThis.navigator.serviceWorker
    const worker = container && container.controller
    if (!worker || typeof globalThis.MessageChannel !== 'function') {
        return Promise.resolve(false)
    }
    return new Promise(resolve => {
        const channel = new globalThis.MessageChannel()
        const settle = acknowledged => {
            clearTimeout(timer)
            channel.port1.close()
            resolve(acknowledged)
        }
        const timer = setTimeout(() => settle(false), WORKER_ACK_MS)
        channel.port1.onmessage = () => settle(true)
        try {
            worker.postMessage({ type: 'forced', value: forced }, [channel.port2])
        } catch (error) {
            settle(false)
        }
    })
}

/**
 * Work offline by choice, or stop doing so. Going back online asks the
 * server right away: the reconnection listeners run when it answers, which
 * sends what was edited meanwhile.
 *
 * @param {boolean} forced
 * @returns {Promise<boolean>} whether the server is reachable afterwards
 */
export async function setForcedOffline(forced) {
    forced = !!forced
    connectivity.forced = forced
    storeForced(forced)
    if (forced) {
        stopProbing()
        connectivity.online = false
        await tellWorker(true)
        return false
    }
    // the worker first: it would block the request that asks the server
    await tellWorker(false)
    return reconnect()
}

/**
 * Bring the service worker in line with the choice kept on this device, at
 * start-up: they are stored apart (the worker restarts without the page)
 * and must not disagree - a worker blocking requests the page believes it
 * can send would look like a server that never answers.
 *
 * @returns {Promise<boolean>} whether the worker acknowledged
 */
export function syncForcedOffline() {
    return tellWorker(connectivity.forced)
}

/**
 * Run `listener` each time the server becomes reachable again.
 *
 * @param {Function} listener
 * @returns {Function} unsubscribe
 */
export function onReconnect(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

if (globalThis.addEventListener) {
    globalThis.addEventListener('offline', () => reportOffline())
    globalThis.addEventListener('online', () => {
        if (!connectivity.forced) {
            // the interface is back; the server may not be (captive portal...)
            reconnect()
        }
    })
    // the choice was changed in another tab of this browser: follow it
    globalThis.addEventListener('storage', event => {
        if (event.key !== FORCED_KEY) {
            return
        }
        const forced = event.newValue === '1'
        if (forced === connectivity.forced) {
            return
        }
        connectivity.forced = forced
        if (forced) {
            stopProbing()
            connectivity.online = false
        } else {
            reconnect()
        }
    })
}

if (!connectivity.online && !connectivity.forced) {
    scheduleProbe()
}
