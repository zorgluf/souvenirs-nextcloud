import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AlbumSession, PERSIST_DELAY_MS, SYNC_DELAY_MS } from '../albumSession.js'
import { connectivity, reportOnline } from '../connectivity.js'
import { MemoryStore } from '../store.js'
import { RemoteError } from '../remote.js'
import { recordFromRemote } from '../albumSync.js'
import { trackBackgroundSync, isActiveAlbum, setActiveAlbum } from '../syncService.js'

// The open album's link to the server and to its local copy (issue #22):
// writes go to the server while it answers, stay on the device otherwise.

function remoteAlbum(overrides = {}) {
    return {
        id: 'album-1',
        name: 'Trip',
        date: '20260101120000',
        lastEditDate: 'info-1',
        pageLastEditDate: 'pages-1',
        path: '/Souvenirs/trip',
        pages: [
            { id: 'p1', lastEditDate: 't1', elements: [{ id: 'a', class: 'TextElement', text: 'one' }] },
            { id: 'p2', lastEditDate: 't2', elements: [{ id: 'b', class: 'TextElement', text: 'two' }] },
        ],
        ...overrides,
    }
}

function networkError() {
    return new TypeError('Failed to fetch')
}

function makeApi() {
    let n = 0
    const json = body => ({ ok: true, json: async () => body })
    return {
        updatePage: vi.fn(async () => json({ lastEditDate: 'srv-' + (++n) })),
        createPage: vi.fn(async () => json({ lastEditDate: 'srv-' + (++n), pageLastEditDate: 'srv-pages-' + n })),
        deletePage: vi.fn(async () => json({ pageLastEditDate: 'srv-pages-' + (++n) })),
        movePage: vi.fn(async () => json({ pageLastEditDate: 'srv-pages-' + (++n) })),
        pageOperations: vi.fn(async (albumId, operations) => ({
            results: operations.map(o => (o.op === 'update' || o.op === 'create' ? { lastEditDate: 'srv-' + (++n) } : {})),
            pageLastEditDate: operations.some(o => o.op !== 'update') ? 'srv-pages-' + (++n) : undefined,
        })),
        updateAlbum: vi.fn(async () => json({ lastEditDate: 'srv-info-' + (++n) })),
        uploadAsset: vi.fn(async () => json({})),
        cleanAssets: vi.fn(async () => json({})),
    }
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
        syncAlbumMedia: vi.fn(async () => 1234),
    }
}

let store
let api
let media
let pages
let states
let syncWanted
let serverAlbum

function makeSession() {
    return new AlbumSession({
        path: '/Souvenirs/trip',
        getPages: () => pages,
        onState: state => states.push(state),
        onSyncWanted: syncWanted,
        store,
        api,
        media,
        fetchAlbum: vi.fn(async () => {
            if (serverAlbum instanceof Error) {
                throw serverAlbum
            }
            return JSON.parse(JSON.stringify(serverAlbum))
        }),
    })
}

async function openSession() {
    const session = makeSession()
    const record = await session.open()
    pages = JSON.parse(JSON.stringify(record ? record.pages : []))
    return session
}

beforeEach(() => {
    vi.useFakeTimers()
    store = new MemoryStore()
    api = makeApi()
    media = makeMedia()
    pages = []
    states = []
    syncWanted = vi.fn()
    serverAlbum = remoteAlbum()
    reportOnline()
    connectivity.online = true
    // the CSRF token refresh that precedes a sync
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ token: 'fresh' }) })))
})

