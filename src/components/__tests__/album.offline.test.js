import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showSuccess: vi.fn(), showWarning: vi.fn() }))
vi.mock('../../api/albumApi.js', () => {
    let n = 0
    const json = body => ({ ok: true, json: async () => body })
    return {
        updatePage: vi.fn(async () => json({ lastEditDate: 'srv-' + (++n) })),
        createPage: vi.fn(async () => json({ lastEditDate: 'srv-' + (++n), pageLastEditDate: 'srv-pages-' + n })),
        deletePage: vi.fn(async () => json({ pageLastEditDate: 'srv-pages-' + (++n) })),
        movePage: vi.fn(async () => json({ pageLastEditDate: 'srv-pages-' + (++n) })),
        cleanAssets: vi.fn(async () => json({})),
        pageOperations: vi.fn(async (albumId, operations) => ({
            results: operations.map(() => ({ lastEditDate: 'srv-' + (++n) })),
            pageLastEditDate: operations.some(o => o.op !== 'update') ? 'srv-pages-' + (++n) : undefined,
        })),
        updateAlbum: vi.fn(async () => json({ lastEditDate: 'srv-info-' + (++n) })),
        searchAssets: vi.fn(async (albumId, items) => items.map(() => 'found')),
        probeAsset: vi.fn(async () => ({ status: 'missing', path: '/Souvenirs/trip/data/x' })),
        uploadAsset: vi.fn(async () => json({})),
    }
})

import { showError, showSuccess, showWarning } from '@nextcloud/dialogs'
import * as api from '../../api/albumApi.js'
import album from '../album.vue'
import { SaveQueue } from '../../utils/saveQueue.js'
import { AlbumSession } from '../../offline/albumSession.js'
import { MemoryStore } from '../../offline/store.js'
import { connectivity, reportOnline } from '../../offline/connectivity.js'

// Offline editing of album.vue (issue #22), driven through its methods with
// a plain `this` like album.saving.test.js. The session, the save queue and
// the reconciliation are the real ones; the server is scripted.

function remoteAlbum() {
    return {
        id: 'album-1',
        name: 'Trip',
        date: '20260101120000',
        elementMargin: 1,
        lastEditDate: 'info-1',
        pageLastEditDate: 'pages-1',
        path: '/Souvenirs/trip',
        pages: [
            { id: 'p1', lastEditDate: 't1', elements: [{ id: 'a', class: 'TextElement', text: 'one', top: 0, left: 0, bottom: 100, right: 100 }] },
            { id: 'p2', lastEditDate: 't2', elements: [{ id: 'b', class: 'TextElement', text: 'two', top: 0, left: 0, bottom: 100, right: 100 }] },
        ],
    }
}

let serverAlbum
let store
let media
// when set, album reads wait for it: lets a test act in the middle of a sync
let readGate = null

function gate() {
    let open
    const promise = new Promise(resolve => { open = resolve })
    return { promise, open }
}

function makeMedia() {
    const pending = new Map()
    return {
        pending,
        isSupported: () => true,
        putPending: vi.fn(async (path, asset, blob) => { pending.set(asset, blob) }),
        getPending: vi.fn(async (path, asset) => pending.get(asset) || null),
        deletePending: vi.fn(async (path, asset) => { pending.delete(asset) }),
        putOfflineCopy: vi.fn(async () => {}),
        removeAlbumMedia: vi.fn(async () => {}),
        removeAlbumPending: vi.fn(async () => {}),
        syncAlbumMedia: vi.fn(async () => 0),
    }
}

