/**
 * Addressing of the offline media copies (issue #22), shared by the page and
 * the service worker: both must derive the very same cache key for a medium,
 * so this module is dependency-free and bundled into each of them.
 *
 * An album medium is identified by the album folder (path relative to the
 * user's files root) and the asset file name. The page requests it as
 *   <app>/preview?apath=<album>&file=<name>[&width=..&height=..]   (images)
 *   <app>/asset?apath=<album>&file=<name>                          (raw bytes)
 * Whatever the size asked, one copy per medium is kept, under a synthetic
 * same-origin URL that never reaches the network.
 */

/** Offline copies of the media of albums made available offline. */
export const MEDIA_CACHE = 'souvenirs-media-v1'
/** Media added on this device that are not on the server yet. */
export const PENDING_CACHE = 'souvenirs-pending-v1'
/** The app shell: host page, scripts, styles, fonts, icons. */
export const SHELL_CACHE = 'souvenirs-shell-v1'

const KEY_ROOT = '/__souvenirs-offline__/'

/**
 * Album path without empty segments nor surrounding slashes, so that
 * "/Souvenirs/a", "Souvenirs/a/" and "Souvenirs//a" are the same album.
 *
 * @param {string} path
 * @returns {string}
 */
export function normalizePath(path) {
    return String(path == null ? '' : path).split('/').filter(segment => segment !== '').join('/')
}

/**
 * File name of an asset reference ("data/<uuid>.jpg" -> "<uuid>.jpg").
 *
 * @param {string} asset
 * @returns {string}
 */
export function assetFile(asset) {
    return String(asset == null ? '' : asset).split('/').pop()
}

/**
 * Cache key prefix of every medium of an album.
 *
 * @param {string} origin - e.g. "https://cloud.example.com"
 * @param {string} path - the album folder
 * @returns {string}
 */
export function albumKeyPrefix(origin, path) {
    return origin + KEY_ROOT + encodeURIComponent(normalizePath(path)) + '/'
}

/**
 * Cache key of one medium of an album.
 *
 * @param {string} origin
 * @param {string} path - the album folder
 * @param {string} file - the asset file name (or an asset reference)
 * @returns {string}
 */
export function mediaKey(origin, path, file) {
    return albumKeyPrefix(origin, path) + encodeURIComponent(assetFile(file))
}

/**
 * Whether `url` asks for a medium of one of the user's albums, and which.
 * Public share media (<app>/public/<token>/preview) are not: they carry no
 * album path and are never available offline.
 *
 * @param {URL} url - the requested URL
 * @param {string} appPath - the app's base path, with a trailing slash
 * @returns {{path: string, file: string, raw: boolean}|null}
 */
export function parseMediaRequest(url, appPath) {
    if (!url.pathname.startsWith(appPath)) {
        return null
    }
    const route = url.pathname.slice(appPath.length)
    if (route !== 'preview' && route !== 'asset') {
        return null
    }
    const path = url.searchParams.get('apath')
    const file = url.searchParams.get('file')
    if (!path || !file) {
        return null
    }
    return { path: normalizePath(path), file: assetFile(file), raw: route === 'asset' }
}

/**
 * Resolve a single-range "Range" request header against a body size.
 *
 * @param {string|null} header - e.g. "bytes=0-1023", "bytes=500-", "bytes=-200"
 * @param {number} size - total size of the body, in bytes
 * @returns {{start: number, end: number}|null} inclusive bounds, or null when
 *          the header is absent, malformed or not satisfiable
 */
export function parseRange(header, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(header == null ? '' : header).trim())
    if (match == null || (match[1] === '' && match[2] === '') || size <= 0) {
        return null
    }
    let start
    let end
    if (match[1] === '') {
        // suffix range: the last N bytes
        const length = Number(match[2])
        if (length === 0) {
            return null
        }
        start = Math.max(0, size - length)
        end = size - 1
    } else {
        start = Number(match[1])
        end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
    }
    if (start > end || start >= size) {
        return null
    }
    return { start, end }
}
