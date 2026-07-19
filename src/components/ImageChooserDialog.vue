<template>
    <NcModal size="large" :name="sTitle" @close="$emit('close')">
        <div class="chooser-dialog">
            <div class="chooser-header">
                <NcBreadcrumbs class="chooser-crumbs">
                    <NcBreadcrumb :name="sAllFiles" :title="sAllFiles"
                        :disable-drop="true" @click="browse('')">
                        <template #icon>
                            <Home :size="20" />
                        </template>
                    </NcBreadcrumb>
                    <NcBreadcrumb v-for="crumb in crumbs" :key="crumb.path"
                        :name="crumb.name" :title="crumb.name"
                        :disable-drop="true" @click="browse(crumb.path)" />
                </NcBreadcrumbs>
                <NcButton :disabled="saving || loading"
                    :aria-label="sUpload" :title="sUpload"
                    v-on:click="$refs.fileInput.click()">
                    <template #icon>
                        <UploadIcon :size="20" />
                    </template>
                    {{ sUpload }}
                </NcButton>
                <!-- Hidden native picker behind the upload button; `accept`
                     narrows the OS dialog to the mimetypes albums support. -->
                <input ref="fileInput" type="file" class="chooser-file-input"
                    :accept="acceptMimes" v-on:change="onFileChosen" />
            </div>

            <div class="chooser-body">
                <div v-if="loading" class="chooser-center">
                    <NcLoadingIcon :size="44" />
                </div>
                <NcEmptyContent v-else-if="entries.length === 0" :name="sEmpty">
                    <template #icon>
                        <ImageIcon />
                    </template>
                </NcEmptyContent>
                <ul v-else class="chooser-grid" :aria-label="sTitle">
                    <li v-for="entry in entries" :key="entry.path">
                        <button v-if="entry.isFolder" type="button"
                            class="chooser-tile chooser-folder"
                            :disabled="saving" v-on:click="browse(entry.path)">
                            <Folder :size="48" />
                            <span class="chooser-name">{{ entry.basename }}</span>
                        </button>
                        <button v-else type="button"
                            class="chooser-tile chooser-image"
                            :class="{ selected: selectedPath === entry.path }"
                            :aria-pressed="String(selectedPath === entry.path)"
                            :disabled="saving"
                            v-on:click="select(entry)" v-on:dblclick="choose(entry)">
                            <img v-if="!failedPreviews[entry.path]" class="chooser-thumb"
                                :src="previewUrl(entry)" :alt="entry.basename"
                                loading="lazy"
                                v-on:error="failedPreviews[entry.path] = true" />
                            <VideoIcon v-else-if="isVideo(entry)" :size="48" />
                            <ImageIcon v-else :size="48" />
                            <span v-if="isVideo(entry)" class="chooser-video-badge">
                                <PlayCircleOutline :size="24" />
                            </span>
                            <span class="chooser-name">{{ entry.basename }}</span>
                        </button>
                    </li>
                </ul>
            </div>

            <div class="chooser-footer">
                <div class="chooser-footer-spacer"></div>
                <NcButton :disabled="saving" v-on:click="$emit('close')">
                    {{ sCancel }}
                </NcButton>
                <NcButton variant="primary" :disabled="saving || selectedEntry == null"
                    v-on:click="choose(selectedEntry)">
                    <template #icon>
                        <NcLoadingIcon v-if="saving" :size="20" />
                        <Check v-else :size="20" />
                    </template>
                    {{ sChoose }}
                </NcButton>
            </div>
        </div>
    </NcModal>
</template>

<script>

import { NcModal, NcButton, NcLoadingIcon, NcEmptyContent, NcBreadcrumbs, NcBreadcrumb } from '@nextcloud/vue'
import Home from 'vue-material-design-icons/Home.vue'
import Folder from 'vue-material-design-icons/Folder.vue'
import UploadIcon from 'vue-material-design-icons/Upload.vue'
import ImageIcon from 'vue-material-design-icons/Image.vue'
import VideoIcon from 'vue-material-design-icons/Video.vue'
import PlayCircleOutline from 'vue-material-design-icons/PlayCircleOutline.vue'
import Check from 'vue-material-design-icons/Check.vue'
import { showError } from '@nextcloud/dialogs'
import { listFolder, getPreviewUrl, IMAGE_MIMES, VIDEO_MIMES } from '../api/davApi.js'

// Everything the chooser offers: images and, since issue #32, videos.
const MEDIA_MIMES = IMAGE_MIMES.concat(VIDEO_MIMES)

