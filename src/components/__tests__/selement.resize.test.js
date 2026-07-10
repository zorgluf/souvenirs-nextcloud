import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Selement from '../selement.vue'

// Mount an element tile inside a fake 1000x1000px page, so pointer deltas in px
// map 1:1 to page percentages / 10.
function mountTile(props = {}) {
    const wrapper = mount(Selement, {
        attachTo: document.body,
        props: {
            sId: 'el-1',
            sPageId: 'page-1',
            editMode: true,
            sClass: 'ImageElement',
            sImage: '',
            sText: '',
            sTop: 0,
            sBottom: 50,
            sLeft: 0,
            sRight: 50,
            sZoom: 100,
            sOffsetX: 0,
            sOffsetY: 0,
            sTransformType: 1,
            albumPath: 'Souvenirs/test',
            token: '',
            preload: false,
            isFocus: false,
            elementMargin: 1,
            ...props,
        },
    })
    // The component converts pointer deltas against its positioned parent (the
    // page); happy-dom has no layout, so give the parent a concrete box.
    wrapper.element.parentElement.getBoundingClientRect = () => ({
        width: 1000, height: 1000, top: 0, left: 0, right: 1000, bottom: 1000, x: 0, y: 0,
    })
    return wrapper
}

async function dragHandle(wrapper, corner, from, to) {
    const handle = wrapper.find('.s-element-resize-handle--' + corner)
    await handle.trigger('pointerdown', { pointerId: 1, clientX: from.x, clientY: from.y })
    await handle.trigger('pointermove', { pointerId: 1, clientX: to.x, clientY: to.y })
    await handle.trigger('pointerup', { pointerId: 1, clientX: to.x, clientY: to.y })
}

describe('selement corner resize', () => {
    it('shows the four corner handles in edit mode only', () => {
        expect(mountTile().findAll('.s-element-resize-handle')).toHaveLength(4)
        expect(mountTile({ editMode: false }).findAll('.s-element-resize-handle')).toHaveLength(0)
    })

    it('does not show handles on non-resizable elements (audio)', () => {
        expect(mountTile({ sClass: 'AudioElement' }).findAll('.s-element-resize-handle')).toHaveLength(0)
    })

    it('keeps paint elements static: no resize handles, no drag handle, not draggable', () => {
        const wrapper = mountTile({ sClass: 'PaintElement' })
        expect(wrapper.findAll('.s-element-resize-handle')).toHaveLength(0)
        expect(wrapper.find('.s-element-drag-handle').exists()).toBe(false)
        expect(wrapper.attributes('draggable')).toBe('false')
        // Still removable: the delete button stays.
        expect(wrapper.find('.s-element-delete').exists()).toBe(true)
    })

    it('emits resize-element with the new geometry after dragging the SE corner', async () => {
        const wrapper = mountTile()
        await dragHandle(wrapper, 'se', { x: 500, y: 500 }, { x: 700, y: 600 })
        const emitted = wrapper.emitted('resize-element')
        expect(emitted).toBeTruthy()
        expect(emitted[0]).toEqual(['el-1', { top: 0, left: 0, right: 70, bottom: 60 }])
    })

    it('moves only the grabbed corner edges (NW drag keeps right/bottom)', async () => {
        const wrapper = mountTile({ sTop: 20, sLeft: 20, sRight: 80, sBottom: 80 })
        await dragHandle(wrapper, 'nw', { x: 200, y: 200 }, { x: 100, y: 300 })
        expect(wrapper.emitted('resize-element')[0][1]).toEqual({ top: 30, left: 10, right: 80, bottom: 80 })
    })

    it('clamps to the page bounds and to the minimum size', async () => {
        const wrapper = mountTile()
        // Way beyond the page on both axes: right/bottom stop at 100.
        await dragHandle(wrapper, 'se', { x: 500, y: 500 }, { x: 5000, y: 5000 })
        expect(wrapper.emitted('resize-element')[0][1]).toEqual({ top: 0, left: 0, right: 100, bottom: 100 })
        // Collapse toward the opposite corner: 5% minimum is kept.
        const wrapper2 = mountTile()
        await dragHandle(wrapper2, 'se', { x: 500, y: 500 }, { x: -5000, y: -5000 })
        expect(wrapper2.emitted('resize-element')[0][1]).toEqual({ top: 0, left: 0, right: 5, bottom: 5 })
    })

    it('previews the geometry live while dragging', async () => {
        const wrapper = mountTile()
        const handle = wrapper.find('.s-element-resize-handle--se')
        await handle.trigger('pointerdown', { pointerId: 1, clientX: 500, clientY: 500 })
        await handle.trigger('pointermove', { pointerId: 1, clientX: 700, clientY: 600 })
        // elementMargin is 1: rendered box = logical box inset by 1%.
        expect(wrapper.element.style.width).toBe('68%')
        expect(wrapper.element.style.height).toBe('58%')
        // Nothing is committed before the pointer is released.
        expect(wrapper.emitted('resize-element')).toBeFalsy()
        await handle.trigger('pointercancel', { pointerId: 1 })
        // A cancelled gesture snaps back to the committed geometry.
        expect(wrapper.element.style.width).toBe('48%')
        expect(wrapper.emitted('resize-element')).toBeFalsy()
    })

    it('does not emit when the geometry did not change', async () => {
        const wrapper = mountTile()
        await dragHandle(wrapper, 'se', { x: 500, y: 500 }, { x: 500, y: 500 })
        expect(wrapper.emitted('resize-element')).toBeFalsy()
    })
})
