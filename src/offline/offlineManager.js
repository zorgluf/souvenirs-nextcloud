/**
 * App-wide side of the offline feature (issue #22): what the album list
 * needs, and what is not tied to one open album - registering the service
 * worker, keeping the list for offline starts, syncing albums in the
 * background, managing the media kept on the device.
 */

import { generateUrl } from '@nextcloud/router'
import * as albumApi from '../api/albumApi.js'
import * as mediaCache from './mediaCache.js'
import { SHELL_CACHE, normalizePath } from './mediaKeys.js'
import { connectivity, reportOffline, reportOnline, refreshToken, setForcedOffline, syncForcedOffline } from './connectivity.js'
import { hasLocalChanges, hasConflicts, syncStatus } from './albumSync.js'
import { errorKind, isDeferrable } from './remote.js'
import { bodyOf, syncRecord, refreshOfflineMedia, isActiveAlbum, trackBackgroundSync } from './syncService.js'
import { getStore } from './store.js'

const META_USER = 'user'
const META_ALBUM_LIST = 'albumList'

function currentUser() {
    const head = globalThis.document && globalThis.document.head
    return (head && head.dataset && head.dataset.user) || ''
}

// ----- start-up -----

/**
 * Drop everything kept on this device: local copies, their unsent changes,
 * offline media and the app shell - and with them the choice to work
 * offline, which needs them (there would be nothing left to start from).
 */
export async function wipeEverything(store = getStore()) {
    await store.clear()
    await mediaCache.clearAllMedia()
    if (globalThis.caches) {
        await globalThis.caches.delete(SHELL_CACHE)
    }
    if (connectivity.forced) {
        // not waited for: the server is asked again in the background, and
        // a logout must not hang on its answer
        setForcedOffline(false).catch(() => {})
    }
}

/**
 * The local data belongs to one account: when another one opens the app in
 * this browser, nothing of the previous one must be left for it to see.
 *
 * @returns {Promise<boolean>} whether the data was wiped
 */
export async function claimForCurrentUser(store = getStore(), user = currentUser()) {
    if (user === '') {
        return false
    }
    const owner = await store.getMeta(META_USER)
    if (owner != null && owner !== user) {
        await wipeEverything(store)
        await store.setMeta(META_USER, user)
        return true
    }
    if (owner == null) {
        await store.setMeta(META_USER, user)
    }
    return false
}

/**
 * Logging out clears what this device holds. Nextcloud itself asks the
 * browser to (Clear-Site-Data on its logout response) - but not on Chrome,
 * and not every browser obeys - so the same is done here. Changes still
 * waiting to be sent would be lost with it: the user is asked first.
 */
function guardLogout(store) {
    if (!globalThis.document) {
        return
    }
    globalThis.document.addEventListener('click', event => {
        const link = event.target && event.target.closest ? event.target.closest('a[href*="/logout"]') : null
        if (link == null) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        confirmLogout(store)
            .then(proceed => (proceed ? wipeEverything(store).catch(() => {}).then(() => true) : false))
            // whatever went wrong here must not keep the user logged in
            .catch(() => true)
            .then(proceed => {
                if (proceed) {
                    globalThis.location.href = link.href
                }
            })
    }, true)
}

/**
 * Whether the logout may proceed: always, unless albums hold changes not
 * sent yet and the user chooses to stay.
 *
 * @returns {Promise<boolean>}
 */
export async function confirmLogout(store = getStore(), ask = message => globalThis.confirm(message)) {
    const unsent = (await store.allAlbums()).filter(hasLocalChanges)
    if (unsent.length === 0) {
        return true
    }
    return !!ask(n('souvenirs',
        '%n album has changes that were not sent to the server yet. They will be lost if you log out now. Log out anyway?',
        '%n albums have changes that were not sent to the server yet. They will be lost if you log out now. Log out anyway?',
        unsent.length))
}

/** Whether a service worker controls this page: offline starts work. */
export function hasServiceWorker() {
    const container = globalThis.navigator && globalThis.navigator.serviceWorker
    return !!(container && container.controller)
}

async function registerServiceWorker() {
    const container = globalThis.navigator && globalThis.navigator.serviceWorker
    if (!container) {
        return
    }
    const firstTime = container.controller == null
    if (connectivity.forced && !firstTime) {
        // working offline by choice: registering again would ask the server
        // for a newer worker
        return
    }
    await container.register(generateUrl('/apps/souvenirs/service-worker.js'), {
        scope: generateUrl('/apps/souvenirs/'),
    })
    if (!firstTime) {
        return
    }
    // This load happened before the worker existed: hand it what the page
    // loaded, so the app can start offline right away.
    const registration = await container.ready
    const urls = []
    if (globalThis.performance && globalThis.performance.getEntriesByType) {
        for (const entry of globalThis.performance.getEntriesByType('resource')) {
            if (['script', 'link', 'css', 'img', 'other'].includes(entry.initiatorType)) {
                urls.push(entry.name)
            }
        }
    }
    if (registration.active) {
        registration.active.postMessage({ type: 'warm', urls })
    }
}

