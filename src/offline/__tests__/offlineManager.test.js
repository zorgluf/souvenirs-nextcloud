import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FakeCaches } from '../../../tests/frontend/fakeCaches.js'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showSuccess: vi.fn(), showWarning: vi.fn() }))
vi.mock('../../api/albumApi.js', () => ({
    updateAlbum: vi.fn(async () => ({ ok: true, json: async () => ({ lastEditDate: 'srv-info' }) })),
    pageOperations: vi.fn(async (albumId, operations) => ({ results: operations.map(() => ({ lastEditDate: 'srv-page' })) })),
    uploadAsset: vi.fn(async () => ({ ok: true })),
    cleanAssets: vi.fn(async () => ({ ok: true })),
}))

import * as albumApi from '../../api/albumApi.js'
import {
    claimForCurrentUser, wipeEverything, rememberAlbumList, knownAlbumList, localStates, syncAll,
    saveAlbumInfo, prepareOffline, downloadOffline, removeOffline, forgetAlbum, forgetMissingAlbums, storageUsage,
    confirmLogout, orphanAlbums,
} from '../offlineManager.js'
import { MemoryStore } from '../store.js'
import { connectivity, reportOnline, setForcedOffline } from '../connectivity.js'
import { recordFromRemote } from '../albumSync.js'
import { MEDIA_CACHE, PENDING_CACHE, SHELL_CACHE, mediaKey } from '../mediaKeys.js'
import { setActiveAlbum, backgroundSyncOf } from '../syncService.js'

// App-wide side of the offline feature (issue #22): album list kept for
// offline starts, background sync, media kept on the device.

function remoteAlbum(id = 'album-1', overrides = {}) {
    return {
        id,
        name: 'Trip ' + id,
        date: '20260101120000',
        lastEditDate: 'info-1',
        pageLastEditDate: 'pages-1',
        path: '/Souvenirs/' + id,
        pages: [{ id: 'p1', lastEditDate: 't1', elements: [{ id: 'a', class: 'ImageElement', image: 'data/a.jpg', size: 100 }] }],
        ...overrides,
    }
}

let store
let caches
let server

beforeEach(() => {
    store = new MemoryStore()
    caches = new FakeCaches()
    vi.stubGlobal('caches', caches)
    vi.clearAllMocks()
    connectivity.forced = false
    reportOnline()
    connectivity.online = true
    // albums the "server" holds, by id; fetch serves the token, the album
    // reads and the media downloads
    server = { 'album-1': remoteAlbum('album-1'), 'album-2': remoteAlbum('album-2') }
    vi.stubGlobal('fetch', vi.fn(async url => {
        const target = String(url)
        if (target.includes('/csrftoken')) {
            return new Response(JSON.stringify({ token: 'fresh' }))
        }
        const full = /apiv2\/album\/unknown\/full\?apath=([^&]+)/.exec(target)
        if (full) {
            const path = decodeURIComponent(full[1])
            const album = Object.values(server).find(a => a.path === path)
            return album ? new Response(JSON.stringify(album)) : new Response('{}', { status: 404 })
        }
        const summary = /apiv2\/album\/([^/?]+)$/.exec(target)
        if (summary) {
            const album = server[decodeURIComponent(summary[1])]
            return album ? new Response(JSON.stringify({ ...album, pages: undefined })) : new Response('{}', { status: 404 })
        }
        if (target.includes('/preview?') || target.includes('/asset?')) {
            return new Response('MEDIA', { headers: { 'Content-Type': 'image/jpeg' } })
        }
        return new Response('{}', { status: 404 })
    }))
})

afterEach(() => {
    reportOnline()
    setActiveAlbum(null)
    vi.unstubAllGlobals()
})

