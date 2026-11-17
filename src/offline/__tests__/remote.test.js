import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RemoteError, errorKind, isDeferrable, fetchAlbumByPath, fetchAlbumOfRecord } from '../remote.js'
import { connectivity, refreshToken, reportOffline, reportOnline, onReconnect } from '../connectivity.js'

// Classification of request failures and reads of the album (issue #22).

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    reportOnline()
})

afterEach(() => {
    reportOnline()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('errorKind', () => {
    it('classifies failures of fetch and of the write API', () => {
        expect(errorKind(new TypeError('Failed to fetch'))).toBe('network')
        expect(errorKind(Object.assign(new Error('x'), { status: 401 }))).toBe('auth')
        expect(errorKind(Object.assign(new Error('x'), { status: 404 }))).toBe('notfound')
        expect(errorKind(Object.assign(new Error('x'), { status: 502 }))).toBe('network')
        expect(errorKind(Object.assign(new Error('x'), { status: 503 }))).toBe('network')
        expect(errorKind(Object.assign(new Error('x'), { status: 504 }))).toBe('network')
        expect(errorKind(Object.assign(new Error('x'), { status: 423 }))).toBe('server')
        expect(errorKind(Object.assign(new Error('x'), { status: 500 }))).toBe('server')
        expect(errorKind(new Error('bug'))).toBe('server')
        expect(errorKind(null)).toBe('server')
        expect(errorKind(new RemoteError('auth', 401))).toBe('auth')
    })

    it('defers what the server never saw or refused for lack of a session', () => {
        expect(isDeferrable(new TypeError('Failed to fetch'))).toBe(true)
        expect(isDeferrable(Object.assign(new Error('x'), { status: 401 }))).toBe(true)
        expect(isDeferrable(Object.assign(new Error('x'), { status: 504 }))).toBe(true)
        // a busy album or a server error is a real answer
        expect(isDeferrable(Object.assign(new Error('x'), { status: 423 }))).toBe(false)
        expect(isDeferrable(Object.assign(new Error('x'), { status: 500 }))).toBe(false)
        expect(isDeferrable(Object.assign(new Error('x'), { status: 404 }))).toBe(false)
    })
})

describe('album reads', () => {
    it('reads the full album of a folder', async () => {
        fetch.mockResolvedValue(json({ id: 'a', path: '/Souvenirs/a', pages: [] }))
        const album = await fetchAlbumByPath('Souvenirs/a b')
        expect(album.id).toBe('a')
        expect(fetch.mock.calls[0][0]).toContain('/apps/souvenirs/apiv2/album/unknown/full?apath=%2FSouvenirs%2Fa%20b')
    })

    it('tells apart an unreachable server, a lost session and a missing album', async () => {
        fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        await expect(fetchAlbumByPath('a')).rejects.toMatchObject({ kind: 'network' })
        fetch.mockResolvedValueOnce(json({ message: 'nope' }, 401))
        await expect(fetchAlbumByPath('a')).rejects.toMatchObject({ kind: 'auth' })
        fetch.mockResolvedValueOnce(json({}, 404))
        await expect(fetchAlbumByPath('a')).rejects.toMatchObject({ kind: 'notfound' })
        fetch.mockResolvedValueOnce(json({}, 500))
        await expect(fetchAlbumByPath('a')).rejects.toMatchObject({ kind: 'server' })
    })

    it('treats a redirect (to the login page) as a lost session', async () => {
        const login = new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } })
        Object.defineProperty(login, 'redirected', { value: true })
        fetch.mockResolvedValueOnce(login)
        await expect(fetchAlbumByPath('a')).rejects.toMatchObject({ kind: 'auth' })
    })

    it('rejects an answer that is not JSON', async () => {
        fetch.mockResolvedValueOnce(new Response('<html>'))
        await expect(fetchAlbumByPath('a')).rejects.toMatchObject({ kind: 'server' })
    })

    it('follows an album whose folder was renamed on the server', async () => {
        fetch.mockImplementation(async url => {
            const target = String(url)
            if (target.includes('apath=%2FSouvenirs%2Fold')) {
                return json({}, 404)
            }
            if (target.endsWith('/apiv2/album/a')) {
                return json({ id: 'a', path: '/Souvenirs/new' })
            }
            if (target.includes('apath=%2FSouvenirs%2Fnew')) {
                return json({ id: 'a', path: '/Souvenirs/new', pages: [] })
            }
            return json({}, 500)
        })
        const album = await fetchAlbumOfRecord({ id: 'a', path: 'Souvenirs/old' })
        expect(album.path).toBe('/Souvenirs/new')
    })

    it('reports an album that is gone for good', async () => {
        fetch.mockResolvedValue(json({}, 404))
        await expect(fetchAlbumOfRecord({ id: 'a', path: 'Souvenirs/old' })).rejects.toMatchObject({ kind: 'notfound' })
        // the index still points at the folder that no longer holds an album
        fetch.mockImplementation(async url => (String(url).endsWith('/apiv2/album/a')
            ? json({ id: 'a', path: '/Souvenirs/old' })
            : json({}, 404)))
        await expect(fetchAlbumOfRecord({ id: 'a', path: 'Souvenirs/old' })).rejects.toMatchObject({ kind: 'notfound' })
    })
})

describe('connectivity', () => {
    it('refreshes the CSRF token and hands it to Nextcloud', async () => {
        const emit = vi.fn()
        vi.stubGlobal('_nc_event_bus', { emit })
        fetch.mockResolvedValue(json({ token: 'fresh-token' }))
        expect(await refreshToken()).toBe(true)
        expect(fetch.mock.calls[0][0]).toContain('/csrftoken')
        expect(emit).toHaveBeenCalledWith('csrf-token-update', { token: 'fresh-token' })
    })

    it('reports an unreachable server', async () => {
        fetch.mockRejectedValue(new TypeError('Failed to fetch'))
        expect(await refreshToken()).toBe(false)
    })

    it('does not take a gateway error or maintenance mode for a reachable server', async () => {
        for (const status of [502, 503, 504]) {
            fetch.mockResolvedValueOnce(json({}, status))
            expect(await refreshToken()).toBe(false)
        }
        // any other answer comes from Nextcloud itself
        fetch.mockResolvedValueOnce(json({}, 500))
        expect(await refreshToken()).toBe(true)
    })

    it('calls the reconnect listeners once the server is back, and only then', async () => {
        const listener = vi.fn()
        const stop = onReconnect(listener)
        reportOnline()
        expect(listener).not.toHaveBeenCalled()
        reportOffline()
        expect(connectivity.online).toBe(false)
        reportOnline()
        expect(connectivity.online).toBe(true)
        expect(listener).toHaveBeenCalledTimes(1)
        stop()
        reportOffline()
        reportOnline()
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('probes the server while offline until it answers', async () => {
        vi.useFakeTimers()
        const listener = vi.fn()
        const stop = onReconnect(listener)
        fetch.mockRejectedValue(new TypeError('Failed to fetch'))
        reportOffline()
        await vi.advanceTimersByTimeAsync(6000)
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(connectivity.online).toBe(false)
        fetch.mockResolvedValue(json({ token: 't' }))
        await vi.advanceTimersByTimeAsync(16000)
        expect(connectivity.online).toBe(true)
        expect(listener).toHaveBeenCalledTimes(1)
        // no more probing once back
        const calls = fetch.mock.calls.length
        await vi.advanceTimersByTimeAsync(120000)
        expect(fetch.mock.calls.length).toBe(calls)
        stop()
    })
})