async function makeAlbum() {
    const ctx = {
        token: '',
        albumId: '',
        albumDavPath: '',
        sName: '',
        albumJson: '',
        elementMargin: 0,
        pages: [],
        displayedPage: 0,
        savingCount: 0,
        pendingSaves: 0,
        editMode: true,
        imageChooserPageId: null,
        imageChooserSaving: false,
        paintSaving: false,
        cleanTimer: null,
        lastSaveErrorAt: 0,
        syncing: false,
        sync: { status: 'none', conflicts: null, pendingAssets: [] },
        conflictChoices: { info: null, pages: null, content: null },
        $nextTick: fn => (fn ? fn() : Promise.resolve()),
    }
    for (const [name, fn] of Object.entries(album.methods)) {
        ctx[name] = fn.bind(ctx)
    }
    ctx.showN = vi.fn()
    ctx.saveQueue = new SaveQueue({
        onChange: n => { ctx.pendingSaves = n },
        onError: e => ctx.onSaveError(e),
    })
    // computed used by the conflict methods
    Object.defineProperty(ctx, 'conflictDomains', {
        get: () => album.computed.conflictDomains.call(ctx),
    })
    ctx.session = new AlbumSession({
        path: '/Souvenirs/trip',
        getPages: () => ctx.pages,
        onState: state => ctx.onSessionState(state),
        onSyncWanted: () => ctx.syncAlbum(),
        store,
        media,
        fetchAlbum: async () => {
            if (serverAlbum instanceof Error) {
                throw serverAlbum
            }
            // read first: what the server had when it answered
            const answer = JSON.parse(JSON.stringify(serverAlbum))
            if (readGate != null) {
                await readGate
            }
            return answer
        },
    })
    const record = await ctx.session.open()
    if (record != null) {
        ctx.applyRecord(record)
    }
    return ctx
}

async function settle(ctx) {
    await vi.runAllTimersAsync()
    await ctx.saveQueue.idle()
}

/** What the scripted server would hold after the batch the app pushed. */
function applyPushToServer() {
    for (const [, operations] of api.pageOperations.mock.calls) {
        for (const operation of operations) {
            if (operation.op === 'update') {
                const target = serverAlbum.pages.find(p => p.id === operation.page.id)
                target.elements = JSON.parse(JSON.stringify(operation.page.elements))
            } else if (operation.op === 'create') {
                serverAlbum.pages.splice(operation.pos, 0, JSON.parse(JSON.stringify(operation.page)))
            } else if (operation.op === 'delete') {
                serverAlbum.pages = serverAlbum.pages.filter(p => p.id !== operation.id)
            }
        }
    }
}