describe('ownership of the local data', () => {
    it('claims an empty browser for the current user', async () => {
        expect(await claimForCurrentUser(store, 'alice')).toBe(false)
        expect(await store.getMeta('user')).toBe('alice')
        expect(await claimForCurrentUser(store, 'alice')).toBe(false)
    })

    it('wipes everything when another account opens the app', async () => {
        await claimForCurrentUser(store, 'alice')
        await store.putAlbum(recordFromRemote(remoteAlbum()))
        await (await caches.open(MEDIA_CACHE)).put('https://x/media', new Response('m'))
        await (await caches.open(PENDING_CACHE)).put('https://x/pending', new Response('p'))
        await (await caches.open(SHELL_CACHE)).put('https://x/shell', new Response('s'))

        expect(await claimForCurrentUser(store, 'bob')).toBe(true)
        expect(await store.allAlbums()).toEqual([])
        expect(await caches.has(MEDIA_CACHE)).toBe(false)
        expect(await caches.has(PENDING_CACHE)).toBe(false)
        expect(await caches.has(SHELL_CACHE)).toBe(false)
        expect(await store.getMeta('user')).toBe('bob')
    })

    it('does nothing when the user is unknown (public page)', async () => {
        await claimForCurrentUser(store, 'alice')
        expect(await claimForCurrentUser(store, '')).toBe(false)
        expect(await store.getMeta('user')).toBe('alice')
    })

    it('lets the user log out without a question when everything was sent', async () => {
        await store.putAlbum(recordFromRemote(remoteAlbum()))
        const ask = vi.fn()
        expect(await confirmLogout(store, ask)).toBe(true)
        expect(ask).not.toHaveBeenCalled()
    })

    it('asks before a logout that would lose changes not sent yet', async () => {
        const record = recordFromRemote(remoteAlbum())
        record.dirty.content.p1 = true
        await store.putAlbum(record)
        const stay = vi.fn(() => false)
        expect(await confirmLogout(store, stay)).toBe(false)
        expect(stay).toHaveBeenCalledTimes(1)
        expect(stay.mock.calls[0][0]).toContain('not sent')
        expect(await confirmLogout(store, () => true)).toBe(true)
    })

    it('wipes on demand', async () => {
        await store.putAlbum(recordFromRemote(remoteAlbum()))
        await store.setMeta('albumList', [{ id: 'album-1' }])
        await wipeEverything(store)
        expect(await store.allAlbums()).toEqual([])
        expect(await store.getMeta('albumList')).toBeNull()
    })

    it('stops working offline by choice when everything is wiped', async () => {
        await setForcedOffline(true)
        expect(connectivity.online).toBe(false)
        await wipeEverything(store)
        // the choice is dropped at once; the server is asked in the background
        expect(connectivity.forced).toBe(false)
        await vi.waitFor(() => expect(connectivity.online).toBe(true))
    })

    it('syncs nothing in the background while working offline by choice', async () => {
        const record = recordFromRemote(remoteAlbum())
        record.dirty.info = true
        await store.putAlbum(record)
        await setForcedOffline(true)
        fetch.mockClear()
        await syncAll(() => {}, store)
        expect(fetch).not.toHaveBeenCalled()
    })
})

describe('album list kept for offline starts', () => {
    it('remembers the summaries of the list', async () => {
        await rememberAlbumList([{ id: 'album-1', path: '/Souvenirs/a', name: 'A', date: '2026', albumImage: 'data/c.jpg', isShared: true, extra: 1 }], store)
        expect(await knownAlbumList(store)).toEqual([{ id: 'album-1', path: '/Souvenirs/a', name: 'A', date: '2026', albumImage: 'data/c.jpg' }])
    })

    it('shows the name and date of the local copy, which may hold offline edits', async () => {
        await rememberAlbumList([{ id: 'album-1', path: '/Souvenirs/album-1', name: 'Old name', date: '2025' }], store)
        const record = recordFromRemote(remoteAlbum())
        record.info.name = 'Renamed offline'
        await store.putAlbum(record)
        const list = await knownAlbumList(store)
        expect(list[0].name).toBe('Renamed offline')
        expect(list[0].date).toBe('20260101120000')
    })

    it('reports the status of the local copies', async () => {
        const clean = recordFromRemote(remoteAlbum('album-1'))
        clean.offline = true
        clean.offlineBytes = 5000
        const dirty = recordFromRemote(remoteAlbum('album-2'))
        dirty.dirty.pages = true
        await store.putAlbum(clean)
        await store.putAlbum(dirty)
        expect(await localStates(store)).toEqual({
            'album-1': { status: 'synced', offline: true, offlineBytes: 5000, name: 'Trip album-1' },
            'album-2': { status: 'pending', offline: false, offlineBytes: 0, name: 'Trip album-2' },
        })
    })
})

