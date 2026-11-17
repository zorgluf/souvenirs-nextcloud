import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../../offline/offlineManager.js', () => ({
    storageUsage: vi.fn(),
    removeOffline: vi.fn(),
    wipeEverything: vi.fn(),
    hasServiceWorker: vi.fn(),
    localStates: vi.fn(),
}))
vi.mock('../../offline/notify.js', () => ({
    notificationPermission: () => 'granted',
    requestNotifications: vi.fn(),
}))
vi.mock('../../offline/connectivity.js', async () => {
    const { reactive } = await import('vue')
    const connectivity = reactive({ online: true, forced: false })
    return {
        connectivity,
        setForcedOffline: vi.fn(async forced => {
            connectivity.forced = forced
            connectivity.online = !forced
            return connectivity.online
        }),
    }
})

import StorageDialog from '../StorageDialog.vue'
import { storageUsage, hasServiceWorker, localStates } from '../../offline/offlineManager.js'
import { connectivity, setForcedOffline } from '../../offline/connectivity.js'

// The dialog behind the offline button of the album list (issue #22): the
// switch to work offline by choice, and the storage of the offline copies.

let wrapper = null

async function mountDialog() {
    wrapper = mount(StorageDialog, {
        global: {
            stubs: {
                NcModal: { template: '<div><slot /></div>' },
                NcButton: { template: '<button><slot /></button>' },
                NcLoadingIcon: true,
                NcProgressBar: true,
                NcCheckboxRadioSwitch: {
                    props: ['modelValue', 'disabled'],
                    emits: ['update:modelValue'],
                    template: '<label><input type="checkbox" class="switch" :checked="modelValue" :disabled="disabled"'
                        + ' @change="$emit(\'update:modelValue\', $event.target.checked)"><slot /></label>',
                },
            },
        },
    })
    await flushPromises()
    return wrapper
}

function toggle() {
    return wrapper.find('.switch')
}

beforeEach(() => {
    vi.clearAllMocks()
    connectivity.online = true
    connectivity.forced = false
    hasServiceWorker.mockReturnValue(true)
    localStates.mockResolvedValue({})
    storageUsage.mockResolvedValue({
        albums: [{ id: 'album-1', name: 'Alpha', bytes: 2048 }], total: 2048, usage: null, quota: null, persisted: true,
    })
})

afterEach(() => {
    wrapper.unmount()
})

describe('offline dialog of the album list', () => {
    it('shows the switch above the storage of the offline copies', async () => {
        await mountDialog()
        expect(wrapper.find('h2').text()).toBe('Offline')
        expect(toggle().element.checked).toBe(false)
        expect(toggle().element.disabled).toBe(false)
        expect(wrapper.find('.storage-dialog__status').text()).toBe('Connected to the server.')
        expect(wrapper.find('.storage-dialog__name').text()).toBe('Alpha')
    })

    it('switches to working offline, and back', async () => {
        await mountDialog()
        await toggle().setValue(true)
        await flushPromises()
        expect(setForcedOffline).toHaveBeenCalledWith(true)
        expect(toggle().element.checked).toBe(true)
        expect(wrapper.find('.storage-dialog__status').text()).toContain('You are working offline')
        expect(wrapper.emitted('changed')).toHaveLength(1)
        await toggle().setValue(false)
        await flushPromises()
        expect(setForcedOffline).toHaveBeenLastCalledWith(false)
        expect(wrapper.find('.storage-dialog__status').text()).toBe('Connected to the server.')
    })

    it('tells apart a server that cannot be reached', async () => {
        connectivity.online = false
        await mountDialog()
        expect(toggle().element.checked).toBe(false)
        expect(wrapper.find('.storage-dialog__status').text()).toContain('cannot be reached')
    })

    it('says how many albums have changes waiting to be sent', async () => {
        localStates.mockResolvedValue({
            a: { status: 'pending' }, b: { status: 'synced' }, c: { status: 'pending' }, d: { status: 'conflict' },
        })
        await mountDialog()
        expect(wrapper.text()).toContain('albums have changes waiting to be sent')
    })

    it('cannot be switched on without a service worker, but can always be switched off', async () => {
        hasServiceWorker.mockReturnValue(false)
        await mountDialog()
        expect(toggle().element.disabled).toBe(true)
        expect(wrapper.text()).toContain('Offline start is not active')
        wrapper.unmount()
        connectivity.forced = true
        connectivity.online = false
        await mountDialog()
        expect(toggle().element.disabled).toBe(false)
    })

    it('warns when working offline with no album kept on the device', async () => {
        storageUsage.mockResolvedValue({ albums: [], total: 0, usage: null, quota: null, persisted: true })
        connectivity.forced = true
        connectivity.online = false
        await mountDialog()
        expect(wrapper.text()).toContain('photos and videos will not be shown')
    })
})
