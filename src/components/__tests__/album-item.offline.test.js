import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import AlbumItem from '../album-item.vue'
import CloudDownloadOutline from 'vue-material-design-icons/CloudDownloadOutline.vue'
import CloudCheckOutline from 'vue-material-design-icons/CloudCheckOutline.vue'
import CloudUploadOutline from 'vue-material-design-icons/CloudUploadOutline.vue'
import AlertCircleOutline from 'vue-material-design-icons/AlertCircleOutline.vue'

// The offline button of an album in the list (issue #22): the only place
// where the state of the copy on this device is shown.

let wrapper = null

function mountItem(localState) {
    wrapper = mount(AlbumItem, {
        props: {
            shares: [],
            aPath: '/Souvenirs/a',
            albumImagePath: '',
            name: 'Alpha',
            date: '20260201120000',
            albumId: 'album-1',
            isWinPortrait: false,
            localState,
        },
        global: {
            stubs: {
                'router-link': { template: '<a><slot /></a>' },
                NcActions: true,
                NcButton: { template: '<button><slot name="icon" /></button>' },
            },
        },
    })
    return wrapper.find('.s-offline-button')
}

afterEach(() => {
    wrapper.unmount()
})

describe('album-item offline button', () => {
    it('is the only sync indicator of the album', () => {
        mountItem({ status: 'synced', offline: true, offlineBytes: 2048 })
        expect(wrapper.find('.s-sync-badge').exists()).toBe(false)
        expect(wrapper.findAll('.s-offline-button')).toHaveLength(1)
    })

    it.each([
        ['no copy on this device', null],
        ['a record without status', { status: 'none', offline: false, offlineBytes: 0 }],
        ['a copy that was not made available offline', { status: 'synced', offline: false, offlineBytes: 0 }],
    ])('is greyed out with %s', (label, localState) => {
        const button = mountItem(localState)
        expect(button.classes()).toContain('s-offline-button--none')
        expect(button.findComponent(CloudDownloadOutline).exists()).toBe(true)
        expect(button.attributes('title')).toBe('Available offline')
    })

    it('shows the synchronized icon once available offline', () => {
        const button = mountItem({ status: 'synced', offline: true, offlineBytes: 2048 })
        expect(button.classes()).toContain('s-offline-button--synced')
        expect(button.findComponent(CloudCheckOutline).exists()).toBe(true)
        expect(button.attributes('title')).toContain('Synchronized, available offline')
    })

    it.each([
        ['pending', CloudUploadOutline, 'Changes waiting to be synchronized'],
        ['conflict', AlertCircleOutline, 'Modified both here and on the server: open the album to choose'],
    ])('always reports a %s copy, available offline or not', (status, icon, title) => {
        const button = mountItem({ status, offline: false, offlineBytes: 0 })
        expect(button.classes()).toContain('s-offline-button--' + status)
        expect(button.findComponent(icon).exists()).toBe(true)
        expect(button.attributes('title')).toBe(title)
    })

    it('opens the offline dialog of the album', async () => {
        const button = mountItem(null)
        await button.trigger('click')
        expect(wrapper.emitted('offline-album')[0]).toEqual([{ id: 'album-1', path: '/Souvenirs/a', name: 'Alpha' }])
    })
})