describe('background sync', () => {
    it('sends the changes made offline and reports each album', async () => {
        const record = recordFromRemote(remoteAlbum('album-1'))
        record.pages[0].elements[0].text = 'edited offline'
        record.dirty.content.p1 = true
        await store.putAlbum(record)
        // a clean, online-only copy: nothing to do for it
        await store.putAlbum(recordFromRemote(remoteAlbum('album-2')))
        const seen = []
        await syncAll(result => seen.push(result), store)
        expect(albumApi.pageOperations).toHaveBeenCalledTimes(1)
        expect(albumApi.pageOperations.mock.calls[0][0]).toBe('album-1')
        expect(seen).toHaveLength(1)
        expect(seen[0].pushed).toBe(true)
        expect(seen[0].conflict).toBe(false)
        expect((await localStates(store))['album-1'].status).toBe('synced')
    })

    it('refreshes the albums kept offline and their media', async () => {
        const record = recordFromRemote(remoteAlbum('album-1'))
        record.offline = true
        await store.putAlbum(record)
        server['album-1'].pages[0].elements[0].image = 'data/b.jpg'
        server['album-1'].pages[0].lastEditDate = 't1b'
        await syncAll(() => {}, store)
        const stored = await store.getAlbum('album-1')
        expect(stored.pages[0].elements[0].image).toBe('data/b.jpg')
        expect(stored.offlineBytes).toBe('MEDIA'.length)
        const keys = (await (await caches.open(MEDIA_CACHE)).keys()).map(k => k.url)
        expect(keys).toEqual([mediaKey(globalThis.location.origin, 'Souvenirs/album-1', 'b.jpg')])
    })

    it('reports conflicts and leaves albums already in conflict to the user', async () => {
        const record = recordFromRemote(remoteAlbum('album-1'))
        record.pages[0].elements[0].text = 'local'
        record.dirty.content.p1 = true
        await store.putAlbum(record)
        server['album-1'].pages[0].elements[0].text = 'remote'
        server['album-1'].pages[0].lastEditDate = 't1b'
        const seen = []
        await syncAll(result => seen.push(result), store)
        expect(seen[0].conflict).toBe(true)
        expect((await localStates(store))['album-1'].status).toBe('conflict')
        // second run: not retried, the user decides in the album
        fetch.mockClear()
        await syncAll(result => seen.push(result), store)
        expect(seen).toHaveLength(1)
        expect(fetch.mock.calls.some(call => String(call[0]).includes('apiv2'))).toBe(false)
    })

    it('leaves the album that is open in the view alone', async () => {
        const record = recordFromRemote(remoteAlbum('album-1'))
        record.pages[0].elements[0].text = 'edited offline'
        record.dirty.content.p1 = true
        await store.putAlbum(record)
        setActiveAlbum('/Souvenirs/album-1')
        const seen = []
        await syncAll(result => seen.push(result), store)
        expect(albumApi.pageOperations).not.toHaveBeenCalled()
        expect(seen).toEqual([])
        expect((await localStates(store))['album-1'].status).toBe('pending')
    })

    it('syncs each album from its current state, not from where the run started', async () => {
        const first = recordFromRemote(remoteAlbum('album-1'))
        first.info.name = 'Renamed offline'
        first.dirty.info = true
        await store.putAlbum(first)
        const second = recordFromRemote(remoteAlbum('album-2'))
        second.dirty.content.p1 = true
        second.pages[0].elements[0].text = 'edited offline'
        await store.putAlbum(second)
        // while album-1 is being synced, album-2 gets synced elsewhere (the
        // user opened it): its stored copy is clean by the time its turn comes
        albumApi.updateAlbum.mockImplementationOnce(async () => {
            const clean = recordFromRemote(remoteAlbum('album-2'))
            await store.putAlbum(clean)
            return { ok: true, json: async () => ({ lastEditDate: 'srv-info' }) }
        })
        await syncAll(() => {}, store)
        expect(albumApi.updateAlbum).toHaveBeenCalledTimes(1)
        expect(albumApi.pageOperations).not.toHaveBeenCalled()
    })

    it('exposes the sync of an album while it runs, for the view to wait on', async () => {
        const record = recordFromRemote(remoteAlbum('album-1'))
        record.info.name = 'Renamed offline'
        record.dirty.info = true
        await store.putAlbum(record)
        let during = 'not seen'
        albumApi.updateAlbum.mockImplementationOnce(async () => {
            during = backgroundSyncOf('album-1')
            return { ok: true, json: async () => ({ lastEditDate: 'srv-info' }) }
        })
        await syncAll(() => {}, store)
        expect(during).toBeInstanceOf(Promise)
        expect(backgroundSyncOf('album-1')).toBeNull()
    })

    it('does nothing while offline, and stops at the first unreachable request', async () => {
        const record = recordFromRemote(remoteAlbum('album-1'))
        record.dirty.pages = true
        await store.putAlbum(record)
        connectivity.online = false
        await syncAll(() => {}, store)
        expect(fetch).not.toHaveBeenCalled()

        connectivity.online = true
        fetch.mockImplementation(async url => {
            if (String(url).includes('/csrftoken')) {
                return new Response(JSON.stringify({ token: 't' }))
            }
            throw new TypeError('Failed to fetch')
        })
        await syncAll(() => {}, store)
        expect(connectivity.online).toBe(false)
        expect((await localStates(store))['album-1'].status).toBe('pending')
    })

    it('carries on with the other albums when one is gone from the server', async () => {
        const gone = recordFromRemote(remoteAlbum('album-9'))
        gone.dirty.info = true
        await store.putAlbum(gone)
        const record = recordFromRemote(remoteAlbum('album-1'))
        record.info.name = 'Renamed'
        record.dirty.info = true
        await store.putAlbum(record)
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        await syncAll(() => {}, store)
        warn.mockRestore()
        expect(albumApi.updateAlbum).toHaveBeenCalledWith('album-1', { name: 'Renamed', date: '20260101120000' })
        expect((await localStates(store))['album-1'].status).toBe('synced')
        expect((await localStates(store))['album-9'].status).toBe('pending')
    })
})

