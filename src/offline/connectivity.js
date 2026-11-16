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
 */

import { reactive } from 'vue'
import { generateUrl } from '@nextcloud/router'

const PROBE_DELAYS_MS = [5000, 15000, 30000, 60000]

/** Reactive: `online` can be used in templates and watchers. */
export const connectivity = reactive({
    online: !(globalThis.navigator && globalThis.navigator.onLine === false),
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
    scheduleProbe()
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
    globalThis.addEventListener('online', async () => {
        // the interface is back; the server may not be (captive portal...)
        if (await refreshToken()) {
            reportOnline()
        } else {
            reportOffline()
        }
    })
}

if (!connectivity.online) {
    scheduleProbe()
}
