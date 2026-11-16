/**
 * Service worker of Souvenirs (issue #22): lets the app start and show the
 * albums kept on the device when the server cannot be reached. Built as one
 * classic script (vite.sw.config.js) and served by PageController, so its
 * scope is the app's own URL space. The logic lives in handlers.js.
 */

import { route, warmShell, recordShellUse } from './handlers.js'

function env() {
    return {
        caches: self.caches,
        fetch: (request, init) => self.fetch(request, init),
        origin: self.location.origin,
        // the registration scope is the app's base URL, trailing slash included
        appPath: new URL(self.registration.scope).pathname,
    }
}

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
    const response = route(event.request, env(), noteUse)
    if (response != null) {
        event.respondWith(response)
    }
})

self.addEventListener('message', event => {
    const data = event.data || {}
    if (data.type === 'warm') {
        event.waitUntil(warmShell(data.urls, env()))
    }
})
