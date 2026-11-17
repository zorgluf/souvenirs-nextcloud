// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeCaches } from '../../../tests/frontend/fakeCaches.js'

vi.mock('@nextcloud/router', () => ({ generateUrl: path => '/index.php' + path }))

import {
    albumMediaPlan, estimateAlbumBytes, putPending, getPending, deletePending, putOfflineCopy,
    syncAlbumMedia, removeAlbumMedia, removeAlbumPending, clearAllMedia, isSupported, QuotaError,
    OFFLINE_PREVIEW_SIZE,
} from '../mediaCache.js'
import { MEDIA_CACHE, PENDING_CACHE, mediaKey } from '../mediaKeys.js'

// Offline copies of album media (issue #22), against an in-memory Cache API.

const ORIGIN = 'https://cloud.example.com'

function record(pages, overrides = {}) {
    return { id: 'album-1', path: 'Souvenirs/trip', info: { name: 'Trip' }, pages, ...overrides }
}

const PAGES = [
    { id: 'p1', elements: [
        { class: 'ImageElement', image: 'data/photo.jpg', mime: 'image/jpeg', size: 4000000 },
        { class: 'TextElement', text: 'hello', size: 0 },
        { class: 'PaintElement', image: 'data/paint.png', size: 30000 },
        { class: 'AudioElement', audio: 'data/song.mp3', size: 5000000 },
    ] },
    { id: 'p2', elements: [
        { class: 'VideoElement', video: 'data/clip.mp4', image: 'data/poster.jpg', mime: 'video/mp4', size: 50000000 },
        { class: 'ImageElement', image: 'data/pano.jpg', mime: 'application/vnd.google.panorama360+jpg', size: 9000000 },
        { class: 'ImageElement', image: 'data/anim.gif', mime: 'image/gif', size: 700000 },
        // the same photo twice: one copy
        { class: 'ImageElement', image: 'data/photo.jpg', mime: 'image/jpeg', size: 4000000 },
    ] },
]

let caches

beforeEach(() => {
    caches = new FakeCaches()
    vi.stubGlobal('caches', caches)
    vi.stubGlobal('location', { origin: ORIGIN })
})

describe('albumMediaPlan', () => {
    it('lists one download per asset: previews for photos, originals for the rest', () => {
        const plan = albumMediaPlan(record(PAGES))
        const byFile = Object.fromEntries(plan.map(item => [item.file, item]))
        expect(Object.keys(byFile).sort()).toEqual(['anim.gif', 'clip.mp4', 'paint.png', 'pano.jpg', 'photo.jpg', 'poster.jpg', 'song.mp3'])
        const size = '&width=' + OFFLINE_PREVIEW_SIZE + '&height=' + OFFLINE_PREVIEW_SIZE
        expect(byFile['photo.jpg'].url).toBe('/index.php/apps/souvenirs/preview?apath=%2FSouvenirs%2Ftrip&file=photo.jpg' + size)
        expect(byFile['poster.jpg'].url).toContain('/preview?')
        expect(byFile['clip.mp4'].url).toBe('/index.php/apps/souvenirs/asset?apath=%2FSouvenirs%2Ftrip&file=clip.mp4')
        expect(byFile['song.mp3'].url).toContain('/asset?')
        expect(byFile['paint.png'].url).toContain('/asset?')
        expect(byFile['pano.jpg'].url).toContain('/asset?')
        expect(byFile['anim.gif'].url).toContain('/asset?')
    })

    it('estimates originals at their size and photos at a preview size', () => {
        const byFile = Object.fromEntries(albumMediaPlan(record(PAGES)).map(item => [item.file, item]))
        expect(byFile['clip.mp4'].estimate).toBe(50000000)
        expect(byFile['song.mp3'].estimate).toBe(5000000)
        expect(byFile['pano.jpg'].estimate).toBe(9000000)
        expect(byFile['photo.jpg'].estimate).toBeLessThan(1000000)
        expect(estimateAlbumBytes(record(PAGES))).toBe(albumMediaPlan(record(PAGES)).reduce((sum, item) => sum + item.estimate, 0))
    })

    it('never estimates a small photo above its own size', () => {
        const plan = albumMediaPlan(record([{ id: 'p', elements: [{ class: 'ImageElement', image: 'data/s.jpg', size: 20000 }] }]))
        expect(plan[0].estimate).toBe(20000)
    })

    it('includes the album cover and tolerates empty albums', () => {
        expect(albumMediaPlan(record([]))).toEqual([])
        expect(albumMediaPlan(record(null))).toEqual([])
        const plan = albumMediaPlan(record([], { info: { albumImage: 'data/cover.jpg' } }))
        expect(plan.map(item => item.file)).toEqual(['cover.jpg'])
    })
})

