import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Selement from '../selement.vue'
import { ELEMENT_DRAG_TYPE } from '../../utils/elementDrag.js'

// Mount an image tile with a fake 500x500px box and a loaded 2000x2000 image
// (square image in a square box: cover-fit fills the box exactly, so expected
// offsets are easy to derive: 1px of pan = 0.2% at zoom 100).
async function mountImageTile(props = {}) {
    const wrapper = mount(Selement, {
        attachTo: document.body,
        props: {
            sId: 'el-1',
            sPageId: 'page-1',
            editMode: true,
            sClass: 'ImageElement',
            sImage: 'photo.jpg',
            sText: '',
            sTop: 0,
            sBottom: 50,
            sLeft: 0,
            sRight: 50,
            sZoom: 100,
            sOffsetX: 0,
            sOffsetY: 0,
            sTransformType: 2,
            albumPath: 'Souvenirs/test',
            token: '',
            preload: false,
            // Pan & zoom only works on the currently displayed page.
            isFocus: true,
            elementMargin: 1,
            ...props,
        },
    })
    // happy-dom has no layout: give the element box a concrete size, and inject
    // the "loaded image" natural size the gesture math needs.
    wrapper.element.getBoundingClientRect = () => ({
        width: 500, height: 500, top: 0, left: 0, right: 500, bottom: 500, x: 0, y: 0,
    })
    wrapper.vm.imgSize = { width: 2000, height: 2000 }
    await wrapper.vm.$nextTick()
    return wrapper
}

function img(wrapper) {
    return wrapper.find('img.image-element')
}

afterEach(() => {
    vi.useRealTimers()
})

