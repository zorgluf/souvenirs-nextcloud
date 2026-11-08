import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import HelpDialog from '../HelpDialog.vue'

// The dialog is rendered by NcDialog/NcModal, which teleport to the document
// body: the assertions query the document rather than the wrapper.

let wrapper = null

function mountDialog(props = {}) {
    wrapper = mount(HelpDialog, {
        attachTo: document.body,
        props: { canEdit: true, isTouchDevice: false, ...props },
    })
    return wrapper
}

function q(selector) {
    return document.body.querySelector(selector)
}

function qa(selector) {
    return Array.from(document.body.querySelectorAll(selector))
}

afterEach(() => {
    if (wrapper) {
        wrapper.unmount()
        wrapper = null
    }
})

describe('HelpDialog', () => {
    it('opens on the structure section with four sections to pick from', async () => {
        mountDialog()
        await wrapper.vm.$nextTick()
        expect(qa('.help-nav__item')).toHaveLength(4)
        expect(q('.help-nav__item--active').textContent).toContain('Structure')
        expect(q('.help-section--structure')).not.toBeNull()
        expect(q('.help-section--shortcuts')).toBeNull()
    })

    it('opens on the requested section', async () => {
        mountDialog({ initialSection: 'shortcuts' })
        await wrapper.vm.$nextTick()
        expect(q('.help-section--shortcuts')).not.toBeNull()
        expect(q('.help-nav__item--active').textContent).toContain('Shortcuts')
    })

    it('falls back to the first section for an unknown one', async () => {
        mountDialog({ initialSection: 'nope' })
        await wrapper.vm.$nextTick()
        expect(q('.help-section--structure')).not.toBeNull()
    })

    it('switches section from the navigation', async () => {
        mountDialog()
        await wrapper.vm.$nextTick()
        const items = qa('.help-nav__item')
        items[2].click()
        await wrapper.vm.$nextTick()
        expect(q('.help-section--media')).not.toBeNull()
        expect(items[2].getAttribute('aria-current')).toBe('page')
        // The media formats are rendered as chips.
        expect(qa('.help-media--photo .help-format').map(e => e.textContent)).toContain('JPEG')
    })

    it('renders key combinations as keys', async () => {
        mountDialog({ initialSection: 'shortcuts' })
        await wrapper.vm.$nextTick()
        const newline = q('.help-shortcut--newline')
        expect(newline).not.toBeNull()
        expect(Array.from(newline.querySelectorAll('kbd')).map(k => k.textContent)).toEqual(['Shift', 'Enter'])
        expect(newline.querySelector('.help-plus')).not.toBeNull()
        // Alternatives are separated by "or".
        const prev = q('.help-shortcut--prev')
        expect(prev.querySelector('.help-or')).not.toBeNull()
    })

    it('hides everything about editing in the public view', async () => {
        mountDialog({ canEdit: false, initialSection: 'modes' })
        await wrapper.vm.$nextTick()
        expect(q('.help-mode--view')).not.toBeNull()
        expect(q('.help-mode--edit')).toBeNull()
        expect(q('.help-note')).not.toBeNull()
        qa('.help-nav__item')[3].click()
        await wrapper.vm.$nextTick()
        expect(q('.help-group--editing')).toBeNull()
        expect(q('.help-shortcut--edit')).toBeNull()
    })

    it('shows the edit mode card and shortcuts to the owner', async () => {
        mountDialog({ canEdit: true, initialSection: 'modes' })
        await wrapper.vm.$nextTick()
        expect(q('.help-mode--edit')).not.toBeNull()
        expect(q('.help-note')).toBeNull()
        qa('.help-nav__item')[3].click()
        await wrapper.vm.$nextTick()
        expect(q('.help-group--editing')).not.toBeNull()
    })

    it('emits close when the dialog is closed', async () => {
        mountDialog()
        await wrapper.vm.$nextTick()
        wrapper.vm.onUpdateOpen(false)
        expect(wrapper.emitted('close')).toHaveLength(1)
        wrapper.vm.onUpdateOpen(true)
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})
