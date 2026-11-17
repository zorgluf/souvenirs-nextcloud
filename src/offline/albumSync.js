/**
 * Reconciliation of the local copy of an album with the server (issue #22).
 *
 * Same model as the Android app (SyncToNextcloudThread): no operations
 * journal. The local copy carries, for each of three independent domains,
 * the server's edit-date token as of the last sync plus a dirty flag:
 *
 *   info     name and date (album lastEditDate)
 *   pages    which pages exist, and their order (album pageLastEditDate)
 *   content  the elements of each page (page lastEditDate)
 *
 * and each domain goes one way:
 *
 *   clean                          -> take the server's version
 *   dirty, token unchanged         -> push the local version
 *   dirty, token changed           -> conflict, unless the user chose a side
 *
 * Two additions to the Android rules:
 * - a dirty domain that is identical to the server's is simply in sync.
 *   That is what a write whose response was lost looks like (the server did
 *   apply it, so its token moved), and it must not be reported as a conflict.
 * - a page edited on one side and deleted on the other is a conflict of the
 *   `pages` domain instead of a silent loss of the edit.
 *
 * Everything is pushed in one batch request (Api2Controller::batchPages),
 * which the server applies as a single album.json write, all or nothing.
 *
 * The local copy ("record") is a plain JSON object:
 *   {
 *     id, path,                 album id, folder relative to the user's files
 *     info,                     album.json without its pages
 *     pages,                    the pages; null = album known but never opened
 *     base:  { info, pages, content: { <pageId>: token } },
 *     dirty: { info, pages, content: { <pageId>: true } },
 *     conflicts,                null, or { info?, pages?, content?: [pageId] }
 *     pendingAssets,            assets added on this device, not uploaded yet
 *     offline, offlineBytes,    media kept on this device, and their size
 *     syncedAt,
 *   }
 */

import { normalizePath } from './mediaKeys.js'

/** Album fields this client edits, hence the only ones it ever pushes. */
export const EDITABLE_INFO_FIELDS = ['name', 'date']

/** Fields the API adds to album.json, which are not part of the album. */
const TRANSIENT_FIELDS = ['pages', 'path', 'isShared', 'shareToken']

/** Operations per batch request (BATCH_MAX_ITEMS of Api2Controller). */
export const MAX_BATCH_OPERATIONS = 500

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/**
 * JSON with sorted object keys: two values that only differ by the order
 * their keys were written in compare equal.
 */
export function stableStringify(value) {
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']'
    }
    if (value !== null && typeof value === 'object') {
        return '{' + Object.keys(value).sort()
            .filter(key => value[key] !== undefined)
            .map(key => JSON.stringify(key) + ':' + stableStringify(value[key]))
            .join(',') + '}'
    }
    return JSON.stringify(value === undefined ? null : value)
}

/** Tokens are opaque: only equality matters, an absent one equals null. */
export function tokenEquals(a, b) {
    return (a == null ? null : a) === (b == null ? null : b)
}

/** album.json fields of a full album as returned by the API, without pages. */
export function infoOf(remote) {
    const info = {}
    for (const [key, value] of Object.entries(remote || {})) {
        if (!TRANSIENT_FIELDS.includes(key)) {
            info[key] = value
        }
    }
    return info
}

/**
 * A fresh, clean record of an album as the server has it.
 *
 * @param {object} remote - the full album (Api2Controller::getAlbumFull)
 * @param {string} path - the album folder, relative to the user's files
 * @returns {object}
 */
export function recordFromRemote(remote, path) {
    const pages = Array.isArray(remote.pages) ? clone(remote.pages) : []
    const content = {}
    for (const page of pages) {
        content[page.id] = page.lastEditDate == null ? null : page.lastEditDate
    }
    return {
        id: remote.id,
        path: normalizePath(path != null ? path : remote.path),
        info: clone(infoOf(remote)),
        pages,
        base: {
            info: remote.lastEditDate == null ? null : remote.lastEditDate,
            pages: remote.pageLastEditDate == null ? null : remote.pageLastEditDate,
            content,
        },
        dirty: { info: false, pages: false, content: {} },
        conflicts: null,
        pendingAssets: [],
        offline: false,
        offlineBytes: 0,
        syncedAt: Date.now(),
    }
}

