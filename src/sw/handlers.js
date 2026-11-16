/**
 * Request handling of the service worker (issue #22), kept free of the
 * worker globals so it can be unit-tested: everything it needs comes in
 * through `env` = { caches, fetch, origin, appPath }.
 *
 * The worker changes nothing while the server answers: every request goes
 * to the network first. It only steps in when the network fails, with
 * - the app shell (host page, scripts, styles, fonts, icons), so the app
 *   can start without a connection;
 * - the media of albums made available offline, and those added on this
 *   device that are not uploaded yet.
 * Album data (the API) is never served from here: the page keeps it in
 * IndexedDB and decides by itself.
 */

import { MEDIA_CACHE, PENDING_CACHE, SHELL_CACHE, mediaKey, parseMediaRequest, parseRange } from '../offline/mediaKeys.js'

/** Shell entries not used for this long are dropped (old releases). */
export const SHELL_MAX_AGE_MS = 45 * 24 * 3600 * 1000

const SHELL_DESTINATIONS = ['script', 'style', 'font', 'image', 'manifest', 'worker']
// Same-origin GETs that look static but are not part of the shell.
const NOT_SHELL = /\/(remote|public)\.php\/|\/ocs\/|\/preview\b|\/thumbnail\b|\/apiv2\/|\/csrftoken\b|\/avatar\//

/** Cache key of the host page, whatever route it was served for. */
export function shellPageKey(env) {
    return env.origin + env.appPath + '__shell-page__'
}

function shellUsageKey(env) {
    return env.origin + env.appPath + '__shell-usage__'
}

/**
 * Whether `url` is a page of the app that the shell can render: the album
 * list and the album view. Public shares are not (no offline for them).
 *
 * @param {URL} url
 * @param {object} env
 * @returns {boolean}
 */
export function isAppPage(url, env) {
    if (url.origin !== env.origin) {
        return false
    }
    const path = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/'
    return path === env.appPath || path === env.appPath + 'show/'
}

/**
 * Whether a same-origin GET belongs to the app shell.
 *
 * @param {{destination: string}} request
 * @param {URL} url
 * @param {object} env
 * @returns {boolean}
 */
export function isShellResource(request, url, env) {
    return url.origin === env.origin
        && SHELL_DESTINATIONS.includes(request.destination)
        && !NOT_SHELL.test(url.pathname)
}

/** URLs carrying Nextcloud's version parameter never change content. */
function isVersioned(url) {
    return url.searchParams.has('v')
}

function isHtml(response) {
    return (response.headers.get('Content-Type') || '').includes('text/html')
}

async function putQuietly(cache, key, response) {
    try {
        await cache.put(key, response)
    } catch (error) {
        // out of space, or a response that cannot be stored (206, Vary: *)
    }
}

/**
 * Answer of last resort when the app was never loaded with the worker in
 * place: there is no shell to start from yet.
 */
function noShellResponse() {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8">'
        + '<meta name="viewport" content="width=device-width, initial-scale=1">'
        + '<title>Souvenirs</title></head>'
        + '<body style="font-family:sans-serif;text-align:center;padding:3em 1em">'
        + '<h2>Souvenirs</h2>'
        + '<p>No connection, and Souvenirs has not been prepared for offline use on this device yet.</p>'
        + '<p>Open it once while connected, then it will also start offline.</p>'
        + '</body></html>'
    return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

/**
 * A page of the app: from the server, which also refreshes the shell page;
 * from the shell when the server cannot be reached.
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function handlePage(request, env) {
    const cache = await env.caches.open(SHELL_CACHE)
    try {
        const response = await env.fetch(request)
        // not the login page a lost session redirects to, nor an error page
        if (response.ok && !response.redirected && isHtml(response)) {
            await putQuietly(cache, shellPageKey(env), response.clone())
        }
        return response
    } catch (error) {
        return (await cache.match(shellPageKey(env))) || noShellResponse()
    }
}

/**
 * A script, style, font or icon. Versioned URLs are immutable: served from
 * the shell when there, without a round trip. The others come from the
 * server whenever it answers.
 *
 * @param {Request} request
 * @param {object} env
 * @param {Function} [used] - (url) records the use of a shell entry
 * @returns {Promise<Response>}
 */
export async function handleShellResource(request, env, used = () => {}) {
    const cache = await env.caches.open(SHELL_CACHE)
    const url = new URL(request.url)
    used(request.url)
    if (isVersioned(url)) {
        const cached = await cache.match(request)
        if (cached) {
            return cached
        }
    }
    try {
        const response = await env.fetch(request)
        if (response.ok && response.status === 200 && response.type === 'basic') {
            await putQuietly(cache, request, response.clone())
        }
        return response
    } catch (error) {
        const cached = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }))
        if (cached) {
            return cached
        }
        throw error
    }
}

