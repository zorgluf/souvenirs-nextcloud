import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../../offline/offlineManager.js', () => ({
    prepareOffline: vi.fn(),
    downloadOffline: vi.fn(),
    removeOffline: vi.fn(),
}))
vi.mock('../../offline/mediaCache.js', () => ({
    QuotaError: class QuotaError extends Error {},
    isSupported: () => true,
}))

import OfflineDialog from '../OfflineDialog.vue'
import { prepareOffline, downloadOffline } from '../../offline/offlineManager.js'

// The "Available offline" dialog of one album (issue #22).

const ALBUM = { id: 'album-1', path: '/Souvenirs/a', name: 'Alpha' }

let wrapper = null

async function mountDialog() {
    wrapper = mount(OfflineDialog, {
        props: { album: ALBUM, online: true },
        global: {
            stubs: {
                NcModal: { template: '<div><slot /></div>' },
                NcButton: { template: '<button><slot /></button>' },
                NcLoadingIcon: true,
                NcProgressBar: true,
            },
        },
    })
    await flushPromises()
    return wrapper
}

function button(text) {
    return wrapper.findAll('button').find(b => b.text() === text)
}

beforeEach(() => {
    prepareOffline.mockReset()
    downloadOffline.mockReset()
    prepareOffline.mockResolvedValue({ count: 3, bytes: 4096, record: { offline: false } })
})

afterEach(() => {
    wrapper.unmount()
})

describe('OfflineDialog', () => {
    it('closes once the album is downloaded', async () => {
        downloadOffline.mockResolvedValue({ offline: true, offlineBytes: 4096 })
        await mountDialog()
        await button('Download').trigger('click')
        await flushPromises()
        expect(downloadOffline).toHaveBeenCalledWith('album-1', expect.anything())
        expect(wrapper.emitted('changed')).toHaveLength(1)
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('stays open on the error when the download fails', async () => {
        downloadOffline.mockRejectedValue(new Error('boom'))
        await mountDialog()
        await button('Download').trigger('click')
        await flushPromises()
        expect(wrapper.emitted('close')).toBeUndefined()
        expect(wrapper.find('.offline-dialog__error').exists()).toBe(true)
    })

    it('goes back to the estimate when the download is cancelled', async () => {
        downloadOffline.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        await mountDialog()
        await button('Download').trigger('click')
        await flushPromises()
        expect(wrapper.emitted('close')).toBeUndefined()
        expect(button('Download')).toBeDefined()
    })

    it('still shows the kept copy of an album already available offline', async () => {
        prepareOffline.mockResolvedValue({ count: 3, bytes: 0, record: { offline: true, offlineBytes: 2048 } })
        await mountDialog()
        expect(button('Remove offline copy')).toBeDefined()
        expect(wrapper.emitted('close')).toBeUndefined()
    })
})
