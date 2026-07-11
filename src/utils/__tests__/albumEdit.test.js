import { describe, it, expect } from 'vitest'
import { setElementText, setElementGeometry, setElementPanZoom, relayoutElements, removeElement, buildImageElement, buildTextElement, buildPage, addElement, swapElements } from '../albumEdit.js'

describe('setElementText', () => {
    const makePage = () => ({
        id: 'page-1',
        // A field this app does not know about — must survive editing.
        customPageField: 'keep-me',
        elements: [
            {
                id: 'el-1',
                text: 'old caption',
                image: 'data/a.jpg',
                top: 10,
                // Unknown per-element field that must be preserved.
                androidOnlyField: 42,
            },
            {
                id: 'el-2',
                text: 'other caption',
                video: 'data/b.mp4',
            },
        ],
    })

    it('changes only the targeted element text', () => {
        const result = setElementText(makePage(), 'el-1', 'new caption')
        expect(result.elements[0].text).toBe('new caption')
        expect(result.elements[1].text).toBe('other caption')
    })

    it('preserves all other element fields, including unknown ones', () => {
        const result = setElementText(makePage(), 'el-1', 'new caption')
        const edited = result.elements[0]
        expect(edited.image).toBe('data/a.jpg')
        expect(edited.top).toBe(10)
        expect(edited.androidOnlyField).toBe(42)
    })

    it('preserves unknown page-level fields and the full elements set', () => {
        const result = setElementText(makePage(), 'el-1', 'new caption')
        expect(result.id).toBe('page-1')
        expect(result.customPageField).toBe('keep-me')
        expect(result.elements).toHaveLength(2)
    })

    it('does not mutate the original page or its elements', () => {
        const page = makePage()
        setElementText(page, 'el-1', 'new caption')
        expect(page.elements[0].text).toBe('old caption')
    })

    it('is a no-op on text when the element id is not found', () => {
        const result = setElementText(makePage(), 'missing', 'new caption')
        expect(result.elements.map(e => e.text)).toEqual(['old caption', 'other caption'])
    })

    it('tolerates a page without an elements array', () => {
        const result = setElementText({ id: 'p' }, 'el-1', 'x')
        expect(result.elements).toEqual([])
    })
})

describe('relayoutElements (default Android style per count)', () => {
    const img = id => ({ id, class: 'ImageElement', image: 'data/' + id + '.jpg', top: 5, left: 5, right: 5, bottom: 5 })

    it('places a single element full-page', () => {
        const [e] = relayoutElements([img('a')])
        expect(e).toMatchObject({ top: 0, left: 0, right: 100, bottom: 100 })
    })

    it('defaults two images to the stacked "2 V" style', () => {
        const out = relayoutElements([img('a'), img('b')])
        expect(out.map(e => [e.left, e.top, e.right, e.bottom])).toEqual([
            [0, 0, 100, 50],
            [0, 50, 100, 100],
        ])
    })

    it('defaults an image + text to the title style (image on top, text strip below)', () => {
        const text = { id: 'tx', class: 'TextElement', text: 'hi', top: 7, left: 7, right: 7, bottom: 7 }
        const out = relayoutElements([img('a'), text])
        expect(out[0]).toMatchObject({ left: 0, top: 0, right: 100, bottom: 80 })
        expect(out[1]).toMatchObject({ left: 0, top: 80, right: 100, bottom: 100, text: 'hi' })
    })

    it('uses the Android 3-element default (1H + 2H)', () => {
        const out = relayoutElements([img('a'), img('b'), img('c')])
        expect(out.map(e => [e.left, e.top, e.right, e.bottom])).toEqual([
            [0, 0, 100, 50],
            [0, 50, 50, 100],
            [50, 50, 100, 100],
        ])
    })

    it('lays four elements into the 2x2 style', () => {
        const out = relayoutElements([img('a'), img('b'), img('c'), img('d')])
        expect(out.map(e => [e.left, e.top, e.right, e.bottom])).toEqual([
            [0, 0, 50, 50],
            [50, 0, 100, 50],
            [0, 50, 50, 100],
            [50, 50, 100, 100],
        ])
    })

    it('falls back to a square grid for >4 elements', () => {
        const out = relayoutElements([img('a'), img('b'), img('c'), img('d'), img('e')])
        // 5 -> cols 3, rows 2
        expect(out[0]).toMatchObject({ left: 0, top: 0 })
        expect(out.every(e => e.right - e.left > 0 && e.bottom - e.top > 0)).toBe(true)
    })

    it('lays out image-like + text but leaves audio and paint untouched', () => {
        const audio = { id: 'au', class: 'AudioElement', audio: 'data/x.mp3' }
        const paint = { id: 'pt', class: 'PaintElement', image: 'data/p.png', top: 9, left: 9, right: 9, bottom: 9 }
        const text = { id: 'tx', class: 'TextElement', text: 'hi', top: 7, left: 7, right: 7, bottom: 7 }
        const out = relayoutElements([img('a'), text, audio, paint])
        // two layout elements (image + text), hasText -> title style
        expect(out[0]).toMatchObject({ left: 0, top: 0, right: 100, bottom: 80 })
        expect(out[1]).toMatchObject({ left: 0, top: 80, right: 100, bottom: 100, text: 'hi' })
        expect(out[2]).toEqual(audio)
        expect(out[2]).not.toBe(audio) // cloned, not mutated
        expect(out[3]).toMatchObject({ top: 9, left: 9, right: 9, bottom: 9 }) // paint kept in place
    })

    it('sets image-like elements to cover-fit (transformType 2)', () => {
        const [e] = relayoutElements([img('a')])
        expect(e).toMatchObject({ transformType: 2, zoom: 100, offsetX: 0, offsetY: 0 })
    })

    it('preserves unknown element fields', () => {
        const [e] = relayoutElements([{ ...img('a'), androidOnlyField: 42 }])
        expect(e.androidOnlyField).toBe(42)
    })

    it('does not mutate the input', () => {
        const input = [img('a')]
        relayoutElements(input)
        expect(input[0].right).toBe(5)
    })

    it('tolerates a non-array input', () => {
        expect(relayoutElements(undefined)).toEqual([])
    })
})

