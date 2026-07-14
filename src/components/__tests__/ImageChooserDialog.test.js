import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn() }))
vi.mock('../../api/davApi.js', () => ({
    IMAGE_MIMES: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml'],
    listFolder: vi.fn(),
    getPreviewUrl: vi.fn(fileid => 'preview-' + fileid),
}))

import { showError } from '@nextcloud/dialogs'
import { listFolder } from '../../api/davApi.js'
import ImageChooserDialog from '../ImageChooserDialog.vue'

// Let the async browse() in mounted() settle.
function flushBrowse() {
    return new Promise(resolve => setTimeout(resolve, 0))
}

const folderB = { basename: 'b-folder', path: 'b-folder', isFolder: true, mime: '', size: 0, mtime: 500, fileid: '1' }
const folderA = { basename: 'A-folder', path: 'A-folder', isFolder: true, mime: '', size: 0, mtime: 400, fileid: '2' }
const oldImage = { basename: 'old.jpg', path: 'old.jpg', isFolder: false, mime: 'image/jpeg', size: 10, mtime: 1000, fileid: '10' }
const newImage = { basename: 'new.png', path: 'new.png', isFolder: false, mime: 'image/png', size: 20, mtime: 2000, fileid: '11' }
const notImage = { basename: 'doc.pdf', path: 'doc.pdf', isFolder: false, mime: 'application/pdf', size: 30, mtime: 3000, fileid: '12' }

const ROOT_LISTING = [oldImage, folderB, notImage, newImage, folderA]

async function mountDialog(props = {}) {
    listFolder.mockReset()
    listFolder.mockResolvedValue(ROOT_LISTING)
    showError.mockClear()
    const wrapper = mount(ImageChooserDialog, {
        attachTo: document.body,
        props: { saving: false, ...props },
        global: {
            stubs: {
                // The modal shell and breadcrumb chrome are not under test;
                // slot-passing stubs keep their content reachable.
                NcModal: { template: '<div class="modal-stub"><slot /></div>' },
                NcBreadcrumbs: { template: '<div class="crumbs-stub"><slot /></div>' },
                NcBreadcrumb: {
                    props: ['name'],
                    template: '<button class="crumb-stub" @click="$emit(\'click\')">{{ name }}</button>',
                },
                NcEmptyContent: { props: ['name'], template: '<div class="empty-stub">{{ name }}</div>' },
            },
        },
    })
    await flushBrowse()
    return wrapper
}

