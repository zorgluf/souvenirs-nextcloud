import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { reactive } from 'vue'
import { MemoryStore, IndexedDbStore, findAlbumByPath } from '../store.js'

// Local database of the offline feature (issue #22). Both backends must
// behave the same: the suite runs against each.

const BACKENDS = {
    memory: () => new MemoryStore(),
    indexedDB: () => new IndexedDbStore(new IDBFactory()),
}

for (const [name, create] of Object.entries(BACKENDS)) {
    describe('store (' + name + ')', () => {
        let store

        beforeEach(() => {
            store = create()
        })

        it('stores and returns album records by id', async () => {
            expect(await store.getAlbum('a')).toBeNull()
            await store.putAlbum({ id: 'a', path: 'Souvenirs/a', pages: [{ id: 'p1' }] })
            expect(await store.getAlbum('a')).toEqual({ id: 'a', path: 'Souvenirs/a', pages: [{ id: 'p1' }] })
            await store.putAlbum({ id: 'a', path: 'Souvenirs/a', pages: [] })
            expect((await store.getAlbum('a')).pages).toEqual([])
        })

        it('lists and deletes records', async () => {
            await store.putAlbum({ id: 'a', path: 'Souvenirs/a' })
            await store.putAlbum({ id: 'b', path: 'Souvenirs/b' })
            expect((await store.allAlbums()).map(r => r.id).sort()).toEqual(['a', 'b'])
            await store.deleteAlbum('a')
            expect((await store.allAlbums()).map(r => r.id)).toEqual(['b'])
            await store.deleteAlbum('missing')
        })

        it('keeps what it was given, not a live reference to it', async () => {
            const record = { id: 'a', path: 'Souvenirs/a', pages: [{ id: 'p1' }] }
            await store.putAlbum(record)
            record.pages.push({ id: 'p2' })
            const read = await store.getAlbum('a')
            expect(read.pages).toHaveLength(1)
            read.pages.push({ id: 'p3' })
            expect((await store.getAlbum('a')).pages).toHaveLength(1)
        })

        it('accepts reactive objects (the pages of the album view)', async () => {
            const pages = reactive([{ id: 'p1', elements: [{ id: 'e', text: 'x' }] }])
            await store.putAlbum({ id: 'a', path: 'Souvenirs/a', pages })
            expect((await store.getAlbum('a')).pages).toEqual([{ id: 'p1', elements: [{ id: 'e', text: 'x' }] }])
        })

        it('stores settings', async () => {
            expect(await store.getMeta('user')).toBeNull()
            await store.setMeta('user', 'alice')
            await store.setMeta('albumList', [{ id: 'a' }])
            expect(await store.getMeta('user')).toBe('alice')
            expect(await store.getMeta('albumList')).toEqual([{ id: 'a' }])
        })

        it('clears everything', async () => {
            await store.putAlbum({ id: 'a', path: 'Souvenirs/a' })
            await store.setMeta('user', 'alice')
            await store.clear()
            expect(await store.allAlbums()).toEqual([])
            expect(await store.getMeta('user')).toBeNull()
        })

        it('finds a record by album folder, whatever the spelling', async () => {
            await store.putAlbum({ id: 'a', path: 'Souvenirs/a' })
            expect((await findAlbumByPath(store, '/Souvenirs/a/')).id).toBe('a')
            expect(await findAlbumByPath(store, 'Souvenirs/other')).toBeNull()
        })
    })
}

describe('IndexedDbStore', () => {
    it('finds its data again after a reload', async () => {
        const factory = new IDBFactory()
        const first = new IndexedDbStore(factory)
        await first.putAlbum({ id: 'a', path: 'Souvenirs/a', dirty: { pages: true } })
        await first.setMeta('user', 'alice')
        const second = new IndexedDbStore(factory)
        expect((await second.getAlbum('a')).dirty).toEqual({ pages: true })
        expect(await second.getMeta('user')).toBe('alice')
    })
})
