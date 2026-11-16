// In-memory stand-in for the Cache API (CacheStorage / Cache), for the unit
// tests of the offline feature: happy-dom and node provide none. Only what
// the app uses: open/delete, and match/put/delete/keys keyed by URL.

function urlOf(key) {
    return typeof key === 'string' ? key : key.url
}

function withoutSearch(url) {
    const parsed = new URL(url)
    parsed.search = ''
    return parsed.href
}

class FakeCache {
    constructor() {
        this.entries = new Map()
        // set to an Error to make the next put() fail (e.g. quota)
        this.failPutWith = null
    }

    async match(key, { ignoreSearch = false } = {}) {
        const url = urlOf(key)
        let response = this.entries.get(url)
        if (response == null && ignoreSearch) {
            for (const [stored, value] of this.entries) {
                if (withoutSearch(stored) === withoutSearch(url)) {
                    response = value
                    break
                }
            }
        }
        return response == null ? undefined : response.clone()
    }

    async put(key, response) {
        if (this.failPutWith != null) {
            throw this.failPutWith
        }
        const url = urlOf(key)
        // like the real one: a replaced entry moves to the end
        this.entries.delete(url)
        this.entries.set(url, response)
    }

    async delete(key) {
        return this.entries.delete(urlOf(key))
    }

    async keys() {
        return [...this.entries.keys()].map(url => ({ url }))
    }
}

export class FakeCaches {
    constructor() {
        this.caches = new Map()
    }

    async open(name) {
        if (!this.caches.has(name)) {
            this.caches.set(name, new FakeCache())
        }
        return this.caches.get(name)
    }

    async delete(name) {
        return this.caches.delete(name)
    }

    async has(name) {
        return this.caches.has(name)
    }
}