describe('album name and date', () => {
    it('saves on the server when it is reachable, keeping the local copy in step', async () => {
        await store.putAlbum(recordFromRemote(remoteAlbum()))
        await saveAlbumInfo('album-1', { name: 'New', date: '20270101000000' }, store)
        expect(albumApi.updateAlbum).toHaveBeenCalledWith('album-1', { name: 'New', date: '20270101000000' })
        const stored = await store.getAlbum('album-1')
        expect(stored.info.name).toBe('New')
        expect(stored.base.info).toBe('srv-info')
        expect(stored.dirty.info).toBe(false)
    })

    it('saves on the server an album that has no local copy', async () => {
        await saveAlbumInfo('album-7', { name: 'New', date: '2027' }, store)
        expect(albumApi.updateAlbum).toHaveBeenCalledTimes(1)
        expect(await store.getAlbum('album-7')).toBeNull()
    })

    it('keeps the change in the local copy while offline', async () => {
        await store.putAlbum(recordFromRemote(remoteAlbum()))
        connectivity.online = false
        await saveAlbumInfo('album-1', { name: 'Offline name', date: '20270101000000' }, store)
        expect(albumApi.updateAlbum).not.toHaveBeenCalled()
        const stored = await store.getAlbum('album-1')
        expect(stored.info.name).toBe('Offline name')
        expect(stored.dirty.info).toBe(true)
        expect(stored.base.info).toBe('info-1')
    })

    it('keeps the change locally when the request cannot reach the server', async () => {
        await store.putAlbum(recordFromRemote(remoteAlbum()))
        albumApi.updateAlbum.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        await saveAlbumInfo('album-1', { name: 'Offline name', date: '2027' }, store)
        expect((await store.getAlbum('album-1')).dirty.info).toBe(true)
        expect(connectivity.online).toBe(false)
    })

    it('does not jump the queue of changes already waiting', async () => {
        const record = recordFromRemote(remoteAlbum())
        record.dirty.pages = true
        await store.putAlbum(record)
        await saveAlbumInfo('album-1', { name: 'Later', date: '2027' }, store)
        expect(albumApi.updateAlbum).not.toHaveBeenCalled()
        expect((await store.getAlbum('album-1')).dirty.info).toBe(true)
    })

    it('refuses to edit offline an album that is not on this device', async () => {
        connectivity.online = false
        await expect(saveAlbumInfo('album-7', { name: 'x', date: '2027' }, store)).rejects.toThrow()
    })

    it('reports server errors', async () => {
        await store.putAlbum(recordFromRemote(remoteAlbum()))
        albumApi.updateAlbum.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
        await expect(saveAlbumInfo('album-1', { name: 'x', date: '2027' }, store)).rejects.toThrow('boom')
        expect((await store.getAlbum('album-1')).dirty.info).toBe(false)
    })
})

