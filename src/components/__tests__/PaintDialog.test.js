import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showWarning: vi.fn() }))

import { showError, showWarning } from '@nextcloud/dialogs'
import PaintDialog from '../PaintDialog.vue'
import Page from '../page.vue'

// Let the async loader in mounted() (fetch -> blob -> decode -> draw) run to completion.
function flushLoader() {
    return new Promise(resolve => setTimeout(resolve, 0))
}

// happy-dom has no 2D canvas: the drawing surface gets a recording context and
// a concrete layout box, so pointer positions map 1:1 to canvas pixels.
function fakeContext() {
    return {
        globalCompositeOperation: 'source-over',
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        lineCap: '',
        lineJoin: '',
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        drawImage: vi.fn(),
        // Transparent by default; tests flip `ink` to simulate a drawing.
        ink: false,
        getImageData: function() {
            return { data: Uint8ClampedArray.from([0, 0, 0, this.ink ? 255 : 0]) }
        },
    }
}

const paintElement = { id: 'pt', class: 'PaintElement', image: 'data/old.png', top: 0, left: 0, right: 100, bottom: 100 }
const imageElement = { id: 'el-1', class: 'ImageElement', image: 'data/a.jpg', top: 0, left: 0, right: 100, bottom: 100 }

function mountDialog(props = {}) {
    const ctx = fakeContext()
    // The mounted() hook fetches the existing paint PNG: give it a working
    // fetch + decoder by default so mounting never hits the network.
    globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: true, status: 200,
        blob: () => Promise.resolve(new Blob(['png-bytes'], { type: 'image/png' })),
    }))
    globalThis.createImageBitmap = vi.fn(() => Promise.resolve({ width: 4, height: 4 }))
    const wrapper = mount(PaintDialog, {
        attachTo: document.body,
        props: {
            pageId: 'page-1',
            elements: [imageElement, paintElement],
            albumPath: 'Souvenirs/test',
            elementMargin: 1,
            saving: false,
            ...props,
        },
        global: {
            stubs: {
                // The heavy children are not under test: the modal shell, the
                // color-picker popover and the page replica are stubbed out.
                NcModal: { template: '<div class="modal-stub"><slot /></div>' },
                NcColorPicker: { template: '<div class="color-picker-stub"><slot /></div>' },
                page: true,
            },
        },
    })
    const canvas = wrapper.find('canvas.paint-canvas').element
    canvas.width = 100
    canvas.height = 100
    canvas.getContext = () => ctx
    canvas.getBoundingClientRect = () => ({
        width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100, x: 0, y: 0,
    })
    return { wrapper, ctx, canvas }
}