export default {
    props: {
        // True while the album is linking/uploading the chosen image; freezes
        // every control so nothing can be chosen twice (same contract as
        // PaintDialog's saving prop).
        "saving": Boolean,
    },
    emits: ['close', 'pick', 'upload'],
    data: function() {
        return {
            "currentPath": "",
            "entries": [],
            "loading": false,
            "selectedPath": null,
            // Paths whose thumbnail failed to load (no preview provider):
            // their tiles fall back to a generic image icon.
            "failedPreviews": {},
            "acceptMimes": MEDIA_MIMES.join(','),
            "sTitle": t("souvenirs", "Choose an image or a video"),
            "sAllFiles": t("souvenirs", "All files"),
            "sUpload": t("souvenirs", "Upload"),
            "sCancel": t("souvenirs", "Cancel"),
            "sChoose": t("souvenirs", "Choose"),
            "sEmpty": t("souvenirs", "No images or videos in this folder."),
        }
    },
    components: {
        NcModal,
        NcButton,
        NcLoadingIcon,
        NcEmptyContent,
        NcBreadcrumbs,
        NcBreadcrumb,
        Home,
        Folder,
        UploadIcon,
        ImageIcon,
        VideoIcon,
        PlayCircleOutline,
        Check,
    },
    computed: {
        'crumbs': function() {
            // One breadcrumb per path segment, each carrying the cumulative
            // path it navigates to. Empty at the files root.
            var crumbs = [];
            var path = "";
            for (const segment of this.currentPath.split('/').filter(s => s !== '')) {
                path = path === "" ? segment : path + '/' + segment;
                crumbs.push({ name: segment, path: path });
            }
            return crumbs;
        },
        'selectedEntry': function() {
            return this.entries.find(e => e.path === this.selectedPath) || null;
        },
    },
    mounted: function() {
        // Resume in the folder browsed last (this session); if it disappeared
        // meanwhile, fall back to the files root once.
        this.browse(lastBrowsedPath).then(ok => {
            if (!ok && lastBrowsedPath !== "") {
                lastBrowsedPath = "";
                this.browse("");
            }
        });
    },
    methods: {
        // Resolves to true on success; on failure shows a toast, keeps the
        // current listing so the user is not stranded, and resolves to false
        // (mounted() uses that for its root fallback).
        browse: async function(path) {
            this.loading = true;
            this.selectedPath = null;
            var listed;
            try {
                listed = await listFolder(path);
            } catch (error) {
                this.loading = false;
                showError(t("souvenirs", "Could not open this folder."));
                return false;
            }
            const folders = listed.filter(e => e.isFolder)
                .sort((a, b) => a.basename.localeCompare(b.basename, undefined, { numeric: true, sensitivity: 'base' }));
            // Most recent first within the folder (issue #31).
            const media = listed.filter(e => !e.isFolder && MEDIA_MIMES.includes(e.mime))
                .sort((a, b) => b.mtime - a.mtime);
            this.entries = folders.concat(media);
            this.currentPath = path;
            this.failedPreviews = {};
            this.loading = false;
            lastBrowsedPath = path;
            return true;
        },
        isVideo: function(entry) {
            return VIDEO_MIMES.includes(entry.mime);
        },
        select: function(entry) {
            // Clicking the selected tile again deselects it.
            this.selectedPath = this.selectedPath === entry.path ? null : entry.path;
        },
        choose: function(entry) {
            if (this.saving || entry == null) {
                return;
            }
            this.$emit('pick', entry);
        },
        previewUrl: function(entry) {
            return getPreviewUrl(entry.fileid);
        },
        onFileChosen: function(event) {
            const file = event.target.files && event.target.files[0];
            // Reset so picking the same file again re-fires `change`.
            event.target.value = '';
            if (!file) {
                return;
            }
            if (!MEDIA_MIMES.includes(file.type)) {
                showError(t("souvenirs", "This file is not a supported image or video."));
                return;
            }
            this.$emit('upload', file);
        },
    },
}

// Folder shown when the chooser next opens, shared across dialog instances so
// adding several images in a row does not restart from the files root.
let lastBrowsedPath = "";

</script>

<style scoped>
.chooser-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    height: min(80vh, 700px);
}
.chooser-header {
    display: flex;
    align-items: center;
    gap: 8px;
}
.chooser-crumbs {
    flex: 1 1 auto;
    min-width: 0;
}
/* The breadcrumbs flex-grow must not squeeze the upload button's label. */
.chooser-header > .button-vue {
    flex: 0 0 auto;
}
.chooser-file-input {
    display: none;
}
.chooser-body {
    flex: 1 1 auto;
    overflow-y: auto;
}
.chooser-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
}
.chooser-tile {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--border-radius-large, 8px);
    background-color: var(--color-background-hover);
    cursor: pointer;
}
.chooser-tile:focus-visible {
    outline: 2px solid var(--color-main-text);
}
.chooser-image.selected {
    outline: 3px solid var(--color-primary-element);
    outline-offset: -3px;
}
.chooser-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
/* Play badge marking video tiles apart from image ones. */
.chooser-video-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    color: #ffffff;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
}
.chooser-name {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 2px 6px;
    font-size: 12px;
    text-align: start;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-main-text);
    background-color: color-mix(in srgb, var(--color-main-background) 70%, transparent);
}
.chooser-folder {
    flex-direction: column;
    gap: 4px;
}
.chooser-folder .chooser-name {
    position: static;
    background: none;
}
.chooser-footer {
    display: flex;
    align-items: center;
    gap: 8px;
}
.chooser-footer-spacer {
    flex: 1 1 auto;
}
.chooser-center {
    display: flex;
    justify-content: center;
    padding: 40px;
}
</style>