/** Whether the record holds changes the server does not have yet. */
export function hasLocalChanges(record) {
    if (record == null || record.dirty == null) {
        return false
    }
    return !!record.dirty.info || !!record.dirty.pages
        || Object.keys(record.dirty.content || {}).length > 0
        || (record.pendingAssets || []).length > 0
}

/** Whether the record has conflicts waiting for the user's decision. */
export function hasConflicts(record) {
    return record != null && record.conflicts != null
}

/**
 * Sync status of a record, for the badges.
 *
 * @returns {'none'|'synced'|'pending'|'conflict'} none = no local copy
 */
export function syncStatus(record) {
    if (record == null || record.pages == null) {
        return 'none'
    }
    if (hasConflicts(record)) {
        return 'conflict'
    }
    return hasLocalChanges(record) ? 'pending' : 'synced'
}

/** Every asset reference ("data/<file>") of a page's elements. */
export function pageAssets(page) {
    const assets = []
    for (const element of (page && page.elements) || []) {
        for (const field of ['image', 'video', 'audio']) {
            if (typeof element[field] === 'string' && element[field] !== '') {
                assets.push(element[field])
            }
        }
    }
    return assets
}

function sameInfo(local, remote) {
    return EDITABLE_INFO_FIELDS.every(field => stableStringify(local[field]) === stableStringify(remote[field]))
}

function sameContent(local, remote) {
    return stableStringify(local.elements || []) === stableStringify(remote.elements || [])
}

/** Whether two versions of the album info show the same thing (tokens aside). */
function sameVisibleInfo(a, b) {
    const strip = info => ({ ...info, lastEditDate: undefined, pageLastEditDate: undefined })
    return stableStringify(strip(a || {})) === stableStringify(strip(b || {}))
}

/** Whether two versions of a page show the same thing (token aside). */
export function sameVisiblePage(a, b) {
    return stableStringify({ ...a, lastEditDate: undefined }) === stableStringify({ ...b, lastEditDate: undefined })
}

function sameOrder(a, b) {
    return a.length === b.length && a.every((id, index) => id === b[index])
}

/**
 * Direction of one domain.
 *
 * @param {boolean} dirty - changed locally since the last sync
 * @param {boolean} tokenUnchanged - the server's token is the one of the last sync
 * @param {boolean} same - local and server versions are identical
 * @param {string} [choice] - 'local' or 'remote': the user's conflict resolution
 * @returns {'pull'|'push'|'conflict'}
 */
export function decide(dirty, tokenUnchanged, same, choice) {
    if (!dirty || same) {
        return 'pull'
    }
    if (tokenUnchanged || choice === 'local') {
        return 'push'
    }
    return choice === 'remote' ? 'pull' : 'conflict'
}

/**
 * The batch operations turning the server's page list into the local one:
 * delete what is gone, create what is new (with its content), then reorder.
 *
 * @param {Array<object>} localPages
 * @param {Array<object>} remotePages
 * @returns {Array<object>} operations for Api2Controller::batchPages
 */
export function planStructurePush(localPages, remotePages) {
    const localIds = localPages.map(page => page.id)
    const local = new Set(localIds)
    const remote = new Set(remotePages.map(page => page.id))
    const operations = []
    // the server's list, as the operations transform it
    const working = []
    for (const page of remotePages) {
        if (local.has(page.id)) {
            working.push(page.id)
        } else {
            operations.push({ op: 'delete', id: page.id })
        }
    }
    localPages.forEach((page, index) => {
        if (!remote.has(page.id)) {
            const pos = Math.min(index, working.length)
            working.splice(pos, 0, page.id)
            operations.push({ op: 'create', pos, page })
        }
    })
    for (let index = 0; index < localIds.length; index++) {
        if (working[index] !== localIds[index]) {
            // always a move towards the start: Album::movePage then inserts
            // the page at `pos` itself
            working.splice(working.indexOf(localIds[index]), 1)
            working.splice(index, 0, localIds[index])
            operations.push({ op: 'move', id: localIds[index], pos: index })
        }
    }
    return operations
}