let started = false

/** To be called once, when the authenticated app starts. */
export async function startOffline() {
    if (started) {
        return
    }
    started = true
    const store = getStore()
    try {
        await claimForCurrentUser(store)
    } catch (error) {
        console.warn('souvenirs: local storage unavailable', error)
    }
    guardLogout(store)
    try {
        await registerServiceWorker()
    } catch (error) {
        // no worker (unsupported, insecure origin, not built): the app
        // works online, and offline for as long as the page stays open
        console.warn('souvenirs: service worker not registered', error)
    }
    // the worker and the page each keep the "work offline" choice
    await syncForcedOffline().catch(() => false)
}

// ----- album list -----

/** Keep the album list (summaries) for the next start without a server. */
export async function rememberAlbumList(albums, store = getStore()) {
    await store.setMeta(META_ALBUM_LIST, albums.map(album => ({
        id: album.id,
        path: album.path,
        name: album.name,
        date: album.date,
        albumImage: album.albumImage,
    })))
}

/**
 * The album list as last seen, with the names and dates of the local
 * copies (which may hold edits the server does not have yet).
 */
export async function knownAlbumList(store = getStore()) {
    const list = (await store.getMeta(META_ALBUM_LIST)) || []
    const records = new Map((await store.allAlbums()).map(record => [record.id, record]))
    return list.map(album => {
        const record = records.get(album.id)
        return record == null ? album : { ...album, name: record.info.name, date: record.info.date }
    })
}

/**
 * Local status of every album that has a copy on this device.
 *
 * @returns {Promise<Object<string, {status, offline, offlineBytes, name}>>} by album id
 */
export async function localStates(store = getStore()) {
    const states = {}
    for (const record of await store.allAlbums()) {
        states[record.id] = {
            status: syncStatus(record),
            offline: !!record.offline,
            offlineBytes: record.offlineBytes || 0,
            name: record.info ? record.info.name : '',
        }
    }
    return states
}

let syncing = null

/**
 * Background sync of the albums that are not open: send the changes made
 * offline, refresh the albums kept offline. Albums in conflict wait for
 * the user (in the album itself). One run at a time.
 *
 * @param {Function} [onAlbum] - ({ record, pushed, pulled, conflict }) per album synced
 * @returns {Promise<void>}
 */
export function syncAll(onAlbum = () => {}, store = getStore()) {
    if (syncing == null) {
        syncing = runSyncAll(onAlbum, store).finally(() => { syncing = null })
    }
    return syncing
}

async function runSyncAll(onAlbum, store) {
    if (!connectivity.online) {
        return
    }
    const records = (await store.allAlbums()).filter(record => record.pages != null && !hasConflicts(record)
        && (hasLocalChanges(record) || record.offline))
    // nothing kept on this device: not a single request
    if (records.length === 0 || !(await refreshToken())) {
        return
    }
    for (const listed of records) {
        // as it is now, not as it was when the run started: the album may
        // have been opened and edited since - or be open right now
        const record = await store.getAlbum(listed.id)
        if (record == null || record.pages == null || hasConflicts(record)
            || !(hasLocalChanges(record) || record.offline) || isActiveAlbum(record.path)) {
            continue
        }
        try {
            const result = await trackBackgroundSync(record.id, syncRecord(store, record))
            reportOnline()
            if (result.record.offline) {
                const copy = result.record
                await refreshOfflineMedia(copy)
                // the download may have been long: only its size is written
                // back, onto whatever the copy has become meanwhile
                const latest = isActiveAlbum(copy.path) ? null : await store.getAlbum(copy.id)
                if (latest != null && latest.offline) {
                    latest.offlineBytes = copy.offlineBytes
                    await store.putAlbum(latest)
                }
            }
            onAlbum({ ...result, conflict: hasConflicts(result.record) })
        } catch (error) {
            const kind = errorKind(error)
            if (kind === 'network') {
                reportOffline()
                return
            }
            if (kind === 'auth') {
                return
            }
            // this album only (gone from the server, refused write): the
            // others still get their turn
            console.warn('souvenirs: could not sync album ' + record.id, error)
        }
    }
}

/**
 * Save an album's name and date: on the server, or in the local copy when
 * it cannot be reached (sent by the next sync).
 *
 * @param {string} albumId
 * @param {{name: string, date: string}} fields
 * @returns {Promise<void>}
 */
export async function saveAlbumInfo(albumId, fields, store = getStore()) {
    const record = await store.getAlbum(albumId)
    const local = record != null && record.pages != null
    if (connectivity.online && !(local && (hasLocalChanges(record) || hasConflicts(record)))) {
        try {
            const body = await bodyOf(await albumApi.updateAlbum(albumId, fields))
            if (local) {
                record.info = { ...record.info, ...fields }
                if (body.lastEditDate != null) {
                    record.base.info = body.lastEditDate
                    record.info.lastEditDate = body.lastEditDate
                }
                await store.putAlbum(record)
            }
            return
        } catch (error) {
            if (!isDeferrable(error) || !local) {
                throw error
            }
            if (errorKind(error) === 'network') {
                reportOffline()
            }
        }
    }
    if (!local) {
        // nothing to edit locally: only albums opened on this device can
        // be changed without the server
        throw new Error('Album not available offline')
    }
    record.info = { ...record.info, ...fields }
    record.dirty.info = true
    await store.putAlbum(record)
}

