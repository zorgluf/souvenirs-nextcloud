/**
 * The open album's link to the server and to its local copy (issue #22).
 *
 * The album view keeps editing exactly as before: it calls the write API
 * (same function names and arguments as api/albumApi.js) and applies the
 * change to its pages. This object stands between the two:
 *
 * - "direct" mode, while the server answers and the local copy holds
 *   nothing to send: writes go straight to the server, as they always did;
 *   the tokens it returns are recorded, so the copy stays a clean mirror.
 * - "local" mode, as soon as a write cannot reach the server (or the session
 *   is gone), and until a sync succeeds: writes only mark what changed
 *   (dirty flags - there is no operations journal) and resolve at once, so
 *   the editor behaves the same. New media bytes are kept on the device.
 *
 * The copy is stored a moment after each write, with the pages as the view
 * shows them. Going back to direct mode is the job of sync(): fetch the
 * album, reconcile (albumSync.js), store.
 */

import * as albumApi from '../api/albumApi.js'
import * as mediaCache from './mediaCache.js'
import { connectivity, reportOffline, reportOnline, refreshToken } from './connectivity.js'
import { recordFromRemote, hasLocalChanges, hasConflicts, syncStatus, tokenEquals, sameVisiblePage, stableStringify } from './albumSync.js'
import { normalizePath } from './mediaKeys.js'
import { fetchAlbumByPath, fetchAlbumOfRecord, errorKind, isDeferrable } from './remote.js'
import { bodyOf, reconcileRecord, refreshOfflineMedia, setActiveAlbum, isActiveAlbum, backgroundSyncOf } from './syncService.js'
import { findAlbumByPath, getStore } from './store.js'

/** Delay between a write and the storing of the local copy. */
export const PERSIST_DELAY_MS = 250
/** Delay between a local-mode write and the sync that sends it. */
export const SYNC_DELAY_MS = 1500

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

/** What "the content of a page" is, for telling whether it changed. */
function contentOf(page) {
    return stableStringify((page && page.elements) || [])
}

export class AlbumSession {
    /**
     * @param {object} options
     * @param {string} options.path - album folder relative to the user's files
     * @param {Function} options.getPages - () => the pages as the view holds them
     * @param {Function} [options.onState] - (state) whenever the status changes
     * @param {Function} [options.onSyncWanted] - () a sync should run soon
     * @param {object} [options.store] [options.api] [options.media] - overrides (tests)
     * @param {Function} [options.fetchAlbum] - override of the album read (tests)
     */
    constructor({
        path, getPages, onState = () => {}, onSyncWanted = () => {},
        store = getStore(), api = albumApi, media = mediaCache, fetchAlbum = null,
    }) {
        this.path = normalizePath(path)
        this.getPages = getPages
        this.onState = onState
        this.onSyncWanted = onSyncWanted
        this.store = store
        this.api = api
        this.media = media
        this.fetchAlbum = fetchAlbum
        this.record = null
        // why the server cannot be used right now, beyond plain offline
        this.authExpired = false
        this.gone = false
        this.persistTimer = null
        this.syncTimer = null
        this.closed = false
        // Content of each page as the server last had it (page id -> string):
        // a page that differs was edited, whether or not its save ran yet.
        this.synced = new Map()
    }

    // ----- status -----

    /** Snapshot of the status, for the view. */
    get state() {
        return {
            status: syncStatus(this.record),
            conflicts: this.record ? this.record.conflicts : null,
            pendingAssets: this.record ? (this.record.pendingAssets || []).slice() : [],
            authExpired: this.authExpired,
            gone: this.gone,
            offlineCopy: !!(this.record && this.record.offline),
        }
    }

    publish() {
        this.onState(this.state)
    }

    /** Whether writes must stay on the device for now. */
    isLocalMode() {
        return !connectivity.online || this.authExpired || this.gone
            || hasLocalChanges(this.record) || hasConflicts(this.record)
    }

    noteFailure(error) {
        const kind = errorKind(error)
        if (kind === 'network') {
            reportOffline()
        } else if (kind === 'auth') {
            this.authExpired = true
        }
    }

    // ----- opening -----