/**
 * Serve a stored medium, honouring a Range request: media elements (and
 * Safari for any video) ask for byte ranges and need a 206 answer.
 *
 * @param {Response} stored
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function respondWithStored(stored, request) {
    const range = request.headers.get('Range')
    if (!range) {
        return stored
    }
    const blob = await stored.blob()
    const bounds = parseRange(range, blob.size)
    if (bounds == null) {
        return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + blob.size } })
    }
    return new Response(blob.slice(bounds.start, bounds.end + 1), {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            'Content-Type': stored.headers.get('Content-Type') || 'application/octet-stream',
            'Content-Range': 'bytes ' + bounds.start + '-' + bounds.end + '/' + blob.size,
            'Content-Length': String(bounds.end - bounds.start + 1),
            'Accept-Ranges': 'bytes',
        },
    })
}

/**
 * A medium of an album. In order: the bytes waiting for their upload (the
 * server does not have them), the server, the offline copy.
 *
 * @param {Request} request
 * @param {{path: string, file: string}} medium - see parseMediaRequest
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function handleMedia(request, medium, env) {
    const key = mediaKey(env.origin, medium.path, medium.file)
    const pending = await (await env.caches.open(PENDING_CACHE)).match(key)
    if (pending) {
        return respondWithStored(pending, request)
    }
    const offlineCopy = async () => (await env.caches.open(MEDIA_CACHE)).match(key)
    let response
    try {
        response = await env.fetch(request)
    } catch (error) {
        const stored = await offlineCopy()
        return stored ? respondWithStored(stored, request) : new Response(null, { status: 503, statusText: 'Offline' })
    }
    // an error, or the login page of a lost session: the copy is better
    if (!response.ok || response.redirected) {
        const stored = await offlineCopy()
        if (stored) {
            return respondWithStored(stored, request)
        }
    }
    return response
}

/**
 * Dispatch a fetch event's request: the response to give, or null to let
 * the browser handle it as if there were no worker.
 *
 * @param {Request} request
 * @param {object} env
 * @param {Function} [used] - see handleShellResource
 * @returns {Promise<Response>|null}
 */
export function route(request, env, used) {
    if (request.method !== 'GET') {
        return null
    }
    const url = new URL(request.url)
    if (url.origin !== env.origin) {
        return null
    }
    const medium = parseMediaRequest(url, env.appPath)
    if (medium != null) {
        return handleMedia(request, medium, env)
    }
    if (request.mode === 'navigate') {
        return isAppPage(url, env) ? handlePage(request, env) : null
    }
    if (isShellResource(request, url, env)) {
        return handleShellResource(request, env, used)
    }
    return null
}

/**
 * Put the page and the resources it loaded into the shell: the very first
 * load happened before the worker took control, so nothing was kept.
 *
 * @param {string[]} urls - resources the page loaded
 * @param {object} env
 */
export async function warmShell(urls, env) {
    const cache = await env.caches.open(SHELL_CACHE)
    try {
        const page = await env.fetch(env.origin + env.appPath, { credentials: 'same-origin' })
        if (page.ok && !page.redirected && isHtml(page)) {
            await putQuietly(cache, shellPageKey(env), page)
        }
    } catch (error) {
        // offline already: the next online load fills the shell
    }
    for (const raw of urls || []) {
        let url
        try {
            url = new URL(raw, env.origin)
        } catch (error) {
            continue
        }
        if (url.origin !== env.origin || NOT_SHELL.test(url.pathname)
            || parseMediaRequest(url, env.appPath) != null || (await cache.match(url.href))) {
            continue
        }
        try {
            const response = await env.fetch(url.href, { credentials: 'same-origin' })
            if (response.ok && response.status === 200 && !response.redirected) {
                await putQuietly(cache, url.href, response)
            }
        } catch (error) {
            // skipped: fetched again the next time the page loads it
        }
    }
}

/**
 * Record when shell entries were last used, and drop those that were not
 * for SHELL_MAX_AGE_MS: each Nextcloud or app upgrade leaves the previous
 * release's files behind.
 *
 * @param {string[]} urls - entries used since the last call
 * @param {object} env
 * @param {number} [now]
 */
export async function recordShellUse(urls, env, now = Date.now()) {
    const cache = await env.caches.open(SHELL_CACHE)
    let usage = {}
    try {
        const stored = await cache.match(shellUsageKey(env))
        usage = stored ? await stored.json() : {}
    } catch (error) {
        usage = {}
    }
    for (const url of urls) {
        usage[url] = now
    }
    const reserved = [shellPageKey(env), shellUsageKey(env)]
    for (const request of await cache.keys()) {
        if (reserved.includes(request.url)) {
            continue
        }
        if (usage[request.url] == null) {
            // stored before usage was tracked: starts ageing now
            usage[request.url] = now
        } else if (now - usage[request.url] > SHELL_MAX_AGE_MS) {
            await cache.delete(request)
            delete usage[request.url]
        }
    }
    await putQuietly(cache, shellUsageKey(env), new Response(JSON.stringify(usage), {
        headers: { 'Content-Type': 'application/json' },
    }))
}