describe('removeElement', () => {
    const makePage = () => ({
        id: 'page-1',
        customPageField: 'keep-me',
        elements: [
            { id: 'el-1', class: 'ImageElement', image: 'data/a.jpg', top: 0, left: 0, right: 100, bottom: 50 },
            { id: 'el-2', class: 'ImageElement', image: 'data/b.jpg', top: 50, left: 0, right: 100, bottom: 100 },
        ],
    })

    it('removes the targeted element', () => {
        const result = removeElement(makePage(), 'el-1')
        expect(result.elements.map(e => e.id)).toEqual(['el-2'])
    })

    it('re-lays-out the remaining elements (sole survivor becomes full-page)', () => {
        const result = removeElement(makePage(), 'el-1')
        expect(result.elements[0]).toMatchObject({ top: 0, left: 0, right: 100, bottom: 100 })
    })

    it('preserves unknown page-level fields', () => {
        const result = removeElement(makePage(), 'el-1')
        expect(result.customPageField).toBe('keep-me')
    })

    it('does not mutate the original page', () => {
        const page = makePage()
        removeElement(page, 'el-1')
        expect(page.elements).toHaveLength(2)
    })
})

describe('buildImageElement', () => {
    it('builds an ImageElement matching the on-disk schema', () => {
        const el = buildImageElement({ name: 'beach.JPG', size: 12345, mime: 'image/jpeg' })
        expect(el.class).toBe('ImageElement')
        expect(el.name).toBe('beach.JPG')
        expect(el.size).toBe(12345)
        expect(el.mime).toBe('image/jpeg')
        expect(el.transformType).toBe(2)
        expect(el.zoom).toBe(100)
        expect(el.id).toBeTruthy()
    })

    it('stores the asset under a generated uuid name keeping the extension', () => {
        const el = buildImageElement({ name: 'beach.JPG', size: 1, mime: 'image/jpeg' })
        expect(el.image).toMatch(/^data\/[0-9a-f-]+\.JPG$/)
        // the stored asset name must not be the original (avoids collisions)
        expect(el.image).not.toContain('beach')
    })

    it('handles a name without an extension', () => {
        const el = buildImageElement({ name: 'noext', size: 1, mime: 'image/jpeg' })
        expect(el.image).toMatch(/^data\/[0-9a-f-]+$/)
    })

    it('gives each call a distinct element id and asset path', () => {
        const a = buildImageElement({ name: 'x.jpg', size: 1, mime: 'image/jpeg' })
        const b = buildImageElement({ name: 'x.jpg', size: 1, mime: 'image/jpeg' })
        expect(a.id).not.toBe(b.id)
        expect(a.image).not.toBe(b.image)
    })
})

describe('buildTextElement', () => {
    it('builds an empty TextElement matching the on-disk schema', () => {
        const el = buildTextElement()
        expect(el.class).toBe('TextElement')
        expect(el.text).toBe('')
        expect(el.id).toBeTruthy()
        expect(el).toMatchObject({ transformType: 0, zoom: 0, offsetX: 0, offsetY: 0, size: 0, stop: false })
    })

    it('has no image/asset fields', () => {
        const el = buildTextElement()
        expect(el.image).toBeUndefined()
        expect(el.mime).toBeUndefined()
    })

    it('gives each call a distinct id', () => {
        expect(buildTextElement().id).not.toBe(buildTextElement().id)
    })
})

