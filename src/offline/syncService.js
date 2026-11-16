/**
 * Glue between the pure reconciliation (albumSync.js) and the outside
 * world (issue #22): the write API, the media caches, the local store.
 * Used by the open album (albumSession.js) and by the background sync of
 * the album list (offlineManager.js).
 */

import * as albumApi from '../api/albumApi.js'
import * as mediaCache from './mediaCache.js'
import { reconcile, recordFromRemote } from './albumSync.js'
import { normalizePath } from './mediaKeys.js'
import { fetchAlbumOfRecord } from './remote.js'

// An album is synced from two places: the album list (in the background,
// for every album with something to send) and the album view (for the open
// one). They must not work on the same album at once - each would push from
// its own snapshot, and the loser would overwrite the other's stored result.
const backgroundSyncs = new Map()
let activeAlbumPath = null

/** The album the view has open (null when none): the list leaves it alone. */
export function setActiveAlbum(path) {
    activeAlbumPath = path == null ? null : normalizePath(path)
}

export function isActiveAlbum(path) {
    return activeAlbumPath != null && normalizePath(path) === activeAlbumPath
}

/** Register the background sync of an album for as long as it runs. */
export function trackBackgroundSync(albumId, promise) {
    backgroundSyncs.set(albumId, promise)
    const done = () => {
        if (backgroundSyncs.get(albumId) === promise) {
            backgroundSyncs.delete(albumId)
        }
    }
    promise.then(done, done)
    return promise
}

/** The background sync of an album in flight, to wait for; or null. */
export function backgroundSyncOf(albumId) {
    return backgroundSyncs.get(albumId) || null
}

/**
 * JSON body of an albumApi result: some functions resolve to the raw
 * Response, others to the parsed body.
 */
export async function bodyOf(result) {
    if (result != null && typeof result.json === 'function') {
        try {
            return (await result.json()) || {}
        } catch (error) {
            return {}
        }
    }
    return result || {}
}

/**
 * The writes reconcile() needs, for one album.
 *
 * @param {{id: string, path: string, offline: boolean}} record - as stored:
 *        its path is where the pending uploads are kept
 * @param {string} davFolder - the album folder on the server now
 * @param {object} [deps] - { api, media } overrides (tests)
 */
export function makeSyncApi(record, davFolder, { api = albumApi, media = mediaCache } = {}) {
    return {
        updateAlbum: async fields => bodyOf(await api.updateAlbum(record.id, fields)),
        pageOperations: operations => api.pageOperations(record.id, operations),
        uploadPending: async asset => {
            const blob = await media.getPending(record.path, asset)
            if (blob == null) {
                // already uploaded by a sync that failed further on
                return
            }
            await api.uploadAsset(normalizePath(davFolder) + '/' + asset, blob)
            // the bytes become the offline copy of an album kept offline
            await media.deletePending(record.path, asset, !!record.offline
                && normalizePath(davFolder) === normalizePath(record.path))
        },
        dropPending: asset => media.deletePending(record.path, asset),
        cleanAssets: () => api.cleanAssets(record.id),
    }
}

/**
 * Reconcile a record with the album the server returned.
 *
 * @param {object} record - the local copy, with its pages
 * @param {object} remote - the full album, `path` included
 * @param {object} [choices] - conflict resolutions, see reconcile()
 * @param {object} [deps] - { api, media } overrides (tests)
 * @returns {Promise<{record: object, pushed: boolean, pulled: boolean}>}
 */
export async function reconcileRecord(record, remote, choices = {}, deps = {}) {
    const media = deps.media || mediaCache
    const davFolder = remote.path ? normalizePath(remote.path) : record.path
    const result = await reconcile(record, remote, makeSyncApi(record, davFolder, deps), choices)
    if (davFolder !== record.path) {
        // the album folder was renamed on the server: the copies kept under
        // the old name are unreachable, they are downloaded again
        await media.removeAlbumMedia(record.path)
        await media.removeAlbumPending(record.path)
        result.record.path = davFolder
        result.record.pendingAssets = []
        result.record.offlineBytes = 0
    }
    return result
}

/**
 * Bring the offline copies of an album kept offline up to date. Never
 * fails: a medium that cannot be fetched shows its placeholder.
 *
 * @param {object} record - modified in place (offlineBytes)
 * @param {object} [deps]
 * @returns {Promise<boolean>} whether the copies are complete
 */
export async function refreshOfflineMedia(record, deps = {}) {
    const media = deps.media || mediaCache
    if (!record.offline || !media.isSupported()) {
        return true
    }
    try {
        record.offlineBytes = await media.syncAlbumMedia(record)
        return true
    } catch (error) {
        return false
    }
}

/**
 * Fetch an album and reconcile its record, creating the record when the
 * album was never opened on this device. The result is stored.
 *
 * @param {object} store
 * @param {{id: string, path: string, pages?: Array}} record - a stored
 *        record, or just { id, path } of an album to mirror
 * @param {object} [choices]
 * @param {object} [deps]
 * @returns {Promise<{record: object, pushed: boolean, pulled: boolean}>}
 * @throws {RemoteError} when the server cannot be reached, the session is
 *         gone or the album no longer exists; other errors of the writes
 */
export async function syncRecord(store, record, choices = {}, deps = {}) {
    const remote = await (deps.fetchAlbum || fetchAlbumOfRecord)(record)
    let result
    if (record.pages == null) {
        const fresh = recordFromRemote(remote, remote.path || record.path)
        fresh.offline = !!record.offline
        result = { record: fresh, pushed: false, pulled: true }
    } else {
        result = await reconcileRecord(record, remote, choices, deps)
    }
    await store.putAlbum(result.record)
    return result
}