describe('pending uploads', () => {
    it('keeps, returns and forgets the bytes of a new asset', async () => {
        expect(isSupported()).toBe(true)
        await putPending('Souvenirs/trip', 'data/new.jpg', new Blob(['bytes'], { type: 'image/jpeg' }))
        const blob = await getPending('/Souvenirs/trip/', 'new.jpg')
        expect(await blob.text()).toBe('bytes')
        await deletePending('Souvenirs/trip', 'data/new.jpg')
        expect(await getPending('Souvenirs/trip', 'data/new.jpg')).toBeNull()
    })

    it('can turn uploaded bytes into the offline copy', async () => {
        await putPending('Souvenirs/trip', 'data/new.jpg', new Blob(['bytes'], { type: 'image/jpeg' }))
        await deletePending('Souvenirs/trip', 'data/new.jpg', true)
        expect(await getPending('Souvenirs/trip', 'data/new.jpg')).toBeNull()
        const copy = await (await caches.open(MEDIA_CACHE)).match(mediaKey(ORIGIN, 'Souvenirs/trip', 'new.jpg'))
        expect(await copy.text()).toBe('bytes')
        expect(copy.headers.get('Content-Type')).toBe('image/jpeg')
    })

    it('reports a full device as a QuotaError', async () => {
        const cache = await caches.open(PENDING_CACHE)
        cache.failPutWith = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
        await expect(putPending('Souvenirs/trip', 'data/new.jpg', new Blob(['x']))).rejects.toBeInstanceOf(QuotaError)
    })

    it('is a no-op without the Cache API', async () => {
        vi.stubGlobal('caches', undefined)
        expect(isSupported()).toBe(false)
        expect(await getPending('Souvenirs/trip', 'data/new.jpg')).toBeNull()
        await expect(putPending('Souvenirs/trip', 'data/new.jpg', new Blob(['x']))).rejects.toThrow()
        await removeAlbumMedia('Souvenirs/trip')
        await clearAllMedia()
    })
})