describe('selement image pan & zoom (edit mode)', () => {
    it('pans with a pointer drag and emits the new offsets on release', async () => {
        const wrapper = await mountImageTile()
        await img(wrapper).trigger('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
        await img(wrapper).trigger('pointermove', { pointerId: 1, clientX: 150, clientY: 120 })
        // Live preview, nothing committed yet: the image moved 50px right, 20px
        // down (10% / 4% of the box).
        expect(wrapper.emitted('pan-zoom-element')).toBeFalsy()
        expect(wrapper.vm.imageStyle.transform).toContain('translate(50px,20px)')
        await img(wrapper).trigger('pointerup', { pointerId: 1, clientX: 150, clientY: 120 })
        expect(wrapper.emitted('pan-zoom-element')).toEqual([
            ['el-1', { zoom: 100, offsetX: 10, offsetY: 4, transformType: 2 }],
        ])
    })

    it('reverts to the committed values when the gesture is cancelled', async () => {
        const wrapper = await mountImageTile()
        await img(wrapper).trigger('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
        await img(wrapper).trigger('pointermove', { pointerId: 1, clientX: 200, clientY: 100 })
        await img(wrapper).trigger('pointercancel', { pointerId: 1 })
        expect(wrapper.emitted('pan-zoom-element')).toBeFalsy()
        expect(wrapper.vm.panZoomPreview).toBe(null)
    })

    it('does not emit for a click without movement', async () => {
        const wrapper = await mountImageTile({ sTransformType: 1 })
        await img(wrapper).trigger('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
        await img(wrapper).trigger('pointerup', { pointerId: 1, clientX: 100, clientY: 100 })
        expect(wrapper.emitted('pan-zoom-element')).toBeFalsy()
    })

    it('zooms with the mouse wheel about the cursor and commits after a pause', async () => {
        vi.useFakeTimers()
        const wrapper = await mountImageTile()
        // One notch up at the box center: zoom * e^0.2, center kept fixed.
        await img(wrapper).trigger('wheel', { deltaY: -100, clientX: 250, clientY: 250 })
        expect(wrapper.emitted('pan-zoom-element')).toBeFalsy()
        vi.advanceTimersByTime(500)
        const emitted = wrapper.emitted('pan-zoom-element')
        expect(emitted).toHaveLength(1)
        expect(emitted[0][0]).toBe('el-1')
        expect(emitted[0][1].zoom).toBeCloseTo(122.14, 2)
        expect(emitted[0][1].offsetX).toBeCloseTo(-9.06, 2)
        expect(emitted[0][1].offsetY).toBeCloseTo(-9.06, 2)
        expect(emitted[0][1].transformType).toBe(2)
    })

    it('accumulates successive wheel notches into one commit', async () => {
        vi.useFakeTimers()
        const wrapper = await mountImageTile()
        await img(wrapper).trigger('wheel', { deltaY: -100, clientX: 0, clientY: 0 })
        await img(wrapper).trigger('wheel', { deltaY: -100, clientX: 0, clientY: 0 })
        vi.advanceTimersByTime(500)
        const emitted = wrapper.emitted('pan-zoom-element')
        expect(emitted).toHaveLength(1)
        // Top-left anchor: pure zoom, e^0.2 twice.
        expect(emitted[0][1].zoom).toBeCloseTo(149.18, 2)
        expect(emitted[0][1].offsetX).toBe(0)
    })

    it('pinch-zooms with two pointers', async () => {
        const wrapper = await mountImageTile()
        await img(wrapper).trigger('pointerdown', { pointerId: 1, clientX: 200, clientY: 200 })
        await img(wrapper).trigger('pointerdown', { pointerId: 2, clientX: 300, clientY: 200 })
        // Spread the fingers to double the distance around a fixed midpoint.
        await img(wrapper).trigger('pointermove', { pointerId: 1, clientX: 150, clientY: 200 })
        await img(wrapper).trigger('pointermove', { pointerId: 2, clientX: 350, clientY: 200 })
        await img(wrapper).trigger('pointerup', { pointerId: 1, clientX: 150, clientY: 200 })
        await img(wrapper).trigger('pointerup', { pointerId: 2, clientX: 350, clientY: 200 })
        expect(wrapper.emitted('pan-zoom-element')).toEqual([
            ['el-1', { zoom: 200, offsetX: -25, offsetY: -20, transformType: 2 }],
        ])
    })

    it('switches a center-crop element to zoom-offset on the first pan', async () => {
        const wrapper = await mountImageTile({ sTransformType: 1, sZoom: 0 })
        await img(wrapper).trigger('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
        await img(wrapper).trigger('pointermove', { pointerId: 1, clientX: 150, clientY: 100 })
        await img(wrapper).trigger('pointerup', { pointerId: 1, clientX: 150, clientY: 100 })
        expect(wrapper.emitted('pan-zoom-element')).toEqual([
            ['el-1', { zoom: 100, offsetX: 10, offsetY: 0, transformType: 2 }],
        ])
    })

    it('ignores gestures outside edit mode', async () => {
        const wrapper = await mountImageTile({ editMode: false })
        await img(wrapper).trigger('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
        await img(wrapper).trigger('pointermove', { pointerId: 1, clientX: 200, clientY: 200 })
        await img(wrapper).trigger('pointerup', { pointerId: 1, clientX: 200, clientY: 200 })
        await img(wrapper).trigger('wheel', { deltaY: -100, clientX: 0, clientY: 0 })
        expect(wrapper.emitted('pan-zoom-element')).toBeFalsy()
        expect(wrapper.vm.panZoomPreview).toBe(null)
    })

    it('ignores gestures on a page that is not the displayed one', async () => {
        // A touch drag over a peeking neighbor page must scroll the album, not
        // pan its images: no pan class (touch-action) and no gesture handling.
        const wrapper = await mountImageTile({ isFocus: false })
        expect(img(wrapper).classes()).not.toContain('image-element--pan')
        await img(wrapper).trigger('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
        await img(wrapper).trigger('pointermove', { pointerId: 1, clientX: 200, clientY: 200 })
        await img(wrapper).trigger('pointerup', { pointerId: 1, clientX: 200, clientY: 200 })
        await img(wrapper).trigger('wheel', { deltaY: -100, clientX: 0, clientY: 0 })
        expect(wrapper.emitted('pan-zoom-element')).toBeFalsy()
        expect(wrapper.vm.panZoomPreview).toBe(null)
    })
})

describe('selement pan & zoom reset button', () => {
    it('shows on image elements in edit mode only', async () => {
        expect((await mountImageTile()).find('.s-element-pan-reset').exists()).toBe(true)
        expect((await mountImageTile({ editMode: false })).find('.s-element-pan-reset').exists()).toBe(false)
        expect((await mountImageTile({ sClass: 'TextElement', sImage: '' })).find('.s-element-pan-reset').exists()).toBe(false)
    })

    it('resets a panned/zoomed element to plain cover-fit', async () => {
        const wrapper = await mountImageTile({ sZoom: 180, sOffsetX: 12, sOffsetY: -7 })
        await wrapper.find('.s-element-pan-reset').trigger('click')
        expect(wrapper.emitted('pan-zoom-element')).toEqual([
            ['el-1', { zoom: 100, offsetX: 0, offsetY: 0, transformType: 2 }],
        ])
    })

    it('converts a fill (contain) element to cover-fit', async () => {
        const wrapper = await mountImageTile({ sTransformType: 0, sZoom: 0 })
        await wrapper.find('.s-element-pan-reset').trigger('click')
        expect(wrapper.emitted('pan-zoom-element')).toEqual([
            ['el-1', { zoom: 100, offsetX: 0, offsetY: 0, transformType: 2 }],
        ])
    })

    it('does not persist anything when the element already renders as cover-fit', async () => {
        // Zoom-offset at the defaults, and center-crop (the same rendering).
        const zoomOffset = await mountImageTile()
        await zoomOffset.find('.s-element-pan-reset').trigger('click')
        expect(zoomOffset.emitted('pan-zoom-element')).toBeFalsy()
        const centerCrop = await mountImageTile({ sTransformType: 1, sZoom: 0 })
        await centerCrop.find('.s-element-pan-reset').trigger('click')
        expect(centerCrop.emitted('pan-zoom-element')).toBeFalsy()
    })

    it('discards a pending wheel preview instead of committing it', async () => {
        vi.useFakeTimers()
        const wrapper = await mountImageTile()
        await img(wrapper).trigger('wheel', { deltaY: -100, clientX: 250, clientY: 250 })
        await wrapper.find('.s-element-pan-reset').trigger('click')
        vi.advanceTimersByTime(1000)
        expect(wrapper.emitted('pan-zoom-element')).toBeFalsy()
        expect(wrapper.vm.panZoomPreview).toBe(null)
    })
})

describe('selement caption editor scope', () => {
    it('shows no caption field on an image element without text', async () => {
        const wrapper = await mountImageTile()
        expect(wrapper.find('.s-element-text').exists()).toBe(false)
    })

    it('shows an existing image caption read-only in edit mode', async () => {
        const wrapper = await mountImageTile({ sText: 'a memory' })
        const caption = wrapper.find('.s-element-text')
        expect(caption.exists()).toBe(true)
        expect(caption.classes()).not.toContain('editable-text--editing')
    })

    it('keeps the caption editable on text elements', async () => {
        const wrapper = await mountImageTile({ sClass: 'TextElement', sImage: '', sText: '' })
        const caption = wrapper.find('.s-element-text')
        expect(caption.exists()).toBe(true)
        expect(caption.classes()).toContain('editable-text--editing')
    })
})

describe('selement drag handle (move to another page)', () => {
    it('starts the element drag from the handle with the element payload', async () => {
        const wrapper = await mountImageTile()
        const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
        await wrapper.find('.s-element-drag-handle').trigger('dragstart', { dataTransfer })
        expect(dataTransfer.setData).toHaveBeenCalledWith(
            ELEMENT_DRAG_TYPE,
            JSON.stringify({ pageId: 'page-1', elementId: 'el-1' }),
        )
        expect(dataTransfer.effectAllowed).toBe('move')
        // The whole tile is shown in flight, not just the handle button.
        expect(dataTransfer.setDragImage).toHaveBeenCalledWith(wrapper.element, expect.any(Number), expect.any(Number))
    })
})
