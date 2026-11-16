/**
 * Offline copies of album media, in the Cache API (issue #22).
 *
 * Two caches (see mediaKeys.js), both read by the service worker when the
 * page asks for a medium:
 * - media:   copies of the media of albums the user made available offline.
 *            Only ever a cache: the server stays the source of truth.
 * - pending: media added on this device while the server was unreachable.
 *            The only copy until the next sync uploads them.
 *
 * Images are kept as one large preview each (what the fullscreen viewer
 * needs, far smaller than the camera original); what cannot be previewed is
 * kept as is: videos, audio tracks, drawings, animated GIFs, 360° panoramas.
 */

import { generateUrl } from '@nextcloud/router'
import { MEDIA_CACHE, PENDING_CACHE, mediaKey, albumKeyPrefix, assetFile, normalizePath } from './mediaKeys.js'

/** Bounding box of the image previews kept offline, in pixels. */
export const OFFLINE_PREVIEW_SIZE = 1600

// Size guesses for the estimate shown before a download (bytes).
const PREVIEW_ESTIMATE = 450 * 1024
const POSTER_ESTIMATE = 200 * 1024
const UNKNOWN_ESTIMATE = 2 * 1024 * 1024

const PANORAMA_MIME = 'application/vnd.google.panorama360+jpg'

/** The device is out of space for offline copies. */
export class QuotaError extends Error {
    constructor() {
        super('Not enough storage space for offline copies')
        this.name = 'QuotaError'
    }
}

function isQuotaError(error) {
    return error != null && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
}

function origin() {
    return globalThis.location.origin
}

function cacheStorage() {
    return globalThis.caches || null
}

/** Whether this browser can keep media offline at all. */
export function isSupported() {
    return cacheStorage() != null
}

function previewUrl(path, file, size) {
    return generateUrl('/apps/souvenirs/preview') + '?apath=' + encodeURIComponent('/' + path)
        + '&file=' + encodeURIComponent(file)
        + (size ? '&width=' + size + '&height=' + size : '')
}

function assetUrl(path, file) {
    return generateUrl('/apps/souvenirs/asset') + '?apath=' + encodeURIComponent('/' + path)
        + '&file=' + encodeURIComponent(file)
}

/**
 * What to download to make an album available offline: one entry per asset
 * file, with the URL to fetch it from and a size estimate.
 *
 * @param {object} record - the album record (path, info, pages)
 * @returns {Array<{file: string, url: string, estimate: number}>}
 */
export function albumMediaPlan(record) {
    const path = normalizePath(record.path)
    const plan = new Map()
    const add = (asset, raw, estimate) => {
        const file = assetFile(asset)
        if (file === '' || plan.has(file)) {
            return
        }
        plan.set(file, {
            file,
            url: raw ? assetUrl(path, file) : previewUrl(path, file, OFFLINE_PREVIEW_SIZE),
            estimate,
        })
    }
    for (const page of record.pages || []) {
        for (const element of page.elements || []) {
            const type = typeof element.class === 'string' ? element.class : ''
            const size = Number(element.size) > 0 ? Number(element.size) : 0
            if (type.endsWith('AudioElement')) {
                if (element.audio) {
                    add(element.audio, true, size || UNKNOWN_ESTIMATE)
                }
            } else if (type.endsWith('VideoElement')) {
                if (element.video) {
                    add(element.video, true, size || UNKNOWN_ESTIMATE)
                }
                if (element.image) {
                    add(element.image, false, POSTER_ESTIMATE)
                }
            } else if (element.image) {
                // drawings are reopened in the paint dialog, GIFs would lose
                // their animation and panoramas their projection: kept as is
                const raw = type.endsWith('PaintElement') || element.mime === 'image/gif'
                    || element.mime === PANORAMA_MIME
                add(element.image, raw, raw
                    ? (size || UNKNOWN_ESTIMATE)
                    : (size ? Math.min(size, PREVIEW_ESTIMATE) : PREVIEW_ESTIMATE))
            }
        }
    }
    const cover = record.info && record.info.albumImage
    if (typeof cover === 'string' && cover !== '') {
        add(cover, false, PREVIEW_ESTIMATE)
    }
    return [...plan.values()]
}

/** Estimated download size of an album, in bytes. */
export function estimateAlbumBytes(record) {
    return albumMediaPlan(record).reduce((total, item) => total + item.estimate, 0)
}

async function putBlob(cacheName, key, blob, type) {
    const cache = await cacheStorage().open(cacheName)
    try {
        await cache.put(key, new Response(blob, {
            headers: {
                'Content-Type': type || blob.type || 'application/octet-stream',
                'Content-Length': String(blob.size),
            },
        }))
    } catch (error) {
        throw isQuotaError(error) ? new QuotaError() : error
    }
}

async function keysOfAlbum(cacheName, path) {
    const cache = await cacheStorage().open(cacheName)
    const prefix = albumKeyPrefix(origin(), path)
    return (await cache.keys()).filter(request => request.url.startsWith(prefix))
}

/**
 * Keep the bytes of an asset added on this device until they are uploaded.
 *
 * @param {string} path - the album folder
 * @param {string} asset - the asset reference, e.g. "data/<uuid>.jpg"
 * @param {Blob} blob
 */
export async function putPending(path, asset, blob) {
    if (!isSupported()) {
        throw new Error('Cache storage is not available')
    }
    await putBlob(PENDING_CACHE, mediaKey(origin(), path, asset), blob)
}

/**
 * Replace the offline copy of a medium with bytes this device just sent to
 * the server (an asset rewritten in place, like a drawing).
 */