    /**
     * Load the album: from the server when it answers (sending what the
     * local copy holds, if anything), from the local copy otherwise.
     *
     * @returns {Promise<{id, path, info, pages}|null>} null when the album is
     *          neither reachable nor on this device
     */
    async open() {
        // from now on the list's background sync leaves this album alone;
        // if it is working on it right now, let it finish first
        setActiveAlbum(this.path)
        let local = await findAlbumByPath(this.store, this.path)
        const running = local != null ? backgroundSyncOf(local.id) : null
        if (running != null) {
            await running.catch(() => {})
            local = await findAlbumByPath(this.store, this.path)
        }
        const usable = local != null && Array.isArray(local.pages)
        let remote = null
        if (connectivity.online) {
            try {
                remote = usable ? await this.readRemote(local) : await this.readRemote(null)
                reportOnline()
            } catch (error) {
                this.noteFailure(error)
                if (errorKind(error) === 'notfound') {
                    this.gone = usable
                } else if (errorKind(error) === 'server' && !usable) {
                    throw error
                }
            }
        }
        if (remote != null) {
            if (usable) {
                try {
                    this.record = (await reconcileRecord(local, remote, {}, this.deps())).record
                } catch (error) {
                    // what was pending could not be sent: keep it for later
                    this.noteFailure(error)
                    this.record = local
                }
            } else {
                this.record = recordFromRemote(remote, remote.path || this.path)
                if (local != null) {
                    this.record.offline = !!local.offline
                }
            }
            await this.storeRecord()
            this.refreshMedia()
        } else if (usable) {
            this.record = local
        } else {
            this.record = null
        }
        this.rememberSynced(this.record ? this.record.pages : [])
        this.publish()
        return this.record
    }

    /**
     * Store the record. Never rejects: the album stays usable from the
     * server when the device refuses to store it (out of space...).
     */
    async storeRecord() {
        try {
            await this.store.putAlbum(this.record)
        } catch (error) {
            console.error('souvenirs: could not store the album locally', error)
        }
    }

    rememberSynced(pages) {
        this.synced = new Map((pages || []).map(page => [page.id, contentOf(page)]))
    }

    /**
     * Flag the pages that were edited but whose save did not run yet (it is
     * debounced, or queued behind a sync): without their flag a sync would
     * take them for unchanged and replace them with the server's version.
     */
    flagUnsavedEdits(pages) {
        for (const page of pages) {
            if (!this.record.dirty.content[page.id] && this.synced.has(page.id)
                && this.synced.get(page.id) !== contentOf(page)) {
                this.record.dirty.content[page.id] = true
            }
        }
    }

    readRemote(record) {
        if (this.fetchAlbum != null) {
            return this.fetchAlbum(record || { id: null, path: this.path })
        }
        return record != null ? fetchAlbumOfRecord(record) : fetchAlbumByPath(this.path)
    }

    deps() {
        return { api: this.api, media: this.media }
    }

    refreshMedia() {
        const record = this.record
        if (record == null || !record.offline) {
            return
        }
        // in the background: the album is usable meanwhile
        refreshOfflineMedia(record, this.deps()).then(() => {
            if (this.record === record && !this.closed) {
                this.schedulePersist()
            }
        })
    }

    // ----- storing -----

    touch() {
        this.schedulePersist()
        this.publish()
    }

    schedulePersist() {
        if (this.persistTimer != null) {
            clearTimeout(this.persistTimer)
        }
        this.persistTimer = setTimeout(() => {
            this.persistTimer = null
            this.persist().catch(error => console.error('souvenirs: could not store the album locally', error))
        }, PERSIST_DELAY_MS)
    }

    /** Store the local copy now, with the pages as the view shows them. */
    async persist() {
        if (this.record == null) {
            return
        }
        this.record.pages = clone(this.getPages())
        await this.store.putAlbum(this.record)
    }

    /** Store now what is waiting to be (leaving the album, hiding the tab). */
    flush() {
        if (this.persistTimer != null) {
            clearTimeout(this.persistTimer)
            this.persistTimer = null
        }
        return this.persist().catch(error => console.error('souvenirs: could not store the album locally', error))
    }

    close() {
        this.closed = true
        if (isActiveAlbum(this.path)) {
            setActiveAlbum(null)
        }
        if (this.syncTimer != null) {
            clearTimeout(this.syncTimer)
            this.syncTimer = null
        }
        return this.flush()
    }

    // ----- writes (same signatures as api/albumApi.js) -----

