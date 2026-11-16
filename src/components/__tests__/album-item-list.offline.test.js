import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showSuccess: vi.fn(), showWarning: vi.fn() }))

import AlbumItemList from '../album-item-list.vue'
import { connectivity, reportOnline, reportOffline } from '../../offline/connectivity.js'
import { getStore } from '../../offline/store.js'
import { rememberAlbumList } from '../../offline/offlineManager.js'
import { recordFromRemote } from '../../offline/albumSync.js'

// The album list with and without the server (issue #22). Children are
// stubbed: the list logic is what is under test.

const ALBUMS = {
    'album-1': { id: 'album-1', path: '/Souvenirs/a', name: 'Alpha', date: '20260201120000' },
    'album-2': { id: 'album-2', path: '/Souvenirs/b', name: 'Beta', date: '20260101120000' },
}

let wrapper = null
let serverUp = true
let host = null

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mountList() {
    wrapper = mount(AlbumItemList, {
        attachTo: host,
        global: {
            stubs: {
                'album-item': {
                    props: ['name', 'albumId', 'localState', 'online', 'unavailable'],
                    template: '<div class="item" :data-id="albumId" :data-unavailable="String(unavailable)" :data-status="localState ? localState.status : \'\'">{{ name }}</div>',
                },
                'offline-dialog': true,
                'storage-dialog': true,
                NcModal: true,
                NcButton: { template: '<button :disabled="$attrs.disabled"><slot /></button>' },
                NcLoadingIcon: true,
                NcTextField: true,
                NcDateTimePickerNative: true,
            },
        },
    })
    return wrapper
}

async function settle() {
    // page loads chain several requests, watchers and store writes
    for (let i = 0; i < 40; i++) {
        await flushPromises()
    }
}

function names() {
    return wrapper.findAll('.item').map(item => item.text())
}

beforeEach(async () => {
    host = document.createElement('div')
    host.id = 'souvenirs-main'
    document.body.appendChild(host)
    serverUp = true
    reportOnline()
    connectivity.online = true
    await getStore().clear()
    vi.stubGlobal('fetch', vi.fn(async url => {
        if (!serverUp) {
            throw new TypeError('Failed to fetch')
        }
        const target = String(url)
        if (target.includes('/csrftoken')) {
            return json({ token: 't' })
        }
        if (target.includes('apiv2/share')) {
            return json([])
        }
        const page = /apiv2\/album\?page=(\d+)/.exec(target)
        if (page) {
            return json(page[1] === '1' ? Object.keys(ALBUMS) : [])
        }
        const one = /apiv2\/album\/([^/?]+)$/.exec(target)
        if (one) {
            return json(ALBUMS[one[1]])
        }
        return json({}, 404)
    }))
})

afterEach(() => {
    if (wrapper) {
        wrapper.unmount()
        wrapper = null
    }
    host.remove()
    reportOnline()
    vi.unstubAllGlobals()
})

