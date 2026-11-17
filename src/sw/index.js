/**
 * Service worker of Souvenirs (issue #22): lets the app start and show the
 * albums kept on the device when the server cannot be reached. Built as one
 * classic script (vite.sw.config.js) and served by PageController, so its
 * scope is the app's own URL space. The logic lives in handlers.js.
 */

import { route, warmShell, recordShellUse, readForced, writeForced } from './handlers.js'

// Whether the user chose to work offline (see connectivity.js): told by the
// page, kept in a cache for the next start of the worker. null until read.
let forced = null

function env() {
    return {
        caches: self.caches,
        fetch: (request, init) => self.fetch(request, init),
        origin: self.location.origin,
        // the registration scope is the app's base URL, trailing slash included
        appPath: new URL(self.registration.scope).pathname,
        forced: forced === true,
    }
}

const forcedRead = readForced(env()).then(stored => {
    if (forced == null) {
        // not told by the page meanwhile
        forced = stored
    }
})

// Shell entries used since the last write of the usage record.
const used = new Set()
let usageTimer = null

function noteUse(url) {
    used.add(url)
    if (usageTimer == null) {
        usageTimer = setTimeout(() => {
            usageTimer = null
            const urls = [...used]
            used.clear()
            recordShellUse(urls, env()).catch(() => {})
        }, 10000)
    }
}

self.addEventListener('install', () => {
    // nothing is precached: take over as soon as possible
    self.skipWaiting()
})

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
    if (forced == null) {
        // the worker just started: the choice is being read, and whether to
        // answer at all must be decided right now - so answer, with what
        // the browser would have done when the request is not ours
        event.respondWith(forcedRead.then(() => route(event.request, env(), noteUse) || self.fetch(event.request)))
        return
    }
    const response = route(event.request, env(), noteUse)
    if (response != null) {
        event.respondWith(response)
    }
})

self.addEventListener('message', event => {
    const data = event.data || {}
    if (data.type === 'warm') {
        if (forced !== true) {
            event.waitUntil(warmShell(data.urls, env()))
        }
    } else if (data.type === 'forced') {
        forced = data.value === true
        const port = event.ports && event.ports[0]
        event.waitUntil(writeForced(env(), forced).catch(() => {}).then(() => {
            if (port) {
                port.postMessage({ type: 'forced', value: forced })
            }
        }))
    }
})