describe('syncAlbumMedia', () => {
    const pages = [{ id: 'p1', elements: [
        { class: 'ImageElement', image: 'data/a.jpg', size: 100 },
        { class: 'VideoElement', video: 'data/v.mp4', image: '', size: 1000 },
    ] }]

    function fetchOk() {
        return vi.fn(async url => new Response(url.includes('v.mp4') ? 'VIDEO-BYTES' : 'IMG', {
            headers: { 'Content-Type': url.includes('v.mp4') ? 'video/mp4' : 'image/jpeg' },
        }))
    }

    it('downloads every medium and reports progress and size', async () => {
        const fetchImpl = fetchOk()
        const progress = []
        const bytes = await syncAlbumMedia(record(pages), { fetchImpl, onProgress: p => progress.push({ ...p }) })
        expect(bytes).toBe('IMG'.length + 'VIDEO-BYTES'.length)
        expect(fetchImpl).toHaveBeenCalledTimes(2)
        expect(progress[0]).toEqual({ done: 0, total: 2 })
        expect(progress[progress.length - 1]).toEqual({ done: 2, total: 2 })
        const copy = await (await caches.open(MEDIA_CACHE)).match(mediaKey(ORIGIN, 'Souvenirs/trip', 'v.mp4'))
        expect(await copy.text()).toBe('VIDEO-BYTES')
        expect(copy.headers.get('Content-Type')).toBe('video/mp4')
    })

    it('only fetches what is missing and drops what no page uses any more', async () => {
        await syncAlbumMedia(record(pages), { fetchImpl: fetchOk() })
        const fetchImpl = fetchOk()
        const changed = [{ id: 'p1', elements: [
            { class: 'ImageElement', image: 'data/a.jpg', size: 100 },
            { class: 'ImageElement', image: 'data/b.jpg', size: 100 },
        ] }]
        const bytes = await syncAlbumMedia(record(changed), { fetchImpl })
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(fetchImpl.mock.calls[0][0]).toContain('file=b.jpg')
        expect(bytes).toBe(6)
        const keys = (await (await caches.open(MEDIA_CACHE)).keys()).map(k => k.url)
        expect(keys.sort()).toEqual([mediaKey(ORIGIN, 'Souvenirs/trip', 'a.jpg'), mediaKey(ORIGIN, 'Souvenirs/trip', 'b.jpg')].sort())
    })

    it('leaves other albums alone', async () => {
        await syncAlbumMedia(record(pages, { path: 'Souvenirs/other' }), { fetchImpl: fetchOk() })
        await syncAlbumMedia(record([]), { fetchImpl: fetchOk() })
        await removeAlbumMedia('Souvenirs/trip')
        expect((await (await caches.open(MEDIA_CACHE)).keys())).toHaveLength(2)
        await removeAlbumMedia('Souvenirs/other')
        expect((await (await caches.open(MEDIA_CACHE)).keys())).toHaveLength(0)
    })

    it('skips media still waiting for their upload', async () => {
        await putPending('Souvenirs/trip', 'data/a.jpg', new Blob(['LOCAL']))
        const fetchImpl = fetchOk()
        await syncAlbumMedia(record(pages), { fetchImpl })
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(fetchImpl.mock.calls[0][0]).toContain('v.mp4')
    })

    it('carries on past a medium the server cannot give', async () => {
        const fetchImpl = vi.fn(async url => (url.includes('a.jpg')
            ? new Response('nope', { status: 404 })
            : new Response('VIDEO', { headers: { 'Content-Type': 'video/mp4' } })))
        const bytes = await syncAlbumMedia(record(pages), { fetchImpl })
        expect(bytes).toBe(5)
    })

    it('stops when the session is gone', async () => {
        const fetchImpl = vi.fn(async () => new Response('', { status: 401 }))
        await expect(syncAlbumMedia(record(pages), { fetchImpl })).rejects.toMatchObject({ status: 401 })
    })

    it('stops when cancelled', async () => {
        const controller = new AbortController()
        const fetchImpl = vi.fn(async () => {
            controller.abort()
            return new Response('IMG')
        })
        await expect(syncAlbumMedia(record(pages), { fetchImpl, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('reports a full device as a QuotaError', async () => {
        const cache = await caches.open(MEDIA_CACHE)
        cache.failPutWith = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
        await expect(syncAlbumMedia(record(pages), { fetchImpl: fetchOk() })).rejects.toBeInstanceOf(QuotaError)
    })

    it('replaces the offline copy of an asset rewritten in place', async () => {
        await syncAlbumMedia(record(pages), { fetchImpl: fetchOk() })
        await putOfflineCopy('Souvenirs/trip', 'data/a.jpg', new Blob(['NEW DRAWING']))
        const copy = await (await caches.open(MEDIA_CACHE)).match(mediaKey(ORIGIN, 'Souvenirs/trip', 'a.jpg'))
        expect(await copy.text()).toBe('NEW DRAWING')
    })

    it('forgets pending uploads of an album, and everything on demand', async () => {
        await putPending('Souvenirs/trip', 'data/x.jpg', new Blob(['x']))
        await putPending('Souvenirs/other', 'data/y.jpg', new Blob(['y']))
        await removeAlbumPending('Souvenirs/trip')
        expect(await getPending('Souvenirs/trip', 'data/x.jpg')).toBeNull()
        expect(await getPending('Souvenirs/other', 'data/y.jpg')).not.toBeNull()
        await clearAllMedia()
        expect(await getPending('Souvenirs/other', 'data/y.jpg')).toBeNull()
    })
})