afterEach(() => {
    reportOnline()
    setActiveAlbum(null)
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('opening', () => {
    it('mirrors the album of the server on first open', async () => {
        const session = await openSession()
        expect(session.record.id).toBe('album-1')
        expect(session.record.path).toBe('Souvenirs/trip')
        expect(session.state.status).toBe('synced')
        const stored = await store.getAlbum('album-1')
        expect(stored.pages).toHaveLength(2)
        expect(stored.base.content).toEqual({ p1: 't1', p2: 't2' })
    })

    it('opens the local copy when the server cannot be reached', async () => {
        await openSession()
        serverAlbum = new RemoteError('network')
        const session = await openSession()
        expect(session.record.pages).toHaveLength(2)
        expect(connectivity.online).toBe(false)
        expect(session.isLocalMode()).toBe(true)
    })

    it('does not ask the server at all while offline', async () => {
        await openSession()
        connectivity.online = false
        const session = makeSession()
        await session.open()
        expect(session.fetchAlbum).not.toHaveBeenCalled()
        expect(session.record.pages).toHaveLength(2)
    })

    it('has nothing to show for an album never opened, without the server', async () => {
        connectivity.online = false
        const session = makeSession()
        expect(await session.open()).toBeNull()
        expect(session.state.status).toBe('none')
    })

    it('opens the local copy and says so when the session expired', async () => {
        await openSession()
        serverAlbum = new RemoteError('auth', 401)
        const session = await openSession()
        expect(session.record).not.toBeNull()
        expect(session.state.authExpired).toBe(true)
        expect(connectivity.online).toBe(true)
        expect(session.isLocalMode()).toBe(true)
    })

    it('keeps a local copy viewable when the album is gone from the server', async () => {
        await openSession()
        serverAlbum = new RemoteError('notfound', 404)
        const session = await openSession()
        expect(session.record).not.toBeNull()
        expect(session.state.gone).toBe(true)
    })

    it('sends what was edited offline when the album is opened online again', async () => {
        const record = recordFromRemote(remoteAlbum())
        record.pages[0].elements[0].text = 'edited offline'
        record.dirty.content.p1 = true
        await store.putAlbum(record)
        const session = await openSession()
        expect(api.pageOperations).toHaveBeenCalledTimes(1)
        expect(api.pageOperations.mock.calls[0][1][0].page.elements[0].text).toBe('edited offline')
        expect(session.state.status).toBe('synced')
        expect(pages[0].elements[0].text).toBe('edited offline')
    })

    it('keeps the offline edits when sending them fails at open', async () => {
        const record = recordFromRemote(remoteAlbum())
        record.pages[0].elements[0].text = 'edited offline'
        record.dirty.content.p1 = true
        await store.putAlbum(record)
        api.pageOperations.mockRejectedValue(networkError())
        const session = await openSession()
        expect(session.state.status).toBe('pending')
        expect(pages[0].elements[0].text).toBe('edited offline')
        expect(connectivity.online).toBe(false)
    })

    it('waits for a background sync of the same album, and starts from its result', async () => {
        // the album list is sending this album's offline edits right now
        const stale = recordFromRemote(remoteAlbum())
        stale.pages[0].elements[0].text = 'edited offline'
        stale.dirty.content.p1 = true
        await store.putAlbum(stale)
        let finish
        const background = new Promise(resolve => { finish = resolve })
        trackBackgroundSync('album-1', background)

        const session = makeSession()
        const opening = session.open()
        await vi.advanceTimersByTimeAsync(10)
        expect(session.fetchAlbum).not.toHaveBeenCalled()

        // the background sync ends: pushed, stored clean
        const synced = recordFromRemote(remoteAlbum())
        synced.pages[0].elements[0].text = 'edited offline'
        synced.base.content.p1 = 'srv-bg'
        await store.putAlbum(synced)
        serverAlbum.pages[0].elements[0].text = 'edited offline'
        serverAlbum.pages[0].lastEditDate = 'srv-bg'
        finish()
        await opening

        // nothing was pushed a second time, and no false conflict
        expect(api.pageOperations).not.toHaveBeenCalled()
        expect(session.state.status).toBe('synced')
        expect(session.record.pages[0].elements[0].text).toBe('edited offline')
    })

    it('marks its album as the open one, until closed', async () => {
        const session = await openSession()
        expect(isActiveAlbum('/Souvenirs/trip/')).toBe(true)
        expect(isActiveAlbum('Souvenirs/other')).toBe(false)
        await session.close()
        expect(isActiveAlbum('Souvenirs/trip')).toBe(false)
    })

    it('still shows the album when the device refuses to store it', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        store.putAlbum = vi.fn(async () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }) })
        const session = await openSession()
        error.mockRestore()
        expect(session.record.pages).toHaveLength(2)
        expect(pages).toHaveLength(2)
        // and edits still reach the server
        await session.updatePage('album-1', pages[0])
        expect(api.updatePage).toHaveBeenCalledTimes(1)
    })

    it('refreshes the media of an album kept offline', async () => {
        const record = recordFromRemote(remoteAlbum())
        record.offline = true
        await store.putAlbum(record)
        const session = await openSession()
        await vi.advanceTimersByTimeAsync(PERSIST_DELAY_MS + 10)
        expect(media.syncAlbumMedia).toHaveBeenCalledTimes(1)
        expect(session.record.offlineBytes).toBe(1234)
    })
})