describe('album offline editing', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        store = new MemoryStore()
        media = makeMedia()
        serverAlbum = remoteAlbum()
        readGate = null
        reportOnline()
        connectivity.online = true
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ token: 'fresh' }) })))
    })
    afterEach(() => {
        reportOnline()
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('loads the album through its local copy', async () => {
        const ctx = await makeAlbum()
        expect(ctx.albumId).toBe('album-1')
        expect(ctx.sName).toBe('Trip')
        expect(ctx.albumDavPath).toBe('Souvenirs/trip')
        expect(ctx.elementMargin).toBe(1)
        expect(ctx.pages.map(p => p.id)).toEqual(['p1', 'p2'])
        expect(ctx.sync.status).toBe('synced')
        expect(JSON.parse(ctx.albumJson).pages).toHaveLength(2)
    })

    it('edits online exactly as before: straight to the server', async () => {
        const ctx = await makeAlbum()
        ctx.onEditText('p1', 'a', 'edited')
        await settle(ctx)
        expect(api.updatePage).toHaveBeenCalledTimes(1)
        expect(api.updatePage.mock.calls[0][0]).toBe('album-1')
        expect(ctx.sync.status).toBe('synced')
        expect(api.pageOperations).not.toHaveBeenCalled()
    })

    it('keeps every kind of edit on the device while offline, without an error', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false

        ctx.onEditText('p1', 'a', 'offline text')
        await settle(ctx)
        await ctx.onAddPage(2)
        await settle(ctx)
        await ctx.onMovePage(2, -1)
        await settle(ctx)
        await ctx.onRemoveElement('p2', 'b')
        await settle(ctx)

        expect(showError).not.toHaveBeenCalled()
        expect(api.updatePage).not.toHaveBeenCalled()
        expect(api.createPage).not.toHaveBeenCalled()
        expect(api.movePage).not.toHaveBeenCalled()
        expect(api.deletePage).not.toHaveBeenCalled()
        // the editor shows the result of each action
        expect(ctx.pages).toHaveLength(2)
        expect(ctx.pages[0].elements[0].text).toBe('offline text')
        expect(ctx.pages.find(p => p.id === 'p2')).toBeUndefined()
        expect(ctx.sync.status).toBe('pending')
        expect(ctx.savingCount).toBe(0)
        // and it is stored for the next start
        const stored = await store.getAlbum('album-1')
        expect(stored.pages).toHaveLength(2)
        expect(stored.dirty.pages).toBe(true)
        expect(stored.dirty.content.p1).toBe(true)
    })

    it('falls back to the device when a save cannot reach the server', async () => {
        const ctx = await makeAlbum()
        api.updatePage.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        ctx.onEditText('p1', 'a', 'typed in a tunnel')
        await vi.advanceTimersByTimeAsync(500)
        await ctx.saveQueue.idle()
        expect(showError).not.toHaveBeenCalled()
        expect(connectivity.online).toBe(false)
        expect(ctx.sync.status).toBe('pending')
        expect(ctx.pages[0].elements[0].text).toBe('typed in a tunnel')
    })

    it('sends everything in one batch when the connection is back', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false
        ctx.onEditText('p1', 'a', 'offline text')
        await settle(ctx)
        await ctx.onAddPage(2)
        await settle(ctx)
        const newPageId = ctx.pages[2].id

        connectivity.online = true
        await ctx.syncAlbum()
        await settle(ctx)

        expect(api.pageOperations).toHaveBeenCalledTimes(1)
        const operations = api.pageOperations.mock.calls[0][1]
        expect(operations.map(o => o.op).sort()).toEqual(['create', 'update'])
        expect(operations.find(o => o.op === 'create').page.id).toBe(newPageId)
        expect(operations.find(o => o.op === 'update').page.elements[0].text).toBe('offline text')
        expect(ctx.sync.status).toBe('synced')
        expect(ctx.savingCount).toBe(0)
        expect(ctx.syncing).toBe(false)
        expect(showSuccess).toHaveBeenCalledTimes(1)

        // back to direct saves
        applyPushToServer()
        ctx.onEditText('p1', 'a', 'online again')
        await settle(ctx)
        expect(api.updatePage).toHaveBeenCalledTimes(1)
    })

    it('adds media offline: bytes kept on the device, uploaded by the sync', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false
        ctx.imageChooserPageId = 'p1'
        const file = new File(['IMAGE-BYTES'], 'photo.jpg', { type: 'image/jpeg' })
        await ctx.addUploadedMedia([file])
        await settle(ctx)

        expect(showError).not.toHaveBeenCalled()
        expect(api.uploadAsset).not.toHaveBeenCalled()
        const image = ctx.pages[0].elements.find(e => e.class === 'ImageElement')
        expect(image).toBeDefined()
        expect(ctx.sync.pendingAssets).toEqual([image.image])
        expect(media.pending.has(image.image)).toBe(true)
        expect(ctx.imageChooserPageId).toBeNull()

        connectivity.online = true
        await ctx.syncAlbum()
        await settle(ctx)
        expect(api.uploadAsset).toHaveBeenCalledTimes(1)
        expect(api.uploadAsset.mock.calls[0][0]).toBe('Souvenirs/trip/' + image.image)
        expect(ctx.sync.pendingAssets).toEqual([])
        expect(ctx.sync.status).toBe('synced')
    })

    it('waits for media being added before syncing', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false
        ctx.onEditText('p1', 'a', 'offline text')
        await settle(ctx)
        connectivity.online = true
        ctx.imageChooserSaving = true
        await ctx.syncAlbum()
        expect(api.pageOperations).not.toHaveBeenCalled()
        ctx.imageChooserSaving = false
        await settle(ctx)
        expect(api.pageOperations).toHaveBeenCalledTimes(1)
    })

    it('shows what changed on the server after a reconnection', async () => {
        const ctx = await makeAlbum()
        serverAlbum.pages[1].elements[0].text = 'changed elsewhere'
        serverAlbum.pages[1].lastEditDate = 't2b'
        serverAlbum.pages.push({ id: 'p3', lastEditDate: 't3', elements: [] })
        serverAlbum.pageLastEditDate = 'pages-2'
        await ctx.syncAlbum()
        await settle(ctx)
        expect(ctx.pages.map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
        expect(ctx.pages[1].elements[0].text).toBe('changed elsewhere')
        expect(api.pageOperations).not.toHaveBeenCalled()
        expect(showSuccess).not.toHaveBeenCalled()
    })

    it('does nothing visible when there is nothing to sync', async () => {
        const ctx = await makeAlbum()
        const pagesBefore = ctx.pages
        await ctx.syncAlbum()
        await settle(ctx)
        expect(ctx.pages).toBe(pagesBefore)
        expect(api.pageOperations).not.toHaveBeenCalled()
    })

    it('goes read-only on a conflict and applies the choice of the user', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false
        ctx.onEditText('p1', 'a', 'local text')
        await settle(ctx)
        serverAlbum.pages[0].elements[0].text = 'server text'
        serverAlbum.pages[0].lastEditDate = 't1b'

        connectivity.online = true
        await ctx.syncAlbum()
        await settle(ctx)
        expect(ctx.sync.conflicts).toEqual({ content: ['p1'] })
        expect(ctx.editMode).toBe(false)
        expect(showWarning).toHaveBeenCalledTimes(1)
        expect(ctx.conflictDomains.map(d => d.id)).toEqual(['content'])
        // nothing was overwritten on either side
        expect(ctx.pages[0].elements[0].text).toBe('local text')
        expect(api.pageOperations).not.toHaveBeenCalled()

        ctx.conflictChoices.content = 'remote'
        await ctx.applyConflictChoices()
        await settle(ctx)
        expect(ctx.sync.conflicts).toBeNull()
        expect(ctx.pages[0].elements[0].text).toBe('server text')
        expect(ctx.sync.status).toBe('synced')
        expect(ctx.conflictChoices).toEqual({ info: null, pages: null, content: null })
    })

    it('resolves every conflict at once with a shortcut', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false
        ctx.onEditText('p1', 'a', 'local text')
        await settle(ctx)
        await ctx.onAddPage(2)
        await settle(ctx)
        serverAlbum.pages[0].elements[0].text = 'server text'
        serverAlbum.pages[0].lastEditDate = 't1b'
        serverAlbum.pages.push({ id: 'p9', lastEditDate: 't9', elements: [] })
        serverAlbum.pageLastEditDate = 'pages-2'
        connectivity.online = true
        await ctx.syncAlbum()
        await settle(ctx)
        expect(ctx.conflictDomains.map(d => d.id)).toEqual(['pages', 'content'])

        await ctx.resolveAllConflicts('local')
        await settle(ctx)
        expect(ctx.sync.conflicts).toBeNull()
        expect(ctx.sync.status).toBe('synced')
        const operations = api.pageOperations.mock.calls[0][1]
        // the server's extra page goes, the local one is created, p1 is overwritten
        expect(operations.map(o => o.op).sort()).toEqual(['create', 'delete', 'update'])
        expect(ctx.pages[0].elements[0].text).toBe('local text')
    })

    it('does not revert a caption committed while a sync is reading the server', async () => {
        const ctx = await makeAlbum()
        // something to sync: the server changed another page
        serverAlbum.pages[1].elements[0].text = 'changed elsewhere'
        serverAlbum.pages[1].lastEditDate = 't2b'
        const held = gate()
        readGate = held.promise
        const syncing = ctx.syncAlbum()
        await vi.advanceTimersByTimeAsync(10)
        // the overlay is up, but a caption being typed can still be committed
        expect(ctx.savingCount).toBe(1)
        ctx.onEditText('p1', 'a', 'typed during the sync')
        readGate = null
        held.open()
        await syncing
        await settle(ctx)

        // the server change arrived, the edit was not replaced by the old text
        expect(ctx.pages[1].elements[0].text).toBe('changed elsewhere')
        expect(ctx.pages[0].elements[0].text).toBe('typed during the sync')
        // and it reached the server
        const sent = api.pageOperations.mock.calls.flatMap(call => call[1]).concat(
            api.updatePage.mock.calls.map(call => ({ op: 'update', page: call[1] })))
        expect(sent.some(o => o.page && o.page.id === 'p1' && o.page.elements[0].text === 'typed during the sync')).toBe(true)
        expect(ctx.sync.conflicts).toBeNull()
    })

    it('keeps an edit made while the sync is sending, even when the sync also pulls', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false
        ctx.onEditText('p1', 'a', 'offline text')
        await settle(ctx)
        connectivity.online = true
        serverAlbum.pages.push({ id: 'p3', lastEditDate: 't3', elements: [] })
        serverAlbum.pageLastEditDate = 'pages-2'
        // hold the push: the edit lands while it is in flight
        const held = gate()
        const answer = api.pageOperations.getMockImplementation()
        api.pageOperations.mockImplementationOnce(async (albumId, operations) => {
            await held.promise
            return answer(albumId, operations)
        })
        const syncing = ctx.syncAlbum()
        await vi.advanceTimersByTimeAsync(10)
        ctx.onEditText('p2', 'b', 'typed during the push')
        held.open()
        await syncing
        // the pulled page is there, and the edit survived the page reload
        expect(ctx.pages.map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
        expect(ctx.pages[1].elements[0].text).toBe('typed during the push')
        applyPushToServer()
        await settle(ctx)
        // sent by the next sync
        const allSent = api.pageOperations.mock.calls.flatMap(call => call[1])
        expect(allSent.some(o => o.page && o.page.id === 'p2' && o.page.elements[0].text === 'typed during the push')).toBe(true)
        expect(ctx.sync.status).toBe('synced')
    })

    it('holds an upload confirmed during a sync until the sync is over', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false
        ctx.onEditText('p1', 'a', 'offline text')
        await settle(ctx)
        connectivity.online = true
        const held = gate()
        readGate = held.promise
        const syncing = ctx.syncAlbum()
        await vi.advanceTimersByTimeAsync(10)

        // the chooser sits above the overlay: the user confirms a file now
        ctx.imageChooserPageId = 'p2'
        const adding = ctx.addUploadedMedia([new File(['IMAGE-BYTES'], 'photo.jpg', { type: 'image/jpeg' })])
        await vi.advanceTimersByTimeAsync(10)
        expect(media.putPending).not.toHaveBeenCalled()
        expect(api.uploadAsset).not.toHaveBeenCalled()

        readGate = null
        held.open()
        await syncing
        applyPushToServer()
        await adding
        await settle(ctx)

        const image = ctx.pages[1].elements.find(e => e.class === 'ImageElement')
        expect(image).toBeDefined()
        // its bytes went to the server, once, and nothing is left behind
        expect(api.uploadAsset).toHaveBeenCalledTimes(1)
        expect(api.uploadAsset.mock.calls[0][0]).toBe('Souvenirs/trip/' + image.image)
        expect(media.dropped || []).toEqual([])
        expect(ctx.sync.pendingAssets).toEqual([])
        expect(showError).not.toHaveBeenCalled()
    })

    it('loads the album once the server is back, when it could not be shown at all', async () => {
        connectivity.online = false
        const ctx = await makeAlbum()
        expect(ctx.session.record).toBeNull()
        ctx.unavailable = true
        ctx.refreshAlbum = vi.fn()
        connectivity.online = true
        ctx.onReconnected()
        expect(ctx.unavailable).toBe(false)
        expect(ctx.refreshAlbum).toHaveBeenCalledTimes(1)
    })

    it('syncs on reconnection when the album is shown', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false
        ctx.onEditText('p1', 'a', 'offline text')
        await settle(ctx)
        connectivity.online = true
        await ctx.onReconnected()
        await settle(ctx)
        expect(api.pageOperations).toHaveBeenCalledTimes(1)
        expect(ctx.sync.status).toBe('synced')
    })

    it('keeps working offline when the sync cannot reach the server', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false
        ctx.onEditText('p1', 'a', 'offline text')
        await settle(ctx)
        connectivity.online = true
        serverAlbum = new TypeError('Failed to fetch')
        await ctx.syncAlbum()
        await ctx.saveQueue.idle()
        expect(showError).not.toHaveBeenCalled()
        expect(ctx.sync.status).toBe('pending')
        expect(ctx.syncing).toBe(false)
        expect(ctx.savingCount).toBe(0)
    })

    it('reports a sync the server refused', async () => {
        const ctx = await makeAlbum()
        connectivity.online = false
        ctx.onEditText('p1', 'a', 'offline text')
        await settle(ctx)
        connectivity.online = true
        api.pageOperations.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
        await ctx.syncAlbum()
        await settle(ctx)
        expect(showError).toHaveBeenCalledTimes(1)
        expect(ctx.sync.status).toBe('pending')
        expect(ctx.pages[0].elements[0].text).toBe('offline text')
    })
})