// ----- media kept on the device -----

/**
 * Get an album ready to be kept offline: make sure its local copy exists
 * and say what the download would weigh.
 *
 * @param {{id: string, path: string}} album
 * @returns {Promise<{record: object, bytes: number, count: number}>}
 */
export async function prepareOffline(album, store = getStore()) {
    let record = await store.getAlbum(album.id)
    if (record == null || record.pages == null) {
        record = (await syncRecord(store, { id: album.id, path: normalizePath(album.path) })).record
    }
    const plan = mediaCache.albumMediaPlan(record)
    return { record, bytes: plan.reduce((total, item) => total + item.estimate, 0), count: plan.length }
}

/**
 * Download the media of an album and mark it available offline.
 *
 * @param {string} albumId
 * @param {object} [options] - { onProgress, signal }, see syncAlbumMedia
 * @returns {Promise<object>} the record
 * @throws {QuotaError} when the device is out of space; AbortError when cancelled
 */
export async function downloadOffline(albumId, options = {}, store = getStore()) {
    const record = await store.getAlbum(albumId)
    if (record == null || record.pages == null) {
        throw new Error('Album has no local copy')
    }
    // best-effort protection against eviction (iOS: 7 days, any: disk pressure)
    mediaCache.requestPersistence()
    try {
        record.offlineBytes = await mediaCache.syncAlbumMedia(record, options)
    } catch (error) {
        // cancelled or failed: nothing half-downloaded is kept
        await mediaCache.removeAlbumMedia(record.path)
        throw error
    }
    // re-read: the album may have been synced during a long download
    const latest = (await store.getAlbum(albumId)) || record
    latest.offline = true
    latest.offlineBytes = record.offlineBytes
    await store.putAlbum(latest)
    return latest
}

/** Drop the offline media of an album; its local copy (a few KB) stays. */
export async function removeOffline(albumId, store = getStore()) {
    const record = await store.getAlbum(albumId)
    if (record == null) {
        return
    }
    await mediaCache.removeAlbumMedia(record.path)
    record.offline = false
    record.offlineBytes = 0
    await store.putAlbum(record)
}

/**
 * Forget an album on this device: local copy, offline media and - they are
 * lost - the changes not sent yet.
 */
export async function forgetAlbum(albumId, store = getStore()) {
    const record = await store.getAlbum(albumId)
    if (record == null) {
        return
    }
    await mediaCache.removeAlbumMedia(record.path)
    await mediaCache.removeAlbumPending(record.path)
    await store.deleteAlbum(albumId)
}

/**
 * Forget the local copies of albums that no longer exist on the server
 * (deleted from another device), given the complete list of those that do.
 * A copy holding changes not sent yet is kept: opening it tells the user.
 *
 * @param {string[]} existingIds - ids of every album of the server
 * @returns {Promise<string[]>} ids of the copies forgotten
 */
export async function forgetMissingAlbums(existingIds, store = getStore()) {
    const existing = new Set(existingIds)
    const forgotten = []
    for (const record of await store.allAlbums()) {
        if (!existing.has(record.id) && !hasLocalChanges(record)) {
            await forgetAlbum(record.id, store)
            forgotten.push(record.id)
        }
    }
    return forgotten
}

/**
 * Albums that only exist on this device any more: gone from the server,
 * but holding changes that were never sent. They stay listed so the user
 * can open them and decide (the album view offers to discard the copy).
 *
 * @param {string[]} existingIds - ids of every album of the server
 * @returns {Promise<Array<{id, path, name, date, albumImage}>>}
 */
export async function orphanAlbums(existingIds, store = getStore()) {
    const existing = new Set(existingIds)
    return (await store.allAlbums())
        .filter(record => !existing.has(record.id) && record.pages != null && hasLocalChanges(record))
        .map(record => ({
            id: record.id,
            path: '/' + record.path,
            name: record.info.name,
            date: record.info.date,
            albumImage: record.info.albumImage,
        }))
}

/**
 * What the storage screen shows: the albums kept offline with their size,
 * and the browser's figures for the whole site.
 */
export async function storageUsage(store = getStore()) {
    const albums = (await store.allAlbums())
        .filter(record => record.offline)
        .map(record => ({
            id: record.id,
            name: record.info ? record.info.name : record.id,
            bytes: record.offlineBytes || 0,
            status: syncStatus(record),
        }))
        .sort((a, b) => b.bytes - a.bytes)
    return {
        albums,
        total: albums.reduce((total, album) => total + album.bytes, 0),
        ...(await mediaCache.storageEstimate()),
    }
}
