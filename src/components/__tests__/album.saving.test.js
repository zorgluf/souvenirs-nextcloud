import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn() }))
vi.mock('../../api/albumApi.js', () => ({
    updatePage: vi.fn(() => Promise.resolve({ ok: true })),
    createPage: vi.fn(() => Promise.resolve({ ok: true })),
    deletePage: vi.fn(() => Promise.resolve({ ok: true })),
    movePage: vi.fn(() => Promise.resolve({ ok: true })),
    cleanAssets: vi.fn(() => Promise.resolve({ ok: true })),
    pageOperations: vi.fn(() => Promise.resolve({ results: [] })),
    searchAssets: vi.fn((albumId, items) => Promise.resolve(items.map(() => 'found'))),
    probeAsset: vi.fn(() => Promise.resolve({ status: 'missing', path: '/Souvenirs/a/data/x' })),
    uploadAsset: vi.fn(() => Promise.resolve({ ok: true })),
}))

import { showError } from '@nextcloud/dialogs'
import * as api from '../../api/albumApi.js'
import album from '../album.vue'
import { SaveQueue } from '../../utils/saveQueue.js'

// Edit-mode persistence of album.vue (issue #50), driven through its methods
// with a plain `this` (mounting the full album would need the router and a
// dozen child components). The save queue is the real one.

function makeAlbum() {
    const ctx = {
        albumId: 'album-1',
        pages: [
            { id: 'p1', elements: [{ id: 'a', class: 'ImageElement', image: 'data/a.jpg', top: 0, left: 0, bottom: 100, right: 100 }] },
            { id: 'p2', elements: [{ id: 'b', class: 'TextElement', text: 'hello', top: 0, left: 0, bottom: 100, right: 100 }] },
            { id: 'p3', elements: [{ id: 'c', class: 'ImageElement', image: 'data/c.jpg', top: 0, left: 0, bottom: 100, right: 100 }] },
        ],
        displayedPage: 0,
        savingCount: 0,
        pendingSaves: 0,
        editMode: true,
        imageChooserPageId: null,
        imageChooserSaving: false,
        paintSaving: false,
        cleanTimer: null,
        lastSaveErrorAt: 0,
        $nextTick: fn => (fn ? fn() : Promise.resolve()),
    }
    for (const [name, fn] of Object.entries(album.methods)) {
        ctx[name] = fn.bind(ctx)
    }
    // page navigation needs the DOM
    ctx.showN = vi.fn()
    ctx.saveQueue = new SaveQueue({
        onChange: n => { ctx.pendingSaves = n },
        onError: e => ctx.onSaveError(e),
    })
    return ctx
}

async function settle(ctx) {
    await vi.runAllTimersAsync()
    await ctx.saveQueue.idle()
}