describe('PaintDialog', () => {
    it('fetches the existing paint PNG bytes and draws them onto the canvas', async () => {
        const { ctx } = mountDialog()
        // albumPath passed through raw (it is already percent-encoded in the
        // route query — re-encoding double-encodes the slashes); &v= busts the
        // HTTP cache since re-painting overwrites the same asset path
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'asset?apath=Souvenirs/test&file=old.png&v=0',
            { headers: { requesttoken: 'test-token' } },
        )
        await flushLoader()
        // decoded from the blob content (immune to a wrong served mimetype)
        expect(globalThis.createImageBitmap).toHaveBeenCalled()
        expect(ctx.drawImage).toHaveBeenCalledWith({ width: 4, height: 4 }, 0, 0, 100, 100)
    })

    it('does not fetch anything when the page has no paint element', async () => {
        mountDialog({ elements: [imageElement] })
        await flushLoader()
        expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('starts blank with a warning when the paint asset is missing (404)', async () => {
        showWarning.mockClear()
        showError.mockClear()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }))
        globalThis.createImageBitmap = vi.fn()
        const { ctx } = (() => {
            const ctx = fakeContext()
            const wrapper = mount(PaintDialog, {
                props: {
                    pageId: 'page-1',
                    elements: [paintElement],
                    albumPath: 'Souvenirs/test',
                    elementMargin: 1,
                    saving: false,
                },
                global: {
                    stubs: {
                        NcModal: { template: '<div class="modal-stub"><slot /></div>' },
                        NcColorPicker: { template: '<div class="color-picker-stub"><slot /></div>' },
                        page: true,
                    },
                },
            })
            wrapper.find('canvas.paint-canvas').element.getContext = () => ctx
            return { ctx }
        })()
        await flushLoader()
        warnSpy.mockRestore()
        expect(showWarning).toHaveBeenCalled()
        expect(showError).not.toHaveBeenCalled()
        expect(ctx.drawImage).not.toHaveBeenCalled()
    })

    it('reports the HTTP status when the existing drawing cannot be fetched', async () => {
        showError.mockClear()
        globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
        const wrapper = mount(PaintDialog, {
            props: {
                pageId: 'page-1',
                elements: [paintElement],
                albumPath: 'Souvenirs/test',
                elementMargin: 1,
                saving: false,
            },
            global: {
                stubs: {
                    NcModal: { template: '<div class="modal-stub"><slot /></div>' },
                    NcColorPicker: { template: '<div class="color-picker-stub"><slot /></div>' },
                    page: true,
                },
            },
        })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        await flushLoader()
        errorSpy.mockRestore()
        expect(showError).toHaveBeenCalledWith(expect.stringContaining('HTTP 500'))
        expect(wrapper.emitted('close')).toBeFalsy()
    })

    it('renders the page replica without the paint element and with prefixed ids', () => {
        const { wrapper } = mountDialog()
        const page = wrapper.findComponent(Page)
        expect(page.exists()).toBe(true)
        const elements = page.props('elements')
        expect(elements).toHaveLength(1)
        expect(elements[0].class).toBe('ImageElement')
        // prefixed ids keep the replica's DOM ids from colliding with the real page
        expect(elements[0].id).toBe('paintbg-el-1')
        expect(page.props('editMode')).toBe(false)
    })

    it('draws a smoothed pen stroke from pointer events', async () => {
        const { wrapper, ctx } = mountDialog()
        const canvas = wrapper.find('canvas.paint-canvas')
        await canvas.trigger('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 })
        await canvas.trigger('pointermove', { pointerId: 1, clientX: 30, clientY: 10 })
        await canvas.trigger('pointerup', { pointerId: 1, clientX: 30, clientY: 10 })
        // accepted move -> quadratic segment; pointer up -> closing straight line
        expect(ctx.quadraticCurveTo).toHaveBeenCalledWith(10, 10, 20, 10)
        expect(ctx.lineTo).toHaveBeenCalledWith(30, 10)
        expect(ctx.stroke).toHaveBeenCalled()
    })

    it('ignores moves of a pointer that did not start on the canvas', async () => {
        const { wrapper, ctx } = mountDialog()
        const canvas = wrapper.find('canvas.paint-canvas')
        await canvas.trigger('pointermove', { pointerId: 9, clientX: 30, clientY: 10 })
        await canvas.trigger('pointerup', { pointerId: 9, clientX: 30, clientY: 10 })
        expect(ctx.stroke).not.toHaveBeenCalled()
        expect(ctx.fill).not.toHaveBeenCalled()
    })

    it('marks the active tool as pressed (darker face + aria-pressed)', async () => {
        const { wrapper } = mountDialog()
        const pen = wrapper.find('[title="Pen"]')
        const eraser = wrapper.find('[title="Eraser"]')
        expect(pen.attributes('aria-pressed')).toBe('true')
        expect(eraser.attributes('aria-pressed')).toBe('false')
        await eraser.trigger('click')
        expect(pen.attributes('aria-pressed')).toBe('false')
        expect(eraser.attributes('aria-pressed')).toBe('true')
        // clicking the already-active tool must not un-press it (radio behavior)
        await eraser.trigger('click')
        expect(eraser.attributes('aria-pressed')).toBe('true')
    })

    it('closes the color picker as soon as a color is picked', async () => {
        const { wrapper } = mountDialog()
        wrapper.vm.colorOpen = true
        wrapper.vm.color = '#ff0000'
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.colorOpen).toBe(false)
    })

    it('erases with destination-out circles when the eraser tool is selected', async () => {
        const { wrapper, ctx } = mountDialog()
        await wrapper.find('[title="Eraser"]').trigger('click')
        const canvas = wrapper.find('canvas.paint-canvas')
        await canvas.trigger('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 })
        await canvas.trigger('pointerup', { pointerId: 1, clientX: 50, clientY: 50 })
        expect(ctx.globalCompositeOperation).toBe('destination-out')
        expect(ctx.arc).toHaveBeenCalled()
        expect(ctx.fill).toHaveBeenCalled()
        expect(ctx.stroke).not.toHaveBeenCalled()
    })

    it('emits confirm with the canvas PNG blob when the drawing has ink', async () => {
        const { wrapper, ctx, canvas } = mountDialog()
        ctx.ink = true
        const blob = new Blob(['png'], { type: 'image/png' })
        canvas.toBlob = (cb, type) => {
            expect(type).toBe('image/png')
            cb(blob)
        }
        const confirmButton = wrapper.findAll('button').find(b => b.text() === 'Confirm')
        await confirmButton.trigger('click')
        expect(wrapper.emitted('confirm')).toEqual([[blob]])
    })

    it('emits confirm with null when the canvas is fully transparent', async () => {
        const { wrapper, canvas } = mountDialog()
        canvas.toBlob = vi.fn()
        const confirmButton = wrapper.findAll('button').find(b => b.text() === 'Confirm')
        await confirmButton.trigger('click')
        expect(wrapper.emitted('confirm')).toEqual([[null]])
        expect(canvas.toBlob).not.toHaveBeenCalled()
    })

    it('emits close on cancel and does not confirm', async () => {
        const { wrapper } = mountDialog()
        const cancelButton = wrapper.findAll('button').find(b => b.text() === 'Cancel')
        await cancelButton.trigger('click')
        expect(wrapper.emitted('close')).toBeTruthy()
        expect(wrapper.emitted('confirm')).toBeFalsy()
    })

    it('freezes confirm and cancel while saving', () => {
        const { wrapper } = mountDialog({ saving: true })
        const confirmButton = wrapper.findAll('button').find(b => b.text() === 'Confirm')
        const cancelButton = wrapper.findAll('button').find(b => b.text() === 'Cancel')
        expect(confirmButton.attributes('disabled')).toBeDefined()
        expect(cancelButton.attributes('disabled')).toBeDefined()
    })
})