describe('direct mode (server reachable, nothing pending)', () => {
    it('writes to the server and records the tokens it returns', async () => {
        const session = await openSession()
        await session.updatePage('album-1', pages[0])
        expect(api.updatePage).toHaveBeenCalledWith('album-1', pages[0])
        expect(session.record.base.content.p1).toBe('srv-1')
        expect(session.state.status).toBe('synced')
        expect(syncWanted).not.toHaveBeenCalled()

        const created = { id: 'n1', elements: [] }
        await session.createPage('album-1', 1, created)
        expect(session.record.base.content.n1).toBe('srv-2')
        expect(session.record.base.pages).toBe('srv-pages-2')

        await session.movePage('album-1', 'p2', 0)
        expect(session.record.base.pages).toBe('srv-pages-3')

        await session.deletePage('album-1', 'n1')
        expect(session.record.base.content.n1).toBeUndefined()
        expect(session.record.base.pages).toBe('srv-pages-4')

        await session.pageOperations('album-1', [
            { op: 'update', page: pages[0] },
            { op: 'create', pos: 2, page: { id: 'n2', elements: [] } },
            { op: 'delete', id: 'p2' },
        ])
        expect(session.record.base.content.p1).toBe('srv-5')
        expect(session.record.base.content.n2).toBe('srv-6')
        expect(session.record.base.content.p2).toBeUndefined()
        expect(session.record.base.pages).toBe('srv-pages-7')
        expect(session.state.status).toBe('synced')
    })

    it('stores the copy with the pages as the view shows them', async () => {
        const session = await openSession()
        pages[0].elements[0].text = 'typed'
        await session.updatePage('album-1', pages[0])
        await vi.advanceTimersByTimeAsync(PERSIST_DELAY_MS + 10)
        const stored = await store.getAlbum('album-1')
        expect(stored.pages[0].elements[0].text).toBe('typed')
        expect(stored.base.content.p1).toBe('srv-1')
        expect(stored.dirty.content).toEqual({})
    })

    it('uploads new assets to the album folder', async () => {
        const session = await openSession()
        const blob = new Blob(['bytes'])
        await session.uploadNewAsset('data/new.jpg', blob)
        expect(api.uploadAsset).toHaveBeenCalledWith('Souvenirs/trip/data/new.jpg', blob)
        expect(media.putPending).not.toHaveBeenCalled()
        expect(session.state.pendingAssets).toEqual([])
    })

    it('still reports real failures', async () => {
        const session = await openSession()
        api.updatePage.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))
        await expect(session.updatePage('album-1', pages[0])).rejects.toThrow('boom')
        expect(session.state.status).toBe('synced')
        api.updatePage.mockRejectedValue(Object.assign(new Error('busy'), { status: 423 }))
        await expect(session.updatePage('album-1', pages[0])).rejects.toMatchObject({ status: 423 })
    })
})