export async function putOfflineCopy(path, asset, blob) {
    await putBlob(MEDIA_CACHE, mediaKey(origin(), path, asset), blob)
}

/** The bytes of a pending asset, or null when there are none (any more). */
export async function getPending(path, asset) {
    if (!isSupported()) {
        return null
    }
    const cache = await cacheStorage().open(PENDING_CACHE)
    const response = await cache.match(mediaKey(origin(), path, asset))
    return response ? response.blob() : null
}

/**
 * Forget a pending asset, once uploaded or abandoned. With `keep`, its bytes
 * become the offline copy of the medium instead (album available offline).
 */
export async function deletePending(path, asset, keep = false) {
    if (!isSupported()) {
        return
    }
    const key = mediaKey(origin(), path, asset)
    const cache = await cacheStorage().open(PENDING_CACHE)
    if (keep) {
        const response = await cache.match(key)
        if (response) {
            try {
                await putBlob(MEDIA_CACHE, key, await response.blob())
            } catch (error) {
                // no room for the copy: the medium is on the server anyway
            }
        }
    }
    await cache.delete(key)
}

/**
 * Bring the offline copies of an album in line with its pages: download the
 * media that are missing, drop those no page uses any more.
 *
 * @param {object} record - the album record
 * @param {object} [options]
 * @param {Function} [options.onProgress] - ({done, total}) after each medium
 * @param {AbortSignal} [options.signal] - cancels the download
 * @param {Function} [options.fetchImpl] - injectable fetch (tests)
 * @returns {Promise<number>} bytes now held for the album
 * @throws {QuotaError} when the device is out of space
 */
export async function syncAlbumMedia(record, { onProgress = () => {}, signal, fetchImpl } = {}) {
    if (!isSupported()) {
        throw new Error('Cache storage is not available')
    }
    const doFetch = fetchImpl || ((url, init) => fetch(url, init))
    const cache = await cacheStorage().open(MEDIA_CACHE)
    const plan = albumMediaPlan(record)
    const wanted = new Map(plan.map(item => [mediaKey(origin(), record.path, item.file), item]))
    let bytes = 0
    const missing = []
    for (const [key, item] of wanted) {
        const existing = await cache.match(key)
        if (existing) {
            bytes += Number(existing.headers.get('Content-Length')) || 0
        } else {
            missing.push({ key, item })
        }
    }
    for (const request of await keysOfAlbum(MEDIA_CACHE, record.path)) {
        if (!wanted.has(request.url)) {
            await cache.delete(request)
        }
    }
    let done = plan.length - missing.length
    onProgress({ done, total: plan.length })
    for (const { key, item } of missing) {
        if (signal && signal.aborted) {
            throw signal.reason || new DOMException('Aborted', 'AbortError')
        }
        // a medium still waiting for its upload has no server copy to fetch:
        // the service worker serves the pending bytes until the sync
        const pending = await getPending(record.path, item.file)
        if (pending == null) {
            const response = await doFetch(item.url, { signal, credentials: 'same-origin' })
            if (response.ok && !response.redirected) {
                const blob = await response.blob()
                await putBlob(MEDIA_CACHE, key, blob, response.headers.get('Content-Type'))
                bytes += blob.size
            } else if (response.status === 401 || response.redirected) {
                const error = new Error('Not logged in')
                error.status = 401
                throw error
            }
            // any other failure (asset gone, no preview): the album stays
            // usable, that medium shows the "online only" placeholder
        }
        done++
        onProgress({ done, total: plan.length })
    }
    return bytes
}

/** Drop the offline copies of an album (not its pending uploads). */
export async function removeAlbumMedia(path) {
    if (!isSupported()) {
        return
    }
    const cache = await cacheStorage().open(MEDIA_CACHE)
    for (const request of await keysOfAlbum(MEDIA_CACHE, path)) {
        await cache.delete(request)
    }
}

/** Drop the pending uploads of an album: its local changes are abandoned. */
export async function removeAlbumPending(path) {
    if (!isSupported()) {
        return
    }
    const cache = await cacheStorage().open(PENDING_CACHE)
    for (const request of await keysOfAlbum(PENDING_CACHE, path)) {
        await cache.delete(request)
    }
}

/** Drop every offline copy and pending upload of this browser. */
export async function clearAllMedia() {
    if (!isSupported()) {
        return
    }
    await cacheStorage().delete(MEDIA_CACHE)
    await cacheStorage().delete(PENDING_CACHE)
}

/**
 * Space used and available on this device for the whole site, as the
 * browser reports it; null values when it does not.
 *
 * @returns {Promise<{usage: number|null, quota: number|null, persisted: boolean}>}
 */
export async function storageEstimate() {
    const storage = globalThis.navigator && globalThis.navigator.storage
    const result = { usage: null, quota: null, persisted: false }
    if (storage == null) {
        return result
    }
    try {
        if (storage.estimate) {
            const estimate = await storage.estimate()
            result.usage = estimate.usage == null ? null : estimate.usage
            result.quota = estimate.quota == null ? null : estimate.quota
        }
        if (storage.persisted) {
            result.persisted = await storage.persisted()
        }
    } catch (error) {
        // not allowed in this context
    }
    return result
}

/**
 * Ask the browser not to evict this site's data under storage pressure
 * (and, on iOS, to lift the 7-day cap of non-installed sites). Browsers
 * grant it silently or not at all: best-effort.
 *
 * @returns {Promise<boolean>} whether storage is persistent now
 */
export async function requestPersistence() {
    const storage = globalThis.navigator && globalThis.navigator.storage
    try {
        if (storage && storage.persist) {
            return await storage.persist()
        }
    } catch (error) {
        // not allowed in this context
    }
    return false
}
