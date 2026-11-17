/**
 * Local database of the offline feature (issue #22): the album records
 * (see albumSync.js) and a few settings. IndexedDB holds metadata only - a
 * few KB per album; media bytes live in the Cache API (mediaCache.js).
 *
 * Two interchangeable backends with the same promise API:
 *   getAlbum(id) putAlbum(record) deleteAlbum(id) allAlbums()
 *   getMeta(key) setMeta(key, value) clear()
 * The memory one backs the unit tests and browsers without IndexedDB
 * (private windows of some browsers): nothing survives a reload there, the
 * rest of the feature keeps working within the page.
 */

import { normalizePath } from './mediaKeys.js'

const DB_NAME = 'souvenirs-offline'
const DB_VERSION = 1
const ALBUMS = 'albums'
const META = 'meta'

/** Records are stored as plain JSON: reactive proxies cannot be cloned. */
function plain(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

export class MemoryStore {
    constructor() {
        this.albums = new Map()
        this.meta = new Map()
    }

    async getAlbum(id) {
        return plain(this.albums.get(id)) || null
    }

    async putAlbum(record) {
        this.albums.set(record.id, plain(record))
    }

    async deleteAlbum(id) {
        this.albums.delete(id)
    }

    async allAlbums() {
        return [...this.albums.values()].map(plain)
    }

    async getMeta(key) {
        const value = this.meta.get(key)
        return value === undefined ? null : plain(value)
    }

    async setMeta(key, value) {
        this.meta.set(key, plain(value))
    }

    async clear() {
        this.albums.clear()
        this.meta.clear()
    }
}

function promisify(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export class IndexedDbStore {
    /**
     * @param {IDBFactory} factory - e.g. window.indexedDB
     */
    constructor(factory) {
        this.factory = factory
        this.opening = null
    }

    open() {
        if (this.opening == null) {
            this.opening = new Promise((resolve, reject) => {
                const request = this.factory.open(DB_NAME, DB_VERSION)
                request.onupgradeneeded = () => {
                    const db = request.result
                    if (!db.objectStoreNames.contains(ALBUMS)) {
                        db.createObjectStore(ALBUMS, { keyPath: 'id' })
                    }
                    if (!db.objectStoreNames.contains(META)) {
                        db.createObjectStore(META)
                    }
                }
                request.onsuccess = () => {
                    const db = request.result
                    // another tab upgrading the schema: let it, reopen on next use
                    db.onversionchange = () => {
                        db.close()
                        this.opening = null
                    }
                    resolve(db)
                }
                request.onerror = () => {
                    this.opening = null
                    reject(request.error)
                }
            })
        }
        return this.opening
    }

    async store(name, mode) {
        const db = await this.open()
        return db.transaction(name, mode).objectStore(name)
    }

    async getAlbum(id) {
        return (await promisify((await this.store(ALBUMS, 'readonly')).get(id))) || null
    }

    async putAlbum(record) {
        await promisify((await this.store(ALBUMS, 'readwrite')).put(plain(record)))
    }

    async deleteAlbum(id) {
        await promisify((await this.store(ALBUMS, 'readwrite')).delete(id))
    }

    async allAlbums() {
        return promisify((await this.store(ALBUMS, 'readonly')).getAll())
    }

    async getMeta(key) {
        const value = await promisify((await this.store(META, 'readonly')).get(key))
        return value === undefined ? null : value
    }

    async setMeta(key, value) {
        await promisify((await this.store(META, 'readwrite')).put(plain(value), key))
    }

    async clear() {
        await promisify((await this.store(ALBUMS, 'readwrite')).clear())
        await promisify((await this.store(META, 'readwrite')).clear())
    }
}

/**
 * The record of the album stored in a given folder, or null.
 *
 * @param {object} store
 * @param {string} path - album folder relative to the user's files
 * @returns {Promise<object|null>}
 */
export async function findAlbumByPath(store, path) {
    const wanted = normalizePath(path)
    return (await store.allAlbums()).find(record => record.path === wanted) || null
}

let defaultStore = null

/** The store of this browser: IndexedDB when available, memory otherwise. */
export function getStore() {
    if (defaultStore == null) {
        let factory = null
        try {
            factory = globalThis.indexedDB || null
        } catch (error) {
            // access denied (some privacy modes)
        }
        defaultStore = factory != null ? new FallbackStore(new IndexedDbStore(factory)) : new MemoryStore()
    }
    return defaultStore
}

/**
 * IndexedDB, degrading to memory when the database cannot be opened (Firefox
 * private windows expose indexedDB but refuse to open one). Only the opening
 * decides: a later failure (e.g. quota) is reported, never papered over.
 */
class FallbackStore {
    constructor(primary) {
        this.primary = primary
        this.backend = null
    }

    resolve() {
        if (this.backend == null) {
            this.backend = this.primary.open().then(() => this.primary, error => {
                console.warn('souvenirs: IndexedDB unavailable, offline data will not survive a reload', error)
                return new MemoryStore()
            })
        }
        return this.backend
    }

    async call(method, args) {
        return (await this.resolve())[method](...args)
    }

    getAlbum(...args) { return this.call('getAlbum', args) }
    putAlbum(...args) { return this.call('putAlbum', args) }
    deleteAlbum(...args) { return this.call('deleteAlbum', args) }
    allAlbums(...args) { return this.call('allAlbums', args) }
    getMeta(...args) { return this.call('getMeta', args) }
    setMeta(...args) { return this.call('setMeta', args) }
    clear(...args) { return this.call('clear', args) }
}