describe('ImageChooserDialog', () => {
    beforeEach(async () => {
        // The module remembers the last browsed folder across mounts: reset it
        // by mounting once and navigating home via the root crumb when needed.
    })

    it('lists folders first (alphabetical), then images newest-first, other mimes dropped', async () => {
        const wrapper = await mountDialog()
        // Make the memory-dependent start deterministic: go to the root crumb.
        await wrapper.find('.crumb-stub').trigger('click')
        await flushBrowse()
        const names = wrapper.findAll('.chooser-name').map(n => n.text())
        expect(names).toEqual(['A-folder', 'b-folder', 'new.png', 'old.jpg'])
        expect(names).not.toContain('doc.pdf')
        wrapper.unmount()
    })

    it('navigates into a folder and grows the breadcrumbs', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('.crumb-stub').trigger('click')
        await flushBrowse()
        listFolder.mockResolvedValue([newImage])
        await wrapper.find('.chooser-folder').trigger('click')
        await flushBrowse()
        expect(listFolder).toHaveBeenLastCalledWith('A-folder')
        const crumbs = wrapper.findAll('.crumb-stub').map(c => c.text())
        expect(crumbs).toContain('A-folder')
        wrapper.unmount()
    })

    it('navigates back through a breadcrumb click', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('.crumb-stub').trigger('click')
        await flushBrowse()
        listFolder.mockResolvedValue([newImage])
        await wrapper.find('.chooser-folder').trigger('click')
        await flushBrowse()
        listFolder.mockResolvedValue(ROOT_LISTING)
        await wrapper.find('.crumb-stub').trigger('click') // root crumb
        await flushBrowse()
        expect(listFolder).toHaveBeenLastCalledWith('')
        expect(wrapper.findAll('.chooser-folder')).toHaveLength(2)
        wrapper.unmount()
    })

    it('remembers the last browsed folder across dialog instances', async () => {
        const first = await mountDialog()
        await first.find('.crumb-stub').trigger('click')
        await flushBrowse()
        listFolder.mockResolvedValue([newImage])
        await first.find('.chooser-folder').trigger('click')
        await flushBrowse()
        first.unmount()
        const second = await mountDialog()
        expect(listFolder).toHaveBeenCalledWith('A-folder')
        second.unmount()
        // Leave the module memory at the root for the other tests.
        const third = await mountDialog()
        await third.find('.crumb-stub').trigger('click')
        await flushBrowse()
        third.unmount()
    })

    it('falls back to the files root when the remembered folder fails to list', async () => {
        const first = await mountDialog()
        await first.find('.crumb-stub').trigger('click')
        await flushBrowse()
        listFolder.mockResolvedValue([newImage])
        await first.find('.chooser-folder').trigger('click')
        await flushBrowse()
        first.unmount()
        listFolder.mockReset()
        listFolder.mockRejectedValueOnce(new Error('gone'))
        listFolder.mockResolvedValue(ROOT_LISTING)
        showError.mockClear()
        const second = mount(ImageChooserDialog, {
            props: { saving: false },
            global: { stubs: { NcModal: { template: '<div><slot /></div>' }, NcBreadcrumbs: { template: '<div><slot /></div>' }, NcBreadcrumb: { props: ['name'], template: '<button class="crumb-stub">{{ name }}</button>' }, NcEmptyContent: true } },
        })
        await flushBrowse()
        expect(listFolder).toHaveBeenNthCalledWith(1, 'A-folder')
        expect(listFolder).toHaveBeenNthCalledWith(2, '')
        expect(showError).toHaveBeenCalled()
        second.unmount()
    })

    it('disables Choose without a selection and emits pick once one is made', async () => {
        const wrapper = await mountDialog()
        const chooseButton = wrapper.findAll('button').filter(b => b.text() === 'Choose')[0]
        expect(chooseButton.attributes('disabled')).toBeDefined()
        const tile = wrapper.findAll('.chooser-image')[0] // new.png (newest first)
        await tile.trigger('click')
        expect(tile.attributes('aria-pressed')).toBe('true')
        expect(chooseButton.attributes('disabled')).toBeUndefined()
        await chooseButton.trigger('click')
        expect(wrapper.emitted('pick')).toHaveLength(1)
        expect(wrapper.emitted('pick')[0][0]).toMatchObject({ basename: 'new.png' })
        wrapper.unmount()
    })

    it('deselects when the selected tile is clicked again', async () => {
        const wrapper = await mountDialog()
        const tile = wrapper.findAll('.chooser-image')[0]
        await tile.trigger('click')
        await tile.trigger('click')
        expect(tile.attributes('aria-pressed')).toBe('false')
        wrapper.unmount()
    })

    it('emits pick directly on double-click', async () => {
        const wrapper = await mountDialog()
        await wrapper.findAll('.chooser-image')[1].trigger('dblclick')
        expect(wrapper.emitted('pick')[0][0]).toMatchObject({ basename: 'old.jpg' })
        wrapper.unmount()
    })

    it('restricts the hidden input to image mimetypes and emits upload with the file', async () => {
        const wrapper = await mountDialog()
        const input = wrapper.find('input[type=file]')
        expect(input.attributes('accept')).toContain('image/jpeg')
        const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
        Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
        await input.trigger('change')
        expect(wrapper.emitted('upload')).toHaveLength(1)
        expect(wrapper.emitted('upload')[0][0]).toBe(file)
        wrapper.unmount()
    })

    it('rejects a non-image file with an error toast and no upload event', async () => {
        const wrapper = await mountDialog()
        const input = wrapper.find('input[type=file]')
        const file = new File(['bytes'], 'doc.pdf', { type: 'application/pdf' })
        Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
        await input.trigger('change')
        expect(showError).toHaveBeenCalled()
        expect(wrapper.emitted('upload')).toBeUndefined()
        wrapper.unmount()
    })

    it('freezes every control while saving', async () => {
        const wrapper = await mountDialog({ saving: true })
        for (const button of wrapper.findAll('.chooser-tile')) {
            expect(button.attributes('disabled')).toBeDefined()
        }
        const labels = ['Upload', 'Cancel', 'Choose']
        for (const label of labels) {
            const button = wrapper.findAll('button').filter(b => b.text() === label)[0]
            expect(button.attributes('disabled')).toBeDefined()
        }
        wrapper.unmount()
    })

    it('keeps the current listing and shows an error when navigation fails', async () => {
        const wrapper = await mountDialog()
        listFolder.mockRejectedValueOnce(new Error('forbidden'))
        await wrapper.find('.chooser-folder').trigger('click')
        await flushBrowse()
        expect(showError).toHaveBeenCalled()
        expect(wrapper.findAll('.chooser-image')).toHaveLength(2)
        wrapper.unmount()
    })

    it('swaps a broken thumbnail for the fallback icon', async () => {
        const wrapper = await mountDialog()
        const img = wrapper.find('.chooser-thumb')
        expect(img.attributes('src')).toBe('preview-11')
        await img.trigger('error')
        const tile = wrapper.findAll('.chooser-image')[0]
        expect(tile.find('.chooser-thumb').exists()).toBe(false)
        wrapper.unmount()
    })
})