describe('buildPage', () => {
    it('builds an empty page with a uuid id', () => {
        const p = buildPage()
        expect(p.elements).toEqual([])
        expect(p.id).toBeTruthy()
    })

    it('gives each call a distinct id', () => {
        expect(buildPage().id).not.toBe(buildPage().id)
    })
})

describe('swapElements', () => {
    const makePage = () => ({
        id: 'page-1',
        customPageField: 'keep-me',
        elements: [
            { id: 'el-1', class: 'ImageElement', image: 'data/a.jpg', zoom: 120, offsetX: 5, androidOnlyField: 42, top: 0, left: 0, right: 100, bottom: 50 },
            { id: 'el-2', class: 'TextElement', text: 'hi', top: 50, left: 0, right: 100, bottom: 100 },
            { id: 'el-3', class: 'AudioElement', audio: 'data/x.mp3' },
        ],
    })

    it('exchanges the geometry of the two elements', () => {
        const result = swapElements(makePage(), 'el-1', 'el-2')
        const image = result.elements.find(e => e.id === 'el-1')
        const text = result.elements.find(e => e.id === 'el-2')
        expect(image).toMatchObject({ top: 50, left: 0, right: 100, bottom: 100 })
        expect(text).toMatchObject({ top: 0, left: 0, right: 100, bottom: 50 })
    })

    it('exchanges the array slots too, so a later re-layout keeps the swap', () => {
        const result = swapElements(makePage(), 'el-1', 'el-2')
        expect(result.elements.map(e => e.id)).toEqual(['el-2', 'el-1', 'el-3'])
    })

    it('keeps the per-slot geometry sequence (layout detection still matches)', () => {
        const result = swapElements(makePage(), 'el-1', 'el-2')
        expect(result.elements[0]).toMatchObject({ top: 0, bottom: 50 })
        expect(result.elements[1]).toMatchObject({ top: 50, bottom: 100 })
    })

    it('preserves all non-geometry fields, including unknown ones', () => {
        const result = swapElements(makePage(), 'el-1', 'el-2')
        const image = result.elements.find(e => e.id === 'el-1')
        expect(image).toMatchObject({ image: 'data/a.jpg', zoom: 120, offsetX: 5, androidOnlyField: 42 })
        expect(result.customPageField).toBe('keep-me')
    })

    it('is a no-op when either id is missing or both are the same', () => {
        const before = makePage().elements
        expect(swapElements(makePage(), 'el-1', 'missing').elements).toEqual(before)
        expect(swapElements(makePage(), 'missing', 'el-2').elements).toEqual(before)
        expect(swapElements(makePage(), 'el-1', 'el-1').elements).toEqual(before)
    })

    it('does not mutate the original page', () => {
        const page = makePage()
        swapElements(page, 'el-1', 'el-2')
        expect(page.elements[0]).toMatchObject({ id: 'el-1', top: 0 })
    })

    it('tolerates a page without an elements array', () => {
        expect(swapElements({ id: 'p' }, 'a', 'b').elements).toEqual([])
    })
})

describe('addElement', () => {
    it('appends the element and re-lays-out the page (default "2 V" for two images)', () => {
        const page = { id: 'p', elements: [{ id: 'el-1', class: 'ImageElement', image: 'data/a.jpg', top: 0, left: 0, right: 100, bottom: 100 }] }
        const el = buildImageElement({ name: 'b.jpg', size: 2, mime: 'image/jpeg' })
        const result = addElement(page, el)
        expect(result.elements).toHaveLength(2)
        // two images -> stacked: top half / bottom half
        expect(result.elements[0]).toMatchObject({ left: 0, top: 0, right: 100, bottom: 50 })
        expect(result.elements[1]).toMatchObject({ left: 0, top: 50, right: 100, bottom: 100, id: el.id })
    })

    it('does not mutate the original page', () => {
        const page = { id: 'p', elements: [] }
        addElement(page, buildImageElement({ name: 'b.jpg', size: 2, mime: 'image/jpeg' }))
        expect(page.elements).toHaveLength(0)
    })
})