    /**
     * @param {Function} send - () => Promise: the server write
     * @param {Function} onSent - (body) records the tokens it returned
     * @param {Function} keep - () marks the change as to be sent later
     */
    async write(send, onSent, keep) {
        if (this.record == null) {
            return bodyOf(await send())
        }
        if (!this.isLocalMode()) {
            try {
                const body = await bodyOf(await send())
                onSent(body)
                this.touch()
                return body
            } catch (error) {
                if (!isDeferrable(error)) {
                    throw error
                }
                this.noteFailure(error)
            }
        }
        keep()
        this.touch()
        this.wantSync()
        return {}
    }

    wantSync() {
        if (!connectivity.online || this.authExpired || this.closed) {
            // the reconnection (or the user, from the banner) triggers it
            return
        }
        if (this.syncTimer != null) {
            clearTimeout(this.syncTimer)
        }
        this.syncTimer = setTimeout(() => {
            this.syncTimer = null
            this.onSyncWanted()
        }, SYNC_DELAY_MS)
    }

    setContentToken(pageId, token) {
        if (token != null) {
            this.record.base.content[pageId] = token
        }
    }

    setPagesToken(token) {
        if (token != null) {
            this.record.base.pages = token
        }
    }

    updatePage(albumId, page) {
        const sent = contentOf(page)
        return this.write(
            () => this.api.updatePage(albumId, page),
            body => {
                this.setContentToken(page.id, body.lastEditDate)
                this.synced.set(page.id, sent)
            },
            () => { this.record.dirty.content[page.id] = true },
        )
    }

    createPage(albumId, pos, page) {
        return this.write(
            () => this.api.createPage(albumId, pos, page),
            body => {
                this.record.base.content[page.id] = body.lastEditDate == null ? null : body.lastEditDate
                this.setPagesToken(body.pageLastEditDate)
                this.synced.set(page.id, contentOf(page))
            },
            () => { this.record.dirty.pages = true },
        )
    }

    deletePage(albumId, pageId) {
        return this.write(
            () => this.api.deletePage(albumId, pageId),
            body => {
                delete this.record.base.content[pageId]
                this.setPagesToken(body.pageLastEditDate)
                this.synced.delete(pageId)
            },
            // the page's token is kept: the sync needs it to tell whether
            // the page was edited elsewhere in the meantime
            () => {
                this.record.dirty.pages = true
                delete this.record.dirty.content[pageId]
            },
        )
    }

    movePage(albumId, pageId, pos) {
        return this.write(
            () => this.api.movePage(albumId, pageId, pos),
            body => this.setPagesToken(body.pageLastEditDate),
            () => { this.record.dirty.pages = true },
        )
    }

    pageOperations(albumId, operations) {
        // as sent: the view applies the operations to its pages afterwards
        const sent = new Map(operations.filter(operation => operation.page != null)
            .map(operation => [operation.page.id, contentOf(operation.page)]))
        return this.write(
            () => this.api.pageOperations(albumId, operations),
            body => {
                const results = body.results || []
                operations.forEach((operation, index) => {
                    const result = results[index] || {}
                    if (operation.op === 'update') {
                        this.setContentToken(operation.page.id, result.lastEditDate)
                        this.synced.set(operation.page.id, sent.get(operation.page.id))
                    } else if (operation.op === 'create') {
                        this.record.base.content[operation.page.id] = result.lastEditDate == null ? null : result.lastEditDate
                        this.synced.set(operation.page.id, sent.get(operation.page.id))
                    } else if (operation.op === 'delete') {
                        delete this.record.base.content[operation.id]
                        this.synced.delete(operation.id)
                    }
                })
                this.setPagesToken(body.pageLastEditDate)
            },
            () => {
                for (const operation of operations) {
                    if (operation.op === 'update') {
                        this.record.dirty.content[operation.page.id] = true
                    } else {
                        this.record.dirty.pages = true
                        if (operation.op === 'delete') {
                            delete this.record.dirty.content[operation.id]
                        }
                    }
                }
            },
        )
    }

    cleanAssets(albumId) {
        if (this.record != null && this.isLocalMode()) {
            // the sync cleans up once everything is sent
            return Promise.resolve()
        }
        return this.api.cleanAssets(albumId)
    }