describe('album offline banner', () => {
    // The parts of the component the banner is made of, without mounting it.
    function bannerContext(overrides) {
        const ctx = Object.assign({
            token: '',
            unavailable: false,
            loading: false,
            online: false,
            forcedOffline: false,
            sync: { authExpired: false, gone: false },
            offlineNoticeVisible: false,
            offlineNoticeTimer: null,
        }, overrides)
        ctx.banner = () => album.computed.statusBanner.call(ctx)
        ctx.notice = () => album.computed.offlineNotice.call(ctx)
        ctx.watch = () => album.watch.offlineNotice.handler.call(ctx, ctx.notice())
        return ctx
    }

    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('shows the offline banner for a few seconds only', () => {
        const ctx = bannerContext()
        ctx.watch()
        expect(ctx.banner().id).toBe('offline')
        vi.advanceTimersByTime(4000)
        expect(ctx.banner().id).toBe('offline')
        vi.advanceTimersByTime(2000)
        expect(ctx.banner()).toBe(null)
    })

    it('says so when offline is the user\'s choice, and where to go back online', () => {
        const ctx = bannerContext()
        ctx.watch()
        expect(ctx.banner().text).toContain('when the connection is back')
        ctx.forcedOffline = true
        expect(ctx.banner().text).toContain('Working offline')
        expect(ctx.banner().text).toContain('offline button of the album list')
    })

    it('shows it again each time the connection is lost', () => {
        const ctx = bannerContext()
        ctx.watch()
        vi.advanceTimersByTime(6000)
        ctx.online = true
        ctx.watch()
        expect(ctx.banner()).toBe(null)
        ctx.online = false
        ctx.watch()
        expect(ctx.banner().id).toBe('offline')
    })

    it('drops it at once when the connection is back', () => {
        const ctx = bannerContext()
        ctx.watch()
        ctx.online = true
        ctx.watch()
        expect(ctx.banner()).toBe(null)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('does not show it on a shared album, nor while loading', () => {
        expect(bannerContext({ token: 'abc' }).notice()).toBe(false)
        expect(bannerContext({ loading: true }).notice()).toBe(false)
        expect(bannerContext({ unavailable: true }).notice()).toBe(false)
    })

    it('keeps the banners that ask for an action', () => {
        const expired = bannerContext({ sync: { authExpired: true, gone: false } })
        expired.watch()
        vi.advanceTimersByTime(60000)
        expect(expired.banner().id).toBe('auth')
        const gone = bannerContext({ sync: { authExpired: false, gone: true } })
        gone.watch()
        vi.advanceTimersByTime(60000)
        expect(gone.banner().id).toBe('gone')
    })
})