describe('media kept on the device', () => {
    it('mirrors an album never opened, to estimate its download', async () => {
        const prepared = await prepareOffline({ id: 'album-1', path: '/Souvenirs/album-1' }, store)
        expect(prepared.count).toBe(1)
        expect(prepared.bytes).toBeGreaterThan(0)
        expect(prepared.record.offline).toBe(false)
        expect((await store.getAlbum('album-1')).pages).toHaveLength(1)
    })

    it('downloads an album, marks it offline and accounts for its size', async () => {
        await prepareOffline({ id: 'album-1', path: '/Souvenirs/album-1' }, store)
        const progress = []
        const record = await downloadOffline('album-1', { onProgress: p => progress.push(p.done + '/' + p.total) }, store)
        expect(record.offline).toBe(true)
        expect(record.offlineBytes).toBe('MEDIA'.length)
        expect(progress).toEqual(['0/1', '1/1'])
        expect(await storageUsage(store)).toMatchObject({
            albums: [{ id: 'album-1', name: 'Trip album-1', bytes: 5, status: 'synced' }],
            total: 5,
        })
    })

    it('keeps nothing of a cancelled download', async () => {
        await prepareOffline({ id: 'album-1', path: '/Souvenirs/album-1' }, store)
        const controller = new AbortController()
        controller.abort()
        await expect(downloadOffline('album-1', { signal: controller.signal }, store)).rejects.toMatchObject({ name: 'AbortError' })
        expect((await store.getAlbum('album-1')).offline).toBe(false)
        expect(await (await caches.open(MEDIA_CACHE)).keys()).toEqual([])
    })

    it('removes the offline copy but keeps the album editable offline', async () => {
        await prepareOffline({ id: 'album-1', path: '/Souvenirs/album-1' }, store)
        await downloadOffline('album-1', {}, store)
        await removeOffline('album-1', store)
        const stored = await store.getAlbum('album-1')
        expect(stored.offline).toBe(false)
        expect(stored.offlineBytes).toBe(0)
        expect(stored.pages).toHaveLength(1)
        expect(await (await caches.open(MEDIA_CACHE)).keys()).toEqual([])
        expect((await storageUsage(store)).albums).toEqual([])
    })

    it('forgets the copies of albums deleted elsewhere, but not unsent changes', async () => {
        await store.putAlbum(recordFromRemote(remoteAlbum('album-1')))
        await store.putAlbum(recordFromRemote(remoteAlbum('album-2')))
        const edited = recordFromRemote(remoteAlbum('album-3'))
        edited.dirty.content.p1 = true
        await store.putAlbum(edited)
        // the server now only has album-1
        expect(await forgetMissingAlbums(['album-1'], store)).toEqual(['album-2'])
        expect((await store.allAlbums()).map(r => r.id).sort()).toEqual(['album-1', 'album-3'])
        // the one with unsent changes stays listed, to be opened and dealt with
        expect(await orphanAlbums(['album-1'], store)).toEqual([
            { id: 'album-3', path: '/Souvenirs/album-3', name: 'Trip album-3', date: '20260101120000', albumImage: undefined },
        ])
    })

    it('forgets an album entirely', async () => {
        await prepareOffline({ id: 'album-1', path: '/Souvenirs/album-1' }, store)
        await downloadOffline('album-1', {}, store)
        await forgetAlbum('album-1', store)
        expect(await store.getAlbum('album-1')).toBeNull()
        expect(await (await caches.open(MEDIA_CACHE)).keys()).toEqual([])
    })
})
