import { describe, it, expect, beforeEach, vi } from 'vitest'
import { updatePage, updateAlbum, searchAsset, cleanAssets, createPage, deletePage, movePage, probeAsset, uploadAsset } from '../albumApi.js'

describe('albumApi', () => {
    beforeEach(() => {
        globalThis.OC = { requestToken: 'test-token' }
        globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200 }))
    })

    describe('updatePage', () => {
        const page = {
            id: 'page-7',
            elements: [
                { id: 'el-1', text: 'hello', image: 'data/a.jpg' },
                { id: 'el-2', text: 'world', video: 'data/b.mp4' },
            ],
        }

        it('POSTs to the page endpoint with the album and page ids', async () => {
            await updatePage('album-3', page)
            const [url, options] = globalThis.fetch.mock.calls[0]
            expect(url).toBe('apiv2/album/album-3/page/page-7')
            expect(options.method).toBe('POST')
        })

        it('sends the full elements array as the JSON body', async () => {
            await updatePage('album-3', page)
            const [, options] = globalThis.fetch.mock.calls[0]
            expect(JSON.parse(options.body)).toEqual({ elements: page.elements })
        })

        it('attaches the request token and JSON content type', async () => {
            await updatePage('album-3', page)
            const [, options] = globalThis.fetch.mock.calls[0]
            expect(options.headers.requesttoken).toBe('test-token')
            expect(options.headers['Content-Type']).toBe('application/json')
        })

        it('rejects when the server responds with an error status', async () => {
            globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
            await expect(updatePage('album-3', page)).rejects.toThrow()
        })
    })

    describe('updateAlbum', () => {
        it('POSTs only the provided fields to the album endpoint', async () => {
            await updateAlbum('album-3', { name: 'New name' })
            const [url, options] = globalThis.fetch.mock.calls[0]
            expect(url).toBe('apiv2/album/album-3')
            expect(options.method).toBe('POST')
            expect(JSON.parse(options.body)).toEqual({ name: 'New name' })
        })
    })

    describe('searchAsset', () => {
        beforeEach(() => {
            globalThis.fetch = vi.fn(() => Promise.resolve({
                ok: true, status: 200, json: () => Promise.resolve({ status: 'found' }),
            }))
        })

        it('GETs the assetsearch endpoint with asset, name and size query params', async () => {
            await searchAsset('album-3', 'data/x.jpg', 'orig name.jpg', 4096)
            const [url, options] = globalThis.fetch.mock.calls[0]
            const parsed = new URL(url, 'https://example.test/')
            expect(parsed.pathname).toBe('/apiv2/album/album-3/assetsearch')
            expect(parsed.searchParams.get('asset')).toBe('data/x.jpg')
            expect(parsed.searchParams.get('asset_name')).toBe('orig name.jpg')
            expect(parsed.searchParams.get('asset_size')).toBe('4096')
            expect(options.headers.requesttoken).toBe('test-token')
        })

        it('resolves to the parsed JSON body', async () => {
            const res = await searchAsset('album-3', 'data/x.jpg', 'x.jpg', 1)
            expect(res).toEqual({ status: 'found' })
        })

        it('rejects on an error status', async () => {
            globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }))
            await expect(searchAsset('a', 'data/x.jpg', 'x.jpg', 1)).rejects.toThrow()
        })
    })

    describe('createPage', () => {
        it('PUTs the new page to the position endpoint', async () => {
            const page = { id: 'p9', elements: [] }
            await createPage('album-3', 2, page)
            const [url, options] = globalThis.fetch.mock.calls[0]
            expect(url).toBe('apiv2/album/album-3/page/2')
            expect(options.method).toBe('PUT')
            expect(JSON.parse(options.body)).toEqual(page)
            expect(options.headers.requesttoken).toBe('test-token')
        })

        it('rejects on an error status', async () => {
            globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
            await expect(createPage('a', 0, { id: 'x', elements: [] })).rejects.toThrow()
        })
    })

    describe('movePage', () => {
        it('POSTs to the page position endpoint', async () => {
            await movePage('album-3', 'page-7', 4)
            const [url, options] = globalThis.fetch.mock.calls[0]
            expect(url).toBe('apiv2/album/album-3/page/page-7/pos/4')
            expect(options.method).toBe('POST')
            expect(options.headers.requesttoken).toBe('test-token')
        })

        it('rejects on an error status', async () => {
            globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
            await expect(movePage('a', 'p', 1)).rejects.toThrow()
        })
    })

    describe('deletePage', () => {
        it('DELETEs the page endpoint', async () => {
            await deletePage('album-3', 'page-7')
            const [url, options] = globalThis.fetch.mock.calls[0]
            expect(url).toBe('apiv2/album/album-3/page/page-7')
            expect(options.method).toBe('DELETE')
            expect(options.headers.requesttoken).toBe('test-token')
        })

        it('rejects on an error status', async () => {
            globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
            await expect(deletePage('a', 'p')).rejects.toThrow()
        })
    })

    describe('probeAsset', () => {
        beforeEach(() => {
            globalThis.fetch = vi.fn(() => Promise.resolve({
                ok: true, status: 200,
                json: () => Promise.resolve({ status: 'missing', path: 'Souvenirs/album/data/x.png' }),
            }))
        })

        it('GETs the assetprobe endpoint keeping the asset path slash', async () => {
            await probeAsset('album-3', 'data/x.png')
            const [url, options] = globalThis.fetch.mock.calls[0]
            expect(url).toBe('apiv2/album/album-3/assetprobe/data/x.png')
            expect(options.headers.requesttoken).toBe('test-token')
        })

        it('resolves to the parsed JSON body (status + upload path)', async () => {
            const res = await probeAsset('album-3', 'data/x.png')
            expect(res).toEqual({ status: 'missing', path: 'Souvenirs/album/data/x.png' })
        })

        it('rejects on an error status', async () => {
            globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }))
            await expect(probeAsset('a', 'data/x.png')).rejects.toThrow()
        })
    })

    describe('uploadAsset', () => {
        it('PUTs the blob to the WebDAV endpoint under the user files root, with its own mimetype', async () => {
            const blob = new Blob(['fake-png'], { type: 'image/png' })
            await uploadAsset('Souvenirs/My album/data/x.png', blob)
            const [url, options] = globalThis.fetch.mock.calls[0]
            expect(url).toContain('/remote.php/webdav/')
            expect(url.endsWith('/remote.php/webdav/Souvenirs/My%20album/data/x.png')).toBe(true)
            expect(options.method).toBe('PUT')
            expect(options.body).toBe(blob)
            expect(options.headers.requesttoken).toBe('test-token')
            expect(options.headers['Content-Type']).toBe('image/png')
        })

        it('drops the leading slash of the probe path (no double slash in the URL)', async () => {
            await uploadAsset('/Souvenirs/a/data/x.png', new Blob(['x'], { type: 'image/png' }))
            const [url] = globalThis.fetch.mock.calls[0]
            expect(url.endsWith('/remote.php/webdav/Souvenirs/a/data/x.png')).toBe(true)
            expect(url).not.toContain('webdav//')
        })

        it('falls back to a generic content type for an untyped blob', async () => {
            await uploadAsset('Souvenirs/a/data/x.png', new Blob(['x']))
            const [, options] = globalThis.fetch.mock.calls[0]
            expect(options.headers['Content-Type']).toBe('application/octet-stream')
        })

        it('rejects on an error status', async () => {
            globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 507 }))
            await expect(uploadAsset('Souvenirs/a/data/x.png', new Blob(['x']))).rejects.toThrow()
        })
    })

    describe('cleanAssets', () => {
        it('GETs the clean endpoint for the album', async () => {
            await cleanAssets('album-3')
            const [url, options] = globalThis.fetch.mock.calls[0]
            expect(url).toBe('apiv2/album/album-3/clean')
            expect(options.headers.requesttoken).toBe('test-token')
        })
    })
})