/**
 * Reconcile a record with the server's version of the album.
 *
 * `api` performs the writes:
 *   updateAlbum(fields)      -> { lastEditDate }
 *   pageOperations(ops)      -> { results: [...], pageLastEditDate? }
 *   uploadPending(asset)     upload the bytes of an asset added on this device
 *   dropPending(asset)       forget such bytes (no page uses them any more)
 *   cleanAssets()            best-effort GC of unreferenced assets
 *
 * The record is not modified: a new one is returned. When a write fails the
 * call rejects and the caller keeps the record it had; whatever the server
 * did apply is recognized as identical on the next run.
 *
 * @param {object} record - the local copy (with pages)
 * @param {object} remote - the full album as the server has it now
 * @param {object} api - see above
 * @param {{info?: string, pages?: string, content?: string}} [choices] -
 *        'local' or 'remote' for each domain in conflict the user resolved
 * @returns {Promise<{record: object, pushed: boolean, pulled: boolean}>}
 *          pushed: something was sent; pulled: the local version changed
 */
export async function reconcile(record, remote, api, choices = {}) {
    const next = clone(record)
    next.base = next.base || { info: null, pages: null, content: {} }
    next.base.content = next.base.content || {}
    next.dirty = next.dirty || { info: false, pages: false, content: {} }
    next.dirty.content = next.dirty.content || {}
    next.pendingAssets = next.pendingAssets || []
    next.pages = next.pages || []

    const remoteInfo = clone(infoOf(remote))
    const remotePages = Array.isArray(remote.pages) ? clone(remote.pages) : []
    const remoteById = new Map(remotePages.map(page => [page.id, page]))
    const conflicts = {}
    let pushed = false
    let pulled = false

    // ----- info -----
    const infoAction = decide(!!next.dirty.info, tokenEquals(next.base.info, remote.lastEditDate),
        sameInfo(next.info || {}, remoteInfo), choices.info)
    if (infoAction === 'push') {
        const fields = {}
        for (const field of EDITABLE_INFO_FIELDS) {
            if (next.info[field] != null) {
                fields[field] = next.info[field]
            }
        }
        const result = (await api.updateAlbum(fields)) || {}
        pushed = true
        next.info = { ...remoteInfo, ...fields }
        if (result.lastEditDate != null) {
            next.info.lastEditDate = result.lastEditDate
        }
        next.base.info = result.lastEditDate == null ? null : result.lastEditDate
        next.dirty.info = false
    } else if (infoAction === 'conflict') {
        conflicts.info = true
    } else {
        pulled = pulled || !sameVisibleInfo(next.info, remoteInfo)
        next.info = remoteInfo
        next.base.info = remote.lastEditDate == null ? null : remote.lastEditDate
        next.dirty.info = false
    }

    // ----- pages (structure) -----
    const localIds = next.pages.map(page => page.id)
    const remoteIds = remotePages.map(page => page.id)
    const localSet = new Set(localIds)
    const knownAtLastSync = id => Object.prototype.hasOwnProperty.call(next.base.content, id)
    // a page edited here but deleted there, or deleted here but edited there
    const editedAndDeleted
        = next.pages.some(page => !remoteById.has(page.id) && next.dirty.content[page.id] && knownAtLastSync(page.id))
        || (!!next.dirty.pages && remotePages.some(page => !localSet.has(page.id) && knownAtLastSync(page.id)
            && !tokenEquals(next.base.content[page.id], page.lastEditDate)))
    const pagesAction = decide(!!next.dirty.pages || editedAndDeleted,
        tokenEquals(next.base.pages, remote.pageLastEditDate) && !editedAndDeleted,
        sameOrder(localIds, remoteIds), choices.pages)

    const operations = []
    // per operation: what to do with its result once the server applied it
    const onResult = []
    if (pagesAction === 'push') {
        for (const operation of planStructurePush(next.pages, remotePages)) {
            operations.push(operation)
            if (operation.op === 'create') {
                const page = operation.page
                onResult.push(result => {
                    next.base.content[page.id] = result.lastEditDate == null ? null : result.lastEditDate
                    if (result.lastEditDate != null) {
                        page.lastEditDate = result.lastEditDate
                    }
                    delete next.dirty.content[page.id]
                })
            } else {
                onResult.push(null)
            }
        }
    } else if (pagesAction === 'conflict') {
        conflicts.pages = true
    } else {
        const localById = new Map(next.pages.map(page => [page.id, page]))
        pulled = pulled || !sameOrder(localIds, remoteIds)
        for (const id of localIds) {
            if (!remoteById.has(id)) {
                delete next.dirty.content[id]
            }
        }
        next.pages = remotePages.map(page => localById.get(page.id) || page)
        next.base.pages = remote.pageLastEditDate == null ? null : remote.pageLastEditDate
        next.dirty.pages = false
    }

    // ----- content of the pages present on both sides -----
    const contentConflicts = []
    next.pages.forEach((page, index) => {
        const remotePage = remoteById.get(page.id)
        if (remotePage == null) {
            // only here: created by the structure push above, or waiting
            // for the structure conflict to be resolved
            return
        }
        const action = decide(!!next.dirty.content[page.id],
            tokenEquals(next.base.content[page.id], remotePage.lastEditDate),
            sameContent(page, remotePage), choices.content)
        if (action === 'push') {
            operations.push({ op: 'update', page })
            onResult.push(result => {
                next.base.content[page.id] = result.lastEditDate == null ? null : result.lastEditDate
                if (result.lastEditDate != null) {
                    page.lastEditDate = result.lastEditDate
                }
                delete next.dirty.content[page.id]
            })
        } else if (action === 'conflict') {
            contentConflicts.push(page.id)
        } else {
            pulled = pulled || !sameVisiblePage(page, remotePage)
            next.pages[index] = remotePage
            next.base.content[page.id] = remotePage.lastEditDate == null ? null : remotePage.lastEditDate
            delete next.dirty.content[page.id]
        }
    })
    if (contentConflicts.length > 0) {
        conflicts.content = contentConflicts
    }

    // ----- push -----
    if (operations.length > 0) {
        // the bytes first, so the server never holds an element pointing at
        // an asset it does not have
        const pushedAssets = new Set()
        for (const operation of operations) {
            if (operation.page != null) {
                pageAssets(operation.page).forEach(asset => pushedAssets.add(asset))
            }
        }
        for (const asset of next.pendingAssets.slice()) {
            if (pushedAssets.has(asset)) {
                await api.uploadPending(asset)
                next.pendingAssets = next.pendingAssets.filter(pending => pending !== asset)
            }
        }
        let pageLastEditDate = null
        for (let start = 0; start < operations.length; start += MAX_BATCH_OPERATIONS) {
            const response = (await api.pageOperations(operations.slice(start, start + MAX_BATCH_OPERATIONS))) || {}
            const results = response.results || []
            for (let i = 0; i < results.length; i++) {
                const handler = onResult[start + i]
                if (handler != null) {
                    handler(results[i] || {})
                }
            }
            if (response.pageLastEditDate != null) {
                pageLastEditDate = response.pageLastEditDate
            }
        }
        pushed = true
        if (pagesAction === 'push') {
            next.base.pages = pageLastEditDate
            next.dirty.pages = false
        }
        if (pageLastEditDate != null) {
            next.info.pageLastEditDate = pageLastEditDate
        }
    }

    // ----- housekeeping -----
    if (pagesAction !== 'conflict') {
        // tokens of pages that no longer exist on either side
        const kept = new Set(next.pages.map(page => page.id))
        for (const id of Object.keys(next.base.content)) {
            if (!kept.has(id)) {
                delete next.base.content[id]
            }
        }
        for (const id of Object.keys(next.dirty.content)) {
            if (!kept.has(id)) {
                delete next.dirty.content[id]
            }
        }
    }
    // Pending bytes left after the push: those of pages now in sync must
    // reach the server too - the server's page already points at them. That
    // is a page whose push went through but whose response was lost, or a
    // drawing repainted in place (same asset, same page content). Those of
    // pages still in conflict wait; those no page uses are forgotten.
    const referenced = new Set()
    const settled = new Set()
    for (const page of next.pages) {
        const inSync = !next.dirty.content[page.id] && (remoteById.has(page.id) || pagesAction === 'push')
        for (const asset of pageAssets(page)) {
            referenced.add(asset)
            if (inSync) {
                settled.add(asset)
            }
        }
    }
    for (const asset of next.pendingAssets.slice()) {
        if (!referenced.has(asset)) {
            await api.dropPending(asset)
        } else if (settled.has(asset)) {
            await api.uploadPending(asset)
            pushed = true
        } else {
            continue
        }
        next.pendingAssets = next.pendingAssets.filter(pending => pending !== asset)
    }
    if (pushed) {
        try {
            await api.cleanAssets()
        } catch (error) {
            // best-effort: the next clean collects what this one left
        }
    }

    next.conflicts = Object.keys(conflicts).length > 0 ? conflicts : null
    next.syncedAt = Date.now()
    return { record: next, pushed, pulled }
}