    /**
     * Store the bytes of a new asset: on the server, or on the device until
     * the next sync when it cannot be reached.
     *
     * @param {string} asset - the asset reference, e.g. "data/<uuid>.jpg"
     * @param {Blob} blob
     */
    async uploadNewAsset(asset, blob) {
        const record = this.record
        if (!this.isLocalMode()) {
            try {
                await this.api.uploadAsset(record.path + '/' + asset, blob)
                if (record.offline && this.media.isSupported()) {
                    // an asset rewritten in place (a drawing) must not leave
                    // its previous version as the offline copy
                    await this.media.putOfflineCopy(record.path, asset, blob).catch(() => {})
                }
                return
            } catch (error) {
                if (!isDeferrable(error)) {
                    throw error
                }
                this.noteFailure(error)
            }
        }
        await this.media.putPending(record.path, asset, blob)
        if (!record.pendingAssets.includes(asset)) {
            record.pendingAssets.push(asset)
        }
        this.touch()
    }

    // ----- sync -----

    /**
     * Read the album from the server, for a sync. Never rejects.
     *
     * @returns {Promise<object|null>} null when the server cannot be used
     */
    async fetchRemote() {
        if (this.record == null) {
            return null
        }
        if (!(await refreshToken())) {
            reportOffline()
            return null
        }
        try {
            const remote = await this.readRemote(this.record)
            reportOnline()
            this.authExpired = false
            this.gone = false
            return remote
        } catch (error) {
            this.noteFailure(error)
            this.gone = errorKind(error) === 'notfound'
            this.publish()
            return null
        }
    }

    /** Whether reconciling with `remote` would change anything. */
    needsSync(remote) {
        const record = this.record
        if (record == null) {
            return false
        }
        if (hasLocalChanges(record) || hasConflicts(record)) {
            return true
        }
        const pages = this.getPages()
        const remotePages = remote.pages || []
        // a token that moved, or a page list or content that differs
        return !tokenEquals(record.base.info, remote.lastEditDate)
            || !tokenEquals(record.base.pages, remote.pageLastEditDate)
            || pages.length !== remotePages.length
            || remotePages.some((remotePage, index) => pages[index].id !== remotePage.id
                || !tokenEquals(record.base.content[remotePage.id], remotePage.lastEditDate)
                || !sameVisiblePage(pages[index], remotePage))
    }

    /**
     * Reconcile the local copy with `remote`. Nothing must edit the album
     * meanwhile: the view blocks its editor for the duration.
     *
     * @param {object} remote - from fetchRemote()
     * @param {object} [choices] - conflict resolutions, see albumSync.js
     * @returns {Promise<{pushed: boolean, pulled: boolean, record: object}>}
     */
    async reconcileWith(remote, choices = {}) {
        if (this.persistTimer != null) {
            clearTimeout(this.persistTimer)
            this.persistTimer = null
        }
        const before = clone(this.getPages())
        const pendingBefore = this.record.pendingAssets.slice()
        const previous = this.record
        previous.pages = before
        this.flagUnsavedEdits(before)
        try {
            const result = await reconcileRecord(previous, remote, choices, this.deps())
            this.rememberSynced(result.record.pages)
            this.keepWhatChangedMeanwhile(before, pendingBefore, previous, result.record)
            this.record = result.record
            await this.storeRecord()
            this.refreshMedia()
            this.publish()
            return result
        } catch (error) {
            this.noteFailure(error)
            await this.storeRecord()
            this.publish()
            throw error
        }
    }

    /**
     * The view is asked not to edit during a sync, but it cannot be held to
     * it (a caption being typed, a drag being dropped, a dialog above the
     * overlay). Whatever changed while the sync was talking to the server
     * is carried over to the reconciled record, flagged for the next sync,
     * instead of being replaced by what the sync brought back.
     */
    keepWhatChangedMeanwhile(before, pendingBefore, previous, reconciled) {
        const contentBefore = new Map(before.map(page => [page.id, contentOf(page)]))
        for (const page of this.getPages()) {
            if (contentBefore.has(page.id) && contentBefore.get(page.id) !== contentOf(page)) {
                const index = reconciled.pages.findIndex(candidate => candidate.id === page.id)
                if (index >= 0) {
                    reconciled.pages[index] = clone(page)
                    reconciled.dirty.content[page.id] = true
                }
            }
        }
        for (const asset of previous.pendingAssets) {
            if (!pendingBefore.includes(asset) && !reconciled.pendingAssets.includes(asset)) {
                reconciled.pendingAssets.push(asset)
            }
        }
    }
}
