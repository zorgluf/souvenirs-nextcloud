<template>
    <!-- "Available offline" for one album (issue #22): what the download
         weighs before starting it, its progress with a cancel, and removal
         of the copy once it is there. -->
    <NcModal size="small" :name="sTitle" @close="close">
        <div class="offline-dialog">
            <h2>{{ sTitle }}</h2>
            <p class="offline-dialog__album">{{ album.name }}</p>

            <div v-if="step === 'loading'" class="offline-dialog__center">
                <NcLoadingIcon :size="44" />
            </div>

            <template v-else-if="step === 'ready'">
                <p>{{ sIntro }}</p>
                <p class="offline-dialog__figure">{{ estimateText }}</p>
                <div class="offline-dialog__actions">
                    <NcButton v-on:click="close">{{ sCancel }}</NcButton>
                    <NcButton variant="primary" v-on:click="download">
                        <template #icon>
                            <CloudDownloadOutline :size="20" />
                        </template>
                        {{ sDownload }}
                    </NcButton>
                </div>
            </template>

            <template v-else-if="step === 'downloading'">
                <p>{{ progressText }}</p>
                <NcProgressBar size="medium" :value="progress" />
                <div class="offline-dialog__actions">
                    <NcButton v-on:click="cancel">{{ sCancel }}</NcButton>
                </div>
            </template>

            <template v-else-if="step === 'offline'">
                <p>{{ sKept }}</p>
                <p class="offline-dialog__figure">{{ keptText }}</p>
                <div class="offline-dialog__actions">
                    <NcButton variant="error" v-on:click="remove">{{ sRemove }}</NcButton>
                    <NcButton variant="primary" v-on:click="close">{{ sClose }}</NcButton>
                </div>
            </template>

            <template v-else>
                <p class="offline-dialog__error" role="alert">{{ errorText }}</p>
                <div class="offline-dialog__actions">
                    <NcButton v-if="quotaExceeded" v-on:click="$emit('open-storage')">{{ sManageStorage }}</NcButton>
                    <NcButton variant="primary" v-on:click="close">{{ sClose }}</NcButton>
                </div>
            </template>
        </div>
    </NcModal>
</template>

<script>

import { NcModal, NcButton, NcLoadingIcon, NcProgressBar } from '@nextcloud/vue'
import CloudDownloadOutline from 'vue-material-design-icons/CloudDownloadOutline.vue'
import { prepareOffline, downloadOffline, removeOffline } from '../offline/offlineManager.js'
import { QuotaError, isSupported } from '../offline/mediaCache.js'
import { errorKind } from '../offline/remote.js'
import { formatBytes } from '../offline/format.js'

export default {
    name: 'OfflineDialog',
    props: {
        // The album: { id, path, name }.
        album: { type: Object, required: true },
        // Whether the server can be reached: nothing to download otherwise.
        online: { type: Boolean, default: true },
    },
    emits: ['close', 'changed', 'open-storage'],
    components: {
        NcModal,
        NcButton,
        NcLoadingIcon,
        NcProgressBar,
        CloudDownloadOutline,
    },
    data: function() {
        return {
            // loading | ready | downloading | offline | error
            step: 'loading',
            bytes: 0,
            count: 0,
            done: 0,
            total: 0,
            errorText: '',
            quotaExceeded: false,
            sTitle: t('souvenirs', 'Available offline'),
            sIntro: t('souvenirs', 'Keep a copy of this album on this device, to view and edit it without a connection. Changes are sent to the server when the connection is back.'),
            sKept: t('souvenirs', 'This album is kept on this device and stays up to date each time you open Souvenirs while connected.'),
            sDownload: t('souvenirs', 'Download'),
            sCancel: t('souvenirs', 'Cancel'),
            sClose: t('souvenirs', 'Close'),
            sRemove: t('souvenirs', 'Remove offline copy'),
            sManageStorage: t('souvenirs', 'Manage storage'),
        }
    },
    computed: {
        estimateText: function() {
            return n('souvenirs', '%n media, about {size}', '%n media, about {size}', this.count, { size: formatBytes(this.bytes) })
        },
        keptText: function() {
            return t('souvenirs', '{size} on this device', { size: formatBytes(this.bytes) })
        },
        progress: function() {
            return this.total > 0 ? Math.round(100 * this.done / this.total) : 0
        },
        progressText: function() {
            return t('souvenirs', 'Downloading: {done} of {total}', { done: this.done, total: this.total })
        },
    },
    created: function() {
        // Plain property: an AbortController needs no reactivity.
        this.abort = null
        this.prepare()
    },
    beforeUnmount: function() {
        if (this.abort != null) {
            this.abort.abort()
        }
    },
    methods: {
        fail: function(error) {
            this.quotaExceeded = error instanceof QuotaError
            if (this.quotaExceeded) {
                this.errorText = t('souvenirs', 'There is not enough space left on this device for this album.')
            } else if (errorKind(error) === 'network') {
                this.errorText = t('souvenirs', 'The server cannot be reached: connect to make this album available offline.')
            } else if (errorKind(error) === 'auth') {
                this.errorText = t('souvenirs', 'Your session has expired: log in again to make this album available offline.')
            } else {
                this.errorText = t('souvenirs', 'Could not make this album available offline.')
            }
            this.step = 'error'
        },
        prepare: async function() {
            if (!isSupported()) {
                this.errorText = t('souvenirs', 'This browser cannot keep media offline.')
                this.step = 'error'
                return
            }
            try {
                const prepared = await prepareOffline(this.album)
                this.count = prepared.count
                if (prepared.record.offline) {
                    this.bytes = prepared.record.offlineBytes || 0
                    this.step = 'offline'
                } else if (!this.online) {
                    this.fail({ name: 'TypeError' })
                } else {
                    this.bytes = prepared.bytes
                    this.step = 'ready'
                }
            } catch (error) {
                this.fail(error)
            }
        },
        download: async function() {
            this.abort = new AbortController()
            this.done = 0
            this.total = this.count
            this.step = 'downloading'
            try {
                const record = await downloadOffline(this.album.id, {
                    signal: this.abort.signal,
                    onProgress: ({ done, total }) => {
                        this.done = done
                        this.total = total
                    },
                })
                this.bytes = record.offlineBytes || 0
                this.step = 'offline'
                this.$emit('changed')
            } catch (error) {
                if (error != null && error.name === 'AbortError') {
                    // cancelled: back to the estimate
                    this.step = 'ready'
                } else {
                    this.fail(error)
                }
            } finally {
                this.abort = null
            }
        },
        cancel: function() {
            if (this.abort != null) {
                this.abort.abort()
            }
        },
        remove: async function() {
            await removeOffline(this.album.id)
            this.$emit('changed')
            this.$emit('close')
        },
        close: function() {
            this.cancel()
            this.$emit('close')
        },
    },
}
</script>

<style scoped>
.offline-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px;
}

.offline-dialog h2 {
    margin: 0;
}

.offline-dialog__album {
    font-weight: bold;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.offline-dialog__figure {
    font-size: 120%;
}

.offline-dialog__center {
    display: flex;
    justify-content: center;
    padding: 16px;
}

.offline-dialog__error {
    color: var(--color-error-text, #c00);
}

.offline-dialog__actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
}
</style>