describe('album edit-mode saving', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('saves a burst of light edits on a page with one background request', async () => {
        const ctx = makeAlbum()
        for (const text of ['h', 'he', 'hel', 'hell', 'hello!']) {
            ctx.onEditText('p2', 'b', text)
        }
        ctx.onCycleLayout('p2')
        // no overlay for light edits
        expect(ctx.savingCount).toBe(0)
        expect(ctx.pendingSaves).toBe(1)

        await settle(ctx)

        expect(api.updatePage).toHaveBeenCalledTimes(1)
        const [, page] = api.updatePage.mock.calls[0]
        expect(page.elements[0].text).toBe('hello!')
        expect(ctx.pendingSaves).toBe(0)
    })

    it('sends pending edits before a structural action, in order', async () => {
        const ctx = makeAlbum()
        const order = []
        api.updatePage.mockImplementation((id, page) => { order.push('update ' + page.id); return Promise.resolve({}) })
        api.deletePage.mockImplementation((id, pageId) => { order.push('delete ' + pageId); return Promise.resolve({}) })

        ctx.onEditText('p2', 'b', 'edited')
        const removal = ctx.onRemoveElement('p1', 'a')
        await settle(ctx)
        await removal

        expect(order).toEqual(['update p2', 'delete p1'])
        expect(ctx.pages.map(p => p.id)).toEqual(['p2', 'p3'])
    })

    it('moves an element to another page with one atomic request', async () => {
        const ctx = makeAlbum()

        await ctx.onElementDrop('p1', 'a', 'p3', null)

        expect(api.pageOperations).toHaveBeenCalledTimes(1)
        expect(api.updatePage).not.toHaveBeenCalled()
        expect(api.deletePage).not.toHaveBeenCalled()
        const [, operations] = api.pageOperations.mock.calls[0]
        expect(operations.map(o => o.op)).toEqual(['update', 'delete'])
        expect(ctx.pages.map(p => p.id)).toEqual(['p2', 'p3'])
        expect(ctx.pages[1].elements.map(e => e.id)).toEqual(['c', 'a'])
    })

    it('keeps the local album untouched when the move is refused', async () => {
        const ctx = makeAlbum()
        api.pageOperations.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('x'), { status: 404 })))

        await ctx.onElementDrop('p1', 'a', 'p3', null)

        expect(showError).toHaveBeenCalled()
        expect(ctx.pages.map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
    })

    it('adds N picked files with two requests in total', async () => {
        const ctx = makeAlbum()
        ctx.imageChooserPageId = 'p2'
        const entries = ['x', 'y', 'z'].map(n => ({ basename: n + '.jpg', path: 'Photos/' + n + '.jpg', size: 10, mime: 'image/jpeg' }))

        await ctx.onImagePick(entries)

        expect(api.searchAssets).toHaveBeenCalledTimes(1)
        expect(api.pageOperations).toHaveBeenCalledTimes(1)
        expect(api.updatePage).not.toHaveBeenCalled()
        expect(api.createPage).not.toHaveBeenCalled()
        // the server is told where each picked file is: no search needed
        expect(api.searchAssets.mock.calls[0][1].map(i => i.source)).toEqual(['Photos/x.jpg', 'Photos/y.jpg', 'Photos/z.jpg'])
        expect(ctx.pages).toHaveLength(5)
        expect(ctx.imageChooserPageId).toBe(null)
        expect(ctx.imageChooserSaving).toBe(false)
        // lands on the last created page
        expect(ctx.showN).toHaveBeenCalledWith(3)
    })

    it('stops at the first file that cannot be linked and keeps the chooser open', async () => {
        const ctx = makeAlbum()
        ctx.imageChooserPageId = 'p2'
        api.searchAssets.mockImplementationOnce(() => Promise.resolve(['found', 'notfound', 'found']))
        const entries = ['x', 'y', 'z'].map(n => ({ basename: n + '.jpg', path: n + '.jpg', size: 10, mime: 'image/jpeg' }))

        await ctx.onImagePick(entries)

        expect(showError).toHaveBeenCalledTimes(1)
        const [, operations] = api.pageOperations.mock.calls[0]
        expect(operations).toHaveLength(1)
        expect(ctx.pages[1].elements).toHaveLength(2)
        expect(ctx.imageChooserPageId).toBe('p2')
    })

    it('runs one background asset clean after a series of removals, never while media are added', async () => {
        const ctx = makeAlbum()
        await ctx.onRemoveElement('p3', 'c')
        ctx.pages.push({ id: 'p4', elements: [{ id: 'd', class: 'ImageElement', image: 'data/d.jpg' }, { id: 'e', class: 'ImageElement', image: 'data/e.jpg' }] })
        await ctx.onRemoveElement('p4', 'd')
        ctx.imageChooserSaving = true
        await vi.advanceTimersByTimeAsync(6000)
        expect(api.cleanAssets).not.toHaveBeenCalled()

        ctx.imageChooserSaving = false
        await settle(ctx)

        expect(api.cleanAssets).toHaveBeenCalledTimes(1)
    })

    it('reports a background save that keeps failing, once per burst', async () => {
        const ctx = makeAlbum()
        api.updatePage.mockImplementation(() => Promise.reject(Object.assign(new Error('x'), { status: 500 })))

        ctx.onEditText('p1', 'a', 'x')
        ctx.onEditText('p2', 'b', 'y')
        await settle(ctx)

        expect(showError).toHaveBeenCalledTimes(1)
    })

    it('asks before leaving the page with unsaved edits, and sends them', async () => {
        const ctx = makeAlbum()
        ctx.onEditText('p2', 'b', 'not yet saved')
        const event = { preventDefault: vi.fn(), returnValue: undefined }

        ctx.onBeforeUnload(event)

        expect(event.preventDefault).toHaveBeenCalled()
        await ctx.saveQueue.idle()
        expect(api.updatePage).toHaveBeenCalledTimes(1)
    })

    it('lets the page go when everything is saved', () => {
        const ctx = makeAlbum()
        const event = { preventDefault: vi.fn() }
        ctx.onBeforeUnload(event)
        expect(event.preventDefault).not.toHaveBeenCalled()
    })
})