describe('setElementGeometry', () => {
    const makePage = () => ({
        id: 'page-1',
        // A field this app does not know about — must survive editing.
        customPageField: 'keep-me',
        elements: [
            {
                id: 'el-1',
                class: 'ImageElement',
                image: 'data/a.jpg',
                text: 'caption',
                top: 0,
                left: 0,
                right: 100,
                bottom: 50,
                zoom: 120,
                // Unknown per-element field that must be preserved.
                androidOnlyField: 42,
            },
            {
                id: 'el-2',
                class: 'TextElement',
                top: 50,
                left: 0,
                right: 100,
                bottom: 100,
            },
        ],
    })

    it('replaces only the targeted element geometry', () => {
        const result = setElementGeometry(makePage(), 'el-1', { top: 10, left: 20, right: 80, bottom: 40 })
        expect(result.elements[0]).toMatchObject({ top: 10, left: 20, right: 80, bottom: 40 })
        expect(result.elements[1]).toMatchObject({ top: 50, left: 0, right: 100, bottom: 100 })
    })

    it('preserves all other element fields, including unknown ones', () => {
        const result = setElementGeometry(makePage(), 'el-1', { top: 10, left: 20, right: 80, bottom: 40 })
        const resized = result.elements[0]
        expect(resized.image).toBe('data/a.jpg')
        expect(resized.text).toBe('caption')
        expect(resized.zoom).toBe(120)
        expect(resized.androidOnlyField).toBe(42)
    })

    it('preserves unknown page-level fields and the full elements set', () => {
        const result = setElementGeometry(makePage(), 'el-1', { top: 10, left: 20, right: 80, bottom: 40 })
        expect(result.id).toBe('page-1')
        expect(result.customPageField).toBe('keep-me')
        expect(result.elements).toHaveLength(2)
    })

    it('does not mutate the original page or its elements', () => {
        const page = makePage()
        setElementGeometry(page, 'el-1', { top: 10, left: 20, right: 80, bottom: 40 })
        expect(page.elements[0]).toMatchObject({ top: 0, left: 0, right: 100, bottom: 50 })
    })

    it('is a no-op when the element id is not found', () => {
        const result = setElementGeometry(makePage(), 'missing', { top: 10, left: 20, right: 80, bottom: 40 })
        expect(result.elements[0]).toMatchObject({ top: 0, left: 0, right: 100, bottom: 50 })
        expect(result.elements[1]).toMatchObject({ top: 50, left: 0, right: 100, bottom: 100 })
    })

    it('tolerates a page without an elements array', () => {
        expect(setElementGeometry({ id: 'p' }, 'el-1', { top: 0, left: 0, right: 100, bottom: 100 }).elements).toEqual([])
    })
})

describe('setElementPanZoom', () => {
    const makePage = () => ({
        id: 'page-1',
        customPageField: 'keep-me',
        elements: [
            {
                id: 'el-1',
                class: 'ImageElement',
                image: 'data/a.jpg',
                text: 'caption',
                top: 0,
                left: 0,
                right: 100,
                bottom: 50,
                zoom: 100,
                offsetX: 0,
                offsetY: 0,
                transformType: 1,
                // Unknown per-element field that must be preserved.
                androidOnlyField: 42,
            },
            {
                id: 'el-2',
                class: 'ImageElement',
                image: 'data/b.jpg',
                zoom: 100,
                offsetX: 0,
                offsetY: 0,
                transformType: 2,
            },
        ],
    })

    it('replaces only the targeted element pan/zoom and transform type', () => {
        const result = setElementPanZoom(makePage(), 'el-1', { zoom: 150, offsetX: 10, offsetY: -5, transformType: 2 })
        expect(result.elements[0]).toMatchObject({ zoom: 150, offsetX: 10, offsetY: -5, transformType: 2 })
        expect(result.elements[1]).toMatchObject({ zoom: 100, offsetX: 0, offsetY: 0, transformType: 2 })
    })

    it('preserves all other element and page fields, including unknown ones', () => {
        const result = setElementPanZoom(makePage(), 'el-1', { zoom: 150, offsetX: 10, offsetY: -5, transformType: 2 })
        expect(result.elements[0]).toMatchObject({
            image: 'data/a.jpg', text: 'caption',
            top: 0, left: 0, right: 100, bottom: 50,
            androidOnlyField: 42,
        })
        expect(result.customPageField).toBe('keep-me')
    })

    it('does not mutate the original page or its elements', () => {
        const page = makePage()
        setElementPanZoom(page, 'el-1', { zoom: 150, offsetX: 10, offsetY: -5, transformType: 2 })
        expect(page.elements[0]).toMatchObject({ zoom: 100, offsetX: 0, offsetY: 0, transformType: 1 })
    })

    it('is a no-op when the element id is not found', () => {
        const result = setElementPanZoom(makePage(), 'missing', { zoom: 150, offsetX: 10, offsetY: -5, transformType: 2 })
        expect(result.elements[0]).toMatchObject({ zoom: 100, offsetX: 0, offsetY: 0, transformType: 1 })
    })

    it('tolerates a page without an elements array', () => {
        expect(setElementPanZoom({ id: 'p' }, 'el-1', { zoom: 100, offsetX: 0, offsetY: 0, transformType: 2 }).elements).toEqual([])
    })
})