describe('local mode (server unreachable)', () => {
    it('keeps a write that could not reach the server, and switches to local mode', async () => {
        const session = await openSession()
        api.updatePage.mockRejectedValue(networkError())
        await session.updatePage('album-1', pages[0])
        expect(connectivity.online).toBe(false)
        expect(session.record.dirty.content).toEqual({ p1: true })
        expect(session.state.status).toBe('pending')
        // the token of the last sync is untouched
        expect(session.record.base.content.p1).toBe('t1')

        // from now on nothing is sent
        api.updatePage.mockClear()
        await session.updatePage('album-1', pages[1])
        await session.createPage('album-1', 2, { id: 'n1', elements: [] })
        await session.deletePage('album-1', 'p2')
        await session.movePage('album-1', 'p1', 2)
        expect(api.updatePage).not.toHaveBeenCalled()
        expect(api.createPage).not.toHaveBeenCalled()
        expect(api.deletePage).not.toHaveBeenCalled()
        expect(api.movePage).not.toHaveBeenCalled()
        expect(session.record.dirty.pages).toBe(true)
        // the deleted page keeps its token: the sync needs it
        expect(session.record.base.content.p2).toBe('t2')
        expect(session.record.dirty.content.p2).toBeUndefined()
    })

    it('marks each operation of a batch', async () => {
        const session = await openSession()
        connectivity.online = false
        await session.pageOperations('album-1', [
            { op: 'update', page: pages[0] },
            { op: 'create', pos: 1, page: { id: 'n1', elements: [] } },
        ])
        expect(api.pageOperations).not.toHaveBeenCalled()
        expect(session.record.dirty).toEqual({ info: false, pages: true, content: { p1: true } })
    })

    it('treats a gateway timeout and a lost session like an unreachable server', async () => {
        const session = await openSession()
        api.updatePage.mockRejectedValueOnce(Object.assign(new Error('gateway'), { status: 504 }))
        await session.updatePage('album-1', pages[0])
        expect(session.state.status).toBe('pending')

        reportOnline()
        const other = await openSession()
        api.deletePage.mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { status: 401 }))
        await other.deletePage('album-1', 'p2')
        expect(other.state.authExpired).toBe(true)
        expect(other.record.dirty.pages).toBe(true)
    })

    it('keeps new media on the device until they can be uploaded', async () => {
        const session = await openSession()
        connectivity.online = false
        const blob = new Blob(['bytes'])
        await session.uploadNewAsset('data/new.jpg', blob)
        expect(api.uploadAsset).not.toHaveBeenCalled()
        expect(media.putPending).toHaveBeenCalledWith('Souvenirs/trip', 'data/new.jpg', blob)
        expect(session.state.pendingAssets).toEqual(['data/new.jpg'])
        expect(session.state.status).toBe('pending')
    })

    it('keeps the bytes when the upload itself cannot reach the server', async () => {
        const session = await openSession()
        api.uploadAsset.mockRejectedValue(networkError())
        await session.uploadNewAsset('data/new.jpg', new Blob(['bytes']))
        expect(media.pending.has('data/new.jpg')).toBe(true)
        // the page that uses it must not be sent before its bytes
        await session.updatePage('album-1', pages[0])
        expect(api.updatePage).not.toHaveBeenCalled()
    })

    it('stores the local changes so they survive a reload', async () => {
        const session = await openSession()
        connectivity.online = false
        pages[0].elements[0].text = 'offline edit'
        await session.updatePage('album-1', pages[0])
        await session.close()
        const stored = await store.getAlbum('album-1')
        expect(stored.pages[0].elements[0].text).toBe('offline edit')
        expect(stored.dirty.content).toEqual({ p1: true })
    })

    it('does not clean assets while changes are pending', async () => {
        const session = await openSession()
        await session.cleanAssets('album-1')
        expect(api.cleanAssets).toHaveBeenCalledTimes(1)
        connectivity.online = false
        await session.cleanAssets('album-1')
        expect(api.cleanAssets).toHaveBeenCalledTimes(1)
    })

    it('asks for a sync shortly after a local write, but only if the server is reachable', async () => {
        const session = await openSession()
        connectivity.online = false
        await session.updatePage('album-1', pages[0])
        await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS + 10)
        expect(syncWanted).not.toHaveBeenCalled()

        // reachable again, with changes still pending: local mode goes on
        connectivity.online = true
        await session.updatePage('album-1', pages[1])
        expect(api.updatePage).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS + 10)
        expect(syncWanted).toHaveBeenCalledTimes(1)
    })
})