describe('album list offline', () => {
    it('lists the albums of the server and remembers them for offline starts', async () => {
        mountList()
        await settle()
        expect(names()).toEqual(['Alpha', 'Beta'])
        expect(wrapper.find('.offline-banner').exists()).toBe(false)
        expect((await getStore().getMeta('albumList')).map(a => a.id).sort()).toEqual(['album-1', 'album-2'])
    })

    it('shows the remembered list when the server cannot be reached', async () => {
        await rememberAlbumList(Object.values(ALBUMS))
        await getStore().putAlbum(recordFromRemote({ ...ALBUMS['album-1'], pages: [] }, '/Souvenirs/a'))
        serverUp = false
        mountList()
        await settle()
        expect(connectivity.online).toBe(false)
        expect(names()).toEqual(['Alpha', 'Beta'])
        expect(wrapper.find('.offline-banner').exists()).toBe(true)
        // only the album with a copy on this device can be opened
        const items = wrapper.findAll('.item')
        expect(items[0].attributes('data-unavailable')).toBe('false')
        expect(items[0].attributes('data-status')).toBe('synced')
        expect(items[1].attributes('data-unavailable')).toBe('true')
    })

    it('does not keep asking a server that does not answer', async () => {
        await rememberAlbumList(Object.values(ALBUMS))
        serverUp = false
        mountList()
        await settle()
        const calls = fetch.mock.calls.filter(call => String(call[0]).includes('apiv2/album')).length
        await settle()
        await settle()
        expect(fetch.mock.calls.filter(call => String(call[0]).includes('apiv2/album')).length).toBe(calls)
        expect(calls).toBeLessThanOrEqual(1)
    })

    it('goes straight to the device when already known to be offline', async () => {
        await rememberAlbumList(Object.values(ALBUMS))
        connectivity.online = false
        mountList()
        await settle()
        expect(names()).toEqual(['Alpha', 'Beta'])
        expect(fetch.mock.calls.some(call => String(call[0]).includes('apiv2/album'))).toBe(false)
    })

    it('guides the user when nothing was ever kept on the device', async () => {
        serverUp = false
        mountList()
        await settle()
        expect(names()).toEqual([])
        expect(wrapper.find('.offline-empty').exists()).toBe(true)
        expect(wrapper.find('.offline-empty').text()).toContain('first synchronization')
    })

    it('cannot create an album offline', async () => {
        connectivity.online = false
        mountList()
        await settle()
        expect(wrapper.find('.create-album-fab').attributes('disabled')).toBeDefined()
    })

    it('reloads the real list when the server is back', async () => {
        await rememberAlbumList([ALBUMS['album-1']])
        serverUp = false
        mountList()
        await settle()
        expect(names()).toEqual(['Alpha'])
        serverUp = true
        reportOffline()
        reportOnline()
        await settle()
        expect(names()).toEqual(['Alpha', 'Beta'])
        expect(wrapper.find('.offline-banner').exists()).toBe(false)
    })

    it('asks for each page of the list exactly once, also when the list is reloaded', async () => {
        // 12 albums: two pages of ids, then an empty one
        const many = {}
        for (let i = 1; i <= 12; i++) {
            many['a' + i] = { id: 'a' + i, path: '/Souvenirs/a' + i, name: 'Album ' + i, date: '202601' + String(i).padStart(2, '0') + '120000' }
        }
        const ids = Object.keys(many)
        fetch.mockImplementation(async url => {
            const target = String(url)
            if (target.includes('/csrftoken')) {
                return json({ token: 't' })
            }
            if (target.includes('apiv2/share')) {
                return json([])
            }
            const page = /apiv2\/album\?page=(\d+)/.exec(target)
            if (page) {
                const n = Number(page[1])
                return json(ids.slice((n - 1) * 10, n * 10))
            }
            const one = /apiv2\/album\/([^/?]+)$/.exec(target)
            return one ? json(many[one[1]]) : json({}, 404)
        })
        // every album has a clean copy on this device
        for (const album of Object.values(many)) {
            await getStore().putAlbum(recordFromRemote({ ...album, pages: [] }, album.path))
        }
        const pagesAsked = () => fetch.mock.calls.map(call => /apiv2\/album\?page=(\d+)/.exec(String(call[0])))
            .filter(match => match != null).map(match => match[1])

        mountList()
        await settle()
        expect(names()).toHaveLength(12)
        expect(pagesAsked()).toEqual(['1', '2', '3'])

        // reload (reconnection, album created or renamed): the list was
        // complete, the view is at its bottom
        fetch.mockClear()
        wrapper.vm.refreshAlbums()
        await settle()
        expect(pagesAsked()).toEqual(['1', '2', '3'])
        expect(names()).toHaveLength(12)
        // no copy was taken for an album deleted elsewhere
        expect((await getStore().allAlbums()).map(r => r.id).sort()).toEqual(ids.slice().sort())
    })

    it('does not take an unreadable answer for an unreachable server', async () => {
        fetch.mockImplementation(async url => (String(url).includes('apiv2/album?page')
            ? new Response('<html>error</html>', { status: 500 })
            : json([])))
        mountList()
        await settle()
        expect(connectivity.online).toBe(true)
        expect(wrapper.find('.offline-banner').exists()).toBe(false)
        const asked = fetch.mock.calls.filter(call => String(call[0]).includes('apiv2/album?page')).length
        await settle()
        expect(fetch.mock.calls.filter(call => String(call[0]).includes('apiv2/album?page')).length).toBe(asked)
    })

    it('forgets the local copy of an album deleted elsewhere', async () => {
        await getStore().putAlbum(recordFromRemote({ id: 'album-9', name: 'Gone', date: '2020', pages: [] }, '/Souvenirs/gone'))
        mountList()
        await settle()
        expect(await getStore().getAlbum('album-9')).toBeNull()
    })
})
