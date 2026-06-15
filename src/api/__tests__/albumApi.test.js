import { describe, it, expect, beforeEach, vi } from 'vitest'
import { updatePage, updateAlbum } from '../albumApi.js'

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
})