describe('sync', () => {
    it('sends the local changes and goes back to direct mode', async () => {
        const session = await openSession()
        connectivity.online = false
        pages[0].elements[0].text = 'offline edit'
        await session.updatePage('album-1', pages[0])

        connectivity.online = true
        const remote = await session.fetchRemote()
        expect(remote).not.toBeNull()
        expect(session.needsSync(remote)).toBe(true)
        const result = await session.reconcileWith(remote)
        expect(result.pushed).toBe(true)
        expect(api.pageOperations).toHaveBeenCalledTimes(1)
        expect(session.state.status).toBe('synced')
        expect(session.isLocalMode()).toBe(false)
        expect((await store.getAlbum('album-1')).dirty.content).toEqual({})

        await session.updatePage('album-1', pages[0])
        expect(api.updatePage).toHaveBeenCalledTimes(1)
    })

    it('has nothing to do when nothing changed on either side', async () => {
        const session = await openSession()
        expect(session.needsSync(await session.fetchRemote())).toBe(false)
    })

    it('notices changes made on the server', async () => {
        const session = await openSession()
        serverAlbum = remoteAlbum()
        serverAlbum.pages[1].elements[0].text = 'changed there'
        serverAlbum.pages[1].lastEditDate = 't2b'
        const remote = await session.fetchRemote()
        expect(session.needsSync(remote)).toBe(true)
        const result = await session.reconcileWith(remote)
        expect(result.pulled).toBe(true)
        expect(result.record.pages[1].elements[0].text).toBe('changed there')
    })

    it('does not mistake its own direct writes for server changes', async () => {
        const session = await openSession()
        pages[0].elements[0].text = 'typed'
        await session.updatePage('album-1', pages[0])
        // the server now has the edit, under the token it returned
        serverAlbum = remoteAlbum()
        serverAlbum.pages[0].elements[0].text = 'typed'
        serverAlbum.pages[0].lastEditDate = 'srv-1'
        expect(session.needsSync(await session.fetchRemote())).toBe(false)
    })

    it('reports conflicts and applies the user choice', async () => {
        const session = await openSession()
        connectivity.online = false
        pages[0].elements[0].text = 'local'
        await session.updatePage('album-1', pages[0])
        connectivity.online = true
        serverAlbum = remoteAlbum()
        serverAlbum.pages[0].elements[0].text = 'remote'
        serverAlbum.pages[0].lastEditDate = 't1b'

        let result = await session.reconcileWith(await session.fetchRemote())
        expect(result.record.conflicts).toEqual({ content: ['p1'] })
        expect(session.state.status).toBe('conflict')
        expect(session.state.conflicts).toEqual({ content: ['p1'] })
        expect(session.isLocalMode()).toBe(true)

        result = await session.reconcileWith(await session.fetchRemote(), { content: 'remote' })
        expect(result.record.conflicts).toBeNull()
        expect(result.pulled).toBe(true)
        expect(result.record.pages[0].elements[0].text).toBe('remote')
        expect(session.state.status).toBe('synced')
    })

    it('cannot sync without the server, and says why', async () => {
        const session = await openSession()
        serverAlbum = new RemoteError('network')
        expect(await session.fetchRemote()).toBeNull()
        expect(connectivity.online).toBe(false)

        reportOnline()
        serverAlbum = new RemoteError('auth', 401)
        expect(await session.fetchRemote()).toBeNull()
        expect(session.state.authExpired).toBe(true)

        // logged in again
        serverAlbum = remoteAlbum()
        expect(await session.fetchRemote()).not.toBeNull()
        expect(session.state.authExpired).toBe(false)
    })

    it('stays in local mode when the token refresh shows the server is unreachable', async () => {
        const session = await openSession()
        fetch.mockRejectedValue(networkError())
        expect(await session.fetchRemote()).toBeNull()
        expect(connectivity.online).toBe(false)
    })

    it('keeps the changes when sending them fails', async () => {
        const session = await openSession()
        connectivity.online = false
        pages[0].elements[0].text = 'offline edit'
        await session.updatePage('album-1', pages[0])
        connectivity.online = true
        const remote = await session.fetchRemote()
        api.pageOperations.mockRejectedValue(networkError())
        await expect(session.reconcileWith(remote)).rejects.toThrow()
        expect(session.state.status).toBe('pending')
        expect((await store.getAlbum('album-1')).dirty.content).toEqual({ p1: true })
    })

    it('does not take an edit whose save has not run yet for an unchanged page', async () => {
        const session = await openSession()
        // edited in the view; the debounced save is still waiting
        pages[0].elements[0].text = 'typed, not saved yet'
        serverAlbum.pages[1].elements[0].text = 'changed elsewhere'
        serverAlbum.pages[1].lastEditDate = 't2b'
        const result = await session.reconcileWith(await session.fetchRemote())
        expect(result.record.pages[0].elements[0].text).toBe('typed, not saved yet')
        expect(result.record.pages[1].elements[0].text).toBe('changed elsewhere')
        // pushed, since nobody else touched that page
        expect(api.pageOperations).toHaveBeenCalledTimes(1)
        expect(api.pageOperations.mock.calls[0][1][0].page.elements[0].text).toBe('typed, not saved yet')
        expect(session.state.status).toBe('synced')
    })

    it('reports a conflict rather than dropping an unsaved edit the server also changed', async () => {
        const session = await openSession()
        pages[0].elements[0].text = 'typed, not saved yet'
        serverAlbum.pages[0].elements[0].text = 'changed elsewhere'
        serverAlbum.pages[0].lastEditDate = 't1b'
        const result = await session.reconcileWith(await session.fetchRemote())
        expect(result.record.conflicts).toEqual({ content: ['p1'] })
        expect(result.record.pages[0].elements[0].text).toBe('typed, not saved yet')
        expect(api.pageOperations).not.toHaveBeenCalled()
    })

    it('does not flag a page it just saved itself', async () => {
        const session = await openSession()
        pages[0].elements[0].text = 'saved online'
        await session.updatePage('album-1', pages[0])
        serverAlbum.pages[0].elements[0].text = 'saved online'
        serverAlbum.pages[0].lastEditDate = 'srv-1'
        const remote = await session.fetchRemote()
        expect(session.needsSync(remote)).toBe(false)
        const result = await session.reconcileWith(remote)
        expect(result.pushed).toBe(false)
        expect(api.pageOperations).not.toHaveBeenCalled()
        expect(session.state.status).toBe('synced')
    })

    it('reports a successful sync even when the result cannot be stored', async () => {
        const session = await openSession()
        connectivity.online = false
        pages[0].elements[0].text = 'offline edit'
        await session.updatePage('album-1', pages[0])
        connectivity.online = true
        const remote = await session.fetchRemote()
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        store.putAlbum = vi.fn(async () => { throw new Error('full') })
        const result = await session.reconcileWith(remote)
        error.mockRestore()
        expect(result.pushed).toBe(true)
        expect(session.state.status).toBe('synced')
    })

    it('uploads pending media during the sync', async () => {
        const session = await openSession()
        connectivity.online = false
        await session.uploadNewAsset('data/new.jpg', new Blob(['bytes']))
        pages[0].elements.push({ id: 'img', class: 'ImageElement', image: 'data/new.jpg' })
        await session.updatePage('album-1', pages[0])
        connectivity.online = true
        await session.reconcileWith(await session.fetchRemote())
        expect(api.uploadAsset).toHaveBeenCalledTimes(1)
        expect(api.uploadAsset.mock.calls[0][0]).toBe('Souvenirs/trip/data/new.jpg')
        expect(media.pending.size).toBe(0)
        expect(session.state.pendingAssets).toEqual([])
        expect(session.state.status).toBe('synced')
    })
})
