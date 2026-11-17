<template>
    <!-- Everything about working offline (issue #22), behind the offline
         button of the album list: the switch to work offline by choice,
         then the storage of the offline copies - space used per album and
         in total, removal of copies, and the device-level settings that
         make them last (persistent storage, notifications). -->
    <NcModal size="normal" :name="sTitle" @close="$emit('close')">
        <div class="storage-dialog">
            <h2>{{ sTitle }}</h2>

            <NcCheckboxRadioSwitch type="switch" class="storage-dialog__switch" :model-value="forced"
                :loading="switching" :disabled="switching || (!forced && !serviceWorker)"
                @update:model-value="setForced">
                {{ sWorkOffline }}
            </NcCheckboxRadioSwitch>
            <p class="storage-dialog__hint">{{ sWorkOfflineHint }}</p>
            <p v-if="!serviceWorker" class="storage-dialog__hint storage-dialog__warning">{{ sNoWorker }}</p>
            <p class="storage-dialog__status" role="status">{{ statusText }}</p>
            <p v-if="pendingText !== ''" class="storage-dialog__hint">{{ pendingText }}</p>
            <p v-if="forced && !loading && usage.albums.length === 0" class="storage-dialog__hint storage-dialog__warning">{{ sNothingKept }}</p>

            <h3>{{ sAlbums }}</h3>
            <div v-if="loading" class="storage-dialog__center">
                <NcLoadingIcon :size="44" />
            </div>
            <template v-else>
                <p v-if="usage.albums.length === 0" class="storage-dialog__empty">{{ sNone }}</p>
                <ul v-else class="storage-dialog__list">
                    <li v-for="album in usage.albums" :key="album.id">
                        <span class="storage-dialog__name">{{ album.name }}</span>
                        <span class="storage-dialog__size">{{ formatBytes(album.bytes) }}</span>
                        <NcButton variant="tertiary" :aria-label="sRemove" :title="sRemove" v-on:click="remove(album)">
                            <template #icon>
                                <Delete :size="20" />
                            </template>
                        </NcButton>
                    </li>
                </ul>
                <p class="storage-dialog__total">{{ totalText }}</p>
                <NcProgressBar v-if="usage.quota" size="medium" :value="quotaPercent" :error="quotaPercent > 90" />
                <p v-if="usage.quota" class="storage-dialog__hint">{{ quotaText }}</p>

                <h3>{{ sDevice }}</h3>
                <p class="storage-dialog__hint">{{ usage.persisted ? sPersisted : sNotPersisted }}</p>
                <div v-if="notifications === 'default'" class="storage-dialog__row">
                    <span>{{ sNotifications }}</span>
                    <NcButton v-on:click="enableNotifications">{{ sEnable }}</NcButton>
                </div>

                <div class="storage-dialog__actions">
                    <NcButton variant="error" :disabled="confirmingWipe" v-on:click="confirmingWipe = true">{{ sWipe }}</NcButton>
                    <NcButton variant="primary" v-on:click="$emit('close')">{{ sClose }}</NcButton>
                </div>
                <div v-if="confirmingWipe" class="storage-dialog__confirm" role="alert">
                    <p>{{ sWipeConfirm }}</p>
                    <div class="storage-dialog__actions">
                        <NcButton v-on:click="confirmingWipe = false">{{ sCancel }}</NcButton>
                        <NcButton variant="error" v-on:click="wipe">{{ sWipeYes }}</NcButton>
                    </div>
                </div>
            </template>
        </div>
    </NcModal>
</template>

<script>

import { NcModal, NcButton, NcLoadingIcon, NcProgressBar, NcCheckboxRadioSwitch } from '@nextcloud/vue'
import Delete from 'vue-material-design-icons/Delete.vue'
import { storageUsage, removeOffline, wipeEverything, hasServiceWorker, localStates } from '../offline/offlineManager.js'
import { connectivity, setForcedOffline } from '../offline/connectivity.js'
import { notificationPermission, requestNotifications } from '../offline/notify.js'
import { formatBytes } from '../offline/format.js'

export default {
    name: 'StorageDialog',
    emits: ['close', 'changed'],
    components: {
        NcModal,
        NcButton,
        NcLoadingIcon,
        NcProgressBar,
        NcCheckboxRadioSwitch,
        Delete,
    },
    data: function() {
        return {
            loading: true,
            usage: { albums: [], total: 0, usage: null, quota: null, persisted: false },
            notifications: notificationPermission(),
            serviceWorker: hasServiceWorker(),
            confirmingWipe: false,
            connectivity: connectivity,
            // the switch is being applied: the worker is told, the server asked
            switching: false,
            // albums with changes not sent to the server yet
            pendingCount: 0,
            sTitle: t('souvenirs', 'Offline'),
            sWorkOffline: t('souvenirs', 'Work offline'),
            sWorkOfflineHint: t('souvenirs', 'For a slow or paid connection: Souvenirs then uses no data. Only the albums kept on this device can be viewed and edited, and your changes wait here until you switch this off.'),
            sNothingKept: t('souvenirs', 'No album is kept on this device: photos and videos will not be shown while you work offline.'),
            sAlbums: t('souvenirs', 'Albums kept on this device'),
            sNone: t('souvenirs', 'No album is kept on this device. Use the offline button of an album to keep a copy of it.'),
            sRemove: t('souvenirs', 'Remove offline copy'),
            sDevice: t('souvenirs', 'This device'),
            sPersisted: t('souvenirs', 'The browser keeps the offline copies until you remove them.'),
            sNotPersisted: t('souvenirs', 'The browser may delete the offline copies when space runs low or, on iPhone and iPad, after a week without use. Installing Souvenirs on the home screen (browser menu, "Install" or "Add to Home Screen") protects them. Changes not sent yet could be lost with them: reconnect regularly.'),
            sNoWorker: t('souvenirs', 'Offline start is not active in this browser: albums stay usable without a connection only while this page remains open.'),
            sNotifications: t('souvenirs', 'Notify me when a synchronization ends or needs my attention'),
            sEnable: t('souvenirs', 'Enable'),
            sWipe: t('souvenirs', 'Remove all offline data'),
            sWipeConfirm: t('souvenirs', 'Remove every album copy kept on this device? Changes that were not sent to the server yet will be lost.'),
            sWipeYes: t('souvenirs', 'Remove everything'),
            sCancel: t('souvenirs', 'Cancel'),
            sClose: t('souvenirs', 'Close'),
        }
    },
    computed: {
        forced: function() {
            return this.connectivity.forced
        },
        statusText: function() {
            if (this.forced) {
                return t('souvenirs', 'You are working offline: nothing is downloaded or sent.')
            }
            return this.connectivity.online
                ? t('souvenirs', 'Connected to the server.')
                : t('souvenirs', 'The server cannot be reached. Your changes are sent as soon as it answers.')
        },
        pendingText: function() {
            if (this.pendingCount === 0) {
                return ''
            }
            return n('souvenirs',
                '%n album has changes waiting to be sent.',
                '%n albums have changes waiting to be sent.',
                this.pendingCount)
        },
        totalText: function() {
            return t('souvenirs', 'Total kept offline: {size}', { size: formatBytes(this.usage.total) })
        },
        quotaPercent: function() {
            return this.usage.quota ? Math.min(100, Math.round(100 * (this.usage.usage || 0) / this.usage.quota)) : 0
        },
        quotaText: function() {
            return t('souvenirs', '{used} used of the {quota} this browser grants to this site', {
                used: formatBytes(this.usage.usage || 0),
                quota: formatBytes(this.usage.quota),
            })
        },
    },
    created: function() {
        this.refresh()
    },
    methods: {
        formatBytes: formatBytes,
        refresh: async function() {
            try {
                this.usage = await storageUsage()
                this.pendingCount = Object.values(await localStates())
                    .filter(state => state.status === 'pending').length
            } finally {
                this.loading = false
            }
        },
        setForced: async function(forced) {
            if (this.switching) {
                return
            }
            this.switching = true
            try {
                // back online, the album list sends what was edited meanwhile
                await setForcedOffline(forced)
            } finally {
                this.switching = false
            }
            this.$emit('changed')
        },
        remove: async function(album) {
            await removeOffline(album.id)
            this.$emit('changed')
            await this.refresh()
        },
        wipe: async function() {
            await wipeEverything()
            this.confirmingWipe = false
            this.$emit('changed')
            await this.refresh()
        },
        enableNotifications: async function() {
            this.notifications = await requestNotifications()
        },
    },
}
</script>

<style scoped>
.storage-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px;
}

.storage-dialog h2,
.storage-dialog h3 {
    margin: 0;
}

.storage-dialog__center {
    display: flex;
    justify-content: center;
    padding: 16px;
}

.storage-dialog__list {
    display: flex;
    flex-direction: column;
    max-height: 40vh;
    overflow-y: auto;
}

.storage-dialog__list li {
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--color-border, #ededed);
}

.storage-dialog__name {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.storage-dialog__size {
    flex: 0 0 auto;
    color: var(--color-text-maxcontrast, #767676);
}

.storage-dialog__total,
.storage-dialog__status {
    font-weight: bold;
}

.storage-dialog__hint,
.storage-dialog__empty {
    color: var(--color-text-maxcontrast, #767676);
}

.storage-dialog__warning {
    color: var(--color-warning-text, #a37200);
}

.storage-dialog__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.storage-dialog__actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
}

.storage-dialog__confirm {
    padding: 12px;
    border: 1px solid var(--color-error, #e9322d);
    border-radius: var(--border-radius-large, 10px);
}
</style>
