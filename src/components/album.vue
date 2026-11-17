<template>
	<div v-bind:class="['s-album', { 'editing': editMode }]" tabindex="0" v-on:keydown="onKeydown"
    v-on:keydown.e="onEditKey" v-on:dragover="onAlbumDragOver" v-on:click="onAlbumClick">
        <div class="top-right">
            <!-- Sync status of the album (issue #22): synchronized, changes
                 waiting, offline or conflict. -->
            <span v-if="syncIndicator != null" :class="['sync-indicator', 'sync-indicator--' + syncIndicator.id]"
                :title="syncIndicator.label" :aria-label="syncIndicator.label" role="status">
                <component :is="syncIndicator.icon" :size="20" />
            </span>
            <!-- Background saves in progress (issue #50): light edits no longer
                 block the page, this is the only sign they are being sent. -->
            <span v-if="editMode && pendingSaves > 0 && savingCount === 0" class="saving-indicator"
                :title="sSaving" :aria-label="sSaving" role="status">
                <NcLoadingIcon :size="20"></NcLoadingIcon>
            </span>
            <NcActions default-icon="icon-menu" :force-menu="true" :primary="true" v-if="!fullscreenMode">
                <NcActionButton v-if="canEdit" @click="toggleEdit" :close-after-click="true">
                    <template #icon>
                        <PencilOff v-if="editMode" :size="20"/>
                        <Pencil v-else :size="20"/>
                    </template>
                    {{ editMode ? sFinishEdit : sEdit }}
                </NcActionButton>
                <NcActionSeparator v-if="canEdit"/>
                <NcActionButton icon="icon-fullscreen" @click="fullscreen">{{ sFullscreen }}</NcActionButton>
                <NcActionSeparator/>
                <NcActionButton icon="icon-play" @click="diaporama(true)" v-if="!diaporamaMode">{{ sStartSh }}</NcActionButton>
                <NcActionInput icon="" type="number" @submit="diaporama(true)" v-if="!diaporamaMode" :value="diaporamaSpeed" @input="diaporamaSpeed=$event.target.value">{{ sSpeedSh }}</NcActionInput>
                <NcActionButton icon="icon-pause" @click="diaporama(false)" v-if="diaporamaMode">{{ sStopSh }}</NcActionButton>
                <NcActionSeparator/>
                <NcActionButton icon="icon-download" @click="openDownloadModal" :close-after-click="true" :disabled="!online">{{ sDownload }}</NcActionButton>
                <NcActionSeparator/>
                <NcActionButton @click="openHelp()" :close-after-click="true">
                    <template #icon>
                        <HelpCircleOutline :size="20"/>
                    </template>
                    {{ sHelp }}
                </NcActionButton>
            </NcActions>
        </div>
        <!-- Offline / session / conflict banners (issue #22). -->
        <div v-if="statusBanner != null && !fullscreenMode" :class="['album-banner', 'album-banner--' + statusBanner.id]" role="status">
            <span>{{ statusBanner.text }}</span>
            <NcButton v-if="statusBanner.action != null" variant="secondary" v-on:click="statusBanner.action.run">
                {{ statusBanner.action.label }}
            </NcButton>
        </div>
        <div v-if="sync.conflicts != null && !fullscreenMode" class="album-banner album-banner--conflict" role="alert">
            <p class="album-banner__title">{{ sConflictTitle }}</p>
            <p>{{ sConflictIntro }}</p>
            <div v-for="domain in conflictDomains" :key="domain.id" class="conflict-row">
                <span class="conflict-row__label">{{ domain.label }}</span>
                <NcButton :variant="conflictChoices[domain.id] === 'local' ? 'primary' : 'secondary'"
                    :aria-pressed="String(conflictChoices[domain.id] === 'local')"
                    v-on:click="conflictChoices[domain.id] = 'local'">{{ sKeepLocal }}</NcButton>
                <NcButton :variant="conflictChoices[domain.id] === 'remote' ? 'primary' : 'secondary'"
                    :aria-pressed="String(conflictChoices[domain.id] === 'remote')"
                    v-on:click="conflictChoices[domain.id] = 'remote'">{{ sKeepRemote }}</NcButton>
            </div>
            <div class="conflict-actions">
                <NcButton variant="tertiary" :disabled="!online" v-on:click="resolveAllConflicts('local')">{{ sAllLocal }}</NcButton>
                <NcButton variant="tertiary" :disabled="!online" v-on:click="resolveAllConflicts('remote')">{{ sAllRemote }}</NcButton>
                <NcButton variant="primary" :disabled="!online || !conflictChoicesComplete" v-on:click="applyConflictChoices">{{ sApplyChoices }}</NcButton>
            </div>
        </div>
	    <i v-bind:class="isWinPortrait ? 'arrow-top': 'arrow-left'" v-on:click="showPrev"  v-if="!isTouchDevice"
            v-bind:style="{ visibility: aLeftVisible ? 'visible' : 'hidden', }"></i>
        <page v-for="(page, index) in pages" v-bind:s-num="index" v-bind:s-id="page.id" v-bind:displayed-page="displayedPage" v-bind:key="page.id"
            v-bind:elements="page.elements" v-bind:album-path="path" v-bind:is-win-portrait="isWinPortrait"
            v-bind:token="token" v-on:imagefull="openImgFull" v-on:videofull="openVideoFull" v-bind:element-margin="elementMargin"
            v-bind:edit-mode="editMode" v-on:edit-text="onEditText"
            v-bind:selected-element-id="selectedElementId" v-on:select-element="onSelectElement"
            v-bind:is-last="index === pages.length - 1"
            v-bind:pending-assets="sync.pendingAssets" v-bind:online="online"
            v-on:remove-element="onRemoveElement" v-on:resize-element="onResizeElement"
            v-on:pan-zoom-element="onPanZoomElement"
            v-on:add-image="onAddImage"
            v-on:add-text="onAddText" v-on:paint="onPaint" v-on:cycle-layout="onCycleLayout"
            v-on:add-page="onAddPage" v-on:move-page="onMovePage"
            v-on:element-drop="onElementDrop" v-on:remove-audio="onRemoveAudio">
	    </page>
	    <i v-bind:class="isWinPortrait ? 'arrow-bottom': 'arrow-right'" v-on:click="showNext" v-if="!isTouchDevice"
            v-bind:style="{ visibility: aRightVisible ? 'visible' : 'hidden', }"></i>
        <div v-bind:class="isWinPortrait ? 'progress-portrait': 'progress'" v-if="!isTouchDevice">
            <div v-bind:class=" [ isWinPortrait ? 'progress-item-portrait': 'progress-item', index == displayedPage ? 'progress-item-full' : 'progress-item-empty']" v-for="(page, index) in pages" v-bind:key="index"
            v-on:click="showN(index)">
            </div>
        </div>
        <imagefull v-if="imageFullOn" v-bind:imageUrl="imageFullUrl" v-bind:isPhotosphere="imageFullIsPhotosphere"
            v-on:closeimagefull="closeImgFull">
        </imagefull>
        <videofull v-if="videoFullOn" v-bind:videoUrl="videoFullUrl"
            v-on:click="closeVideoFull" v-on:closevideofull="closeVideoFull">
        </videofull>
        <AudioPlayer v-bind:audioUrl="audioUrl" v-bind:stop="isStopCmd || audioForceStop"></AudioPlayer>
        <div v-if="loading" class="center-page">
            <NcLoadingIcon :size="64">
            </NcLoadingIcon>
        </div>
        <Teleport to="body">
            <!-- Teleported so it escapes the app-content stacking context and
                 covers the whole page, Nextcloud header included. -->
            <div v-if="savingCount > 0" class="saving-overlay">
                <NcLoadingIcon :size="64">
                </NcLoadingIcon>
            </div>
        </Teleport>
        <!-- Opened without the server and never kept on this device (issue #22). -->
        <div v-if="unavailable && !loading" class="album-unavailable">
            <CloudOffOutline :size="64" />
            <h2>{{ sUnavailableTitle }}</h2>
            <p>{{ sUnavailableText }}</p>
            <NcButton variant="primary" v-on:click="backToList">{{ sBackToList }}</NcButton>
        </div>
        <div v-if="canEdit && !loading && pages.length === 0" class="empty-album">
            <NcButton type="primary" v-on:click="onAddFirstPage">
                <template #icon>
                    <Plus :size="20" />
                </template>
                {{ sAddPage }}
            </NcButton>
        </div>
        <paint-dialog v-if="paintPage != null" :page-id="paintPage.id"
            :elements="paintPage.elements" :album-path="path" :element-margin="elementMargin"
            :saving="paintSaving" v-on:close="closePaint" v-on:confirm="onPaintConfirm">
        </paint-dialog>
        <image-chooser-dialog v-if="imageChooserPageId != null" :saving="imageChooserSaving" :offline="!online"
            v-on:close="closeImageChooser" v-on:pick="onImagePick" v-on:upload="onImageUpload">
        </image-chooser-dialog>
        <help-dialog v-if="helpOpen" :can-edit="canEdit" :is-touch-device="isTouchDevice"
            :initial-section="helpSection" v-on:close="closeHelp">
        </help-dialog>
        <NcDialog v-if="audioRemovePageId != null" :name="sRemoveAudioTitle"
            :message="sRemoveAudioMsg" :buttons="removeAudioButtons"
            @update:open="onRemoveAudioDialogOpen">
        </NcDialog>
        <NcModal v-if="downloadModal" @close="closeDownload" size="small">
            <p class="center">{{ sDownloadZip }}</p>
            <div v-if="!downloadActive" class="downloadIcon center" v-on:click="download"></div>
            <NcProgressBar v-if="downloadActive" size="medium" v-bind:value="downloadProgress"/>
        </NcModal>
    </div>
</template>

<script>

import Page from './page.vue'
import Imagefull from './imagefull.vue'
import Videofull from './videofull.vue'
import AudioPlayer from './audio_player.vue'
import { NcLoadingIcon, NcActionInput, NcActionButton, NcActions, NcProgressBar, NcModal, NcActionSeparator, NcButton, NcDialog } from '@nextcloud/vue'
import Plus from 'vue-material-design-icons/Plus.vue'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { setElementText, setElementGeometry, setElementPanZoom, removeElement, buildImageElement, buildVideoElement, buildAudioElement, buildTextElement, buildPage, addElement, swapElements, getPaintElement, setPagePaintElement, removePaintElements, getAudioElement, removeAudioElements, hasVisibleElements } from '../utils/albumEdit.js'
import { isElementDrag } from '../utils/elementDrag.js'
import { captureVideoPoster } from '../utils/videoPoster.js'
import { getFileUrl, getFilePreviewBlob, VIDEO_MIMES, AUDIO_MIMES } from '../api/davApi.js'
import { cycleLayout } from '../utils/tilePageLayout.js'
import { updatePage, searchAssets, cleanAssets, createPage, deletePage, movePage, pageOperations, probeAsset, uploadAsset } from '../api/albumApi.js'
import { SaveQueue } from '../utils/saveQueue.js'
import { planMediaInsertion, applyPageOperationsLocally } from '../utils/mediaInsertion.js'
import PaintDialog from './PaintDialog.vue'
import ImageChooserDialog from './ImageChooserDialog.vue'
import HelpDialog from './HelpDialog.vue'
import { showError } from '@nextcloud/dialogs'
import '@nextcloud/dialogs/style.css'
import { generateUrl } from '@nextcloud/router'
import { AlbumSession } from '../offline/albumSession.js'
import { connectivity, onReconnect } from '../offline/connectivity.js'
import { isDeferrable } from '../offline/remote.js'
import { notifySynced, notifyConflict } from '../offline/notify.js'
import { forgetAlbum } from '../offline/offlineManager.js'
import CloudOffOutline from 'vue-material-design-icons/CloudOffOutline.vue'
import CloudUploadOutline from 'vue-material-design-icons/CloudUploadOutline.vue'
import CloudCheckOutline from 'vue-material-design-icons/CloudCheckOutline.vue'
import AlertCircleOutline from 'vue-material-design-icons/AlertCircleOutline.vue'
import Pencil from 'vue-material-design-icons/Pencil.vue'
import PencilOff from 'vue-material-design-icons/PencilOff.vue'
import HelpCircleOutline from 'vue-material-design-icons/HelpCircleOutline.vue'

// The write API used when the album has no local copy to go through (public
// view, unit tests): the server, directly.
const directApi = { updatePage, createPage, deletePage, movePage, pageOperations, cleanAssets }

// How long the "Offline: ..." banner stays above the pages.
const OFFLINE_NOTICE_MS = 5000

export default {
    props: {
      "path": {
        type: String,
        default: "",
      },
      "token": {
        type: String,
        default: "",
      },
    },
    data: function() {
        return {
            "displayedPage": 0,
            "imageFullOn": false,
            "imageFullUrl": "",
            "imageFullIsPhotosphere": false,
            "videoFullOn": false,
            "videoFullUrl": "",
            "sName": "",
            "albumId": "",
            // The album folder relative to the user's files root, as returned
            // by the album load (issue #50): new assets are uploaded there
            // directly, without asking the server first (assetprobe).
            "albumDavPath": "",
            "editMode": false,
            "pages": [],
            "loading": true,
            "downloadModal": false,
            "downloadActive": false,
            "downloadProgress": 0,
            "albumJson": "",
            "fullscreenMode": false,
            "diaporamaMode": false,
            "diap_timeout": null,
            "diaporamaSpeed": 5,
            "isWinPortrait": false,
            "sStartSh": t("souvenirs","Start slideshow ( )"),
            "sStopSh": t("souvenirs","Stop slideshow ( )"),
            "sSpeedSh": t("souvenirs","Slideshow speed"),
            "sDownload": t("souvenirs","Download"),
            "sFullscreen": t("souvenirs","Fullscreen"),
            "sDownloadZip": t("souvenirs","Click to download album in a zip file."),
            "sEdit": t("souvenirs","Edit (E)"),
            "sFinishEdit": t("souvenirs","Finish editing (E)"),
            "sAddPage": t("souvenirs","Add page"),
            "sSaving": t("souvenirs","Saving changes…"),
            "sHelp": t("souvenirs","Help (?)"),
            // In-app user guide (issue #47): open flag and the section it
            // opens on (the "?" key lands on the shortcuts).
            "helpOpen": false,
            "helpSection": "structure",
            "elementMargin": 1,
            "isTouchDevice": isTouchDevice(),
            // Id of the page currently open in the paint dialog (null = closed),
            // and whether its confirmed drawing is being uploaded/persisted.
            "paintPageId": null,
            "paintSaving": false,
            // Same pair for the image chooser dialog.
            "imageChooserPageId": null,
            "imageChooserSaving": false,
            // Id of the page whose audio-removal confirmation dialog is open
            // (null = closed), and a forced stop of the audio player after a
            // removal (the player deliberately keeps playing when the track
            // URL goes away — background-music semantics).
            "audioRemovePageId": null,
            "audioForceStop": false,
            "sRemoveAudioTitle": t("souvenirs","Remove audio"),
            "sRemoveAudioMsg": t("souvenirs","Remove this page's audio? The music will no longer play when the page is displayed."),
            // Timestamp of the last page turn triggered by dragging an element
            // near the album edge (throttles the edge navigation).
            "dragNavLast": 0,
            // Number of in-flight blocking edit actions (issue #39): while > 0,
            // a full-page overlay blocks any further modification. A counter,
            // not a boolean, so overlapping actions compose. Since issue #50
            // only structural actions block; text/geometry edits are saved in
            // the background (see saveQueue).
            "savingCount": 0,
            // Edit-mode writes not yet confirmed by the server (issue #50):
            // drives the discreet "saving" indicator.
            "pendingSaves": 0,
            // Element selected in edit mode (issue #56): the only one showing
            // its move/resize/framing controls and taking pan & zoom gestures.
            "selectedElementId": null,
            // Offline support (issue #22). Sync status of the album's local
            // copy, as published by its AlbumSession.
            "sync": { status: "none", conflicts: null, pendingAssets: [], authExpired: false, gone: false, offlineCopy: false },
            // The album is neither reachable nor kept on this device.
            "unavailable": false,
            // The offline banner is a notice, not a permanent fixture: it goes
            // away after a few seconds (the status icon next to the menu stays).
            "offlineNoticeVisible": false,
            // The user's pick for each domain in conflict: 'local' / 'remote'.
            "conflictChoices": { info: null, pages: null, content: null },
            "connectivity": connectivity,
            "sConflictTitle": t("souvenirs","This album was modified both on this device and on the server"),
            "sConflictIntro": t("souvenirs","It is read-only until you choose, for each part, which version to keep. The other one is discarded."),
            "sKeepLocal": t("souvenirs","This device"),
            "sKeepRemote": t("souvenirs","Server"),
            "sAllLocal": t("souvenirs","Keep everything from this device"),
            "sAllRemote": t("souvenirs","Keep everything from the server"),
            "sApplyChoices": t("souvenirs","Apply"),
            "sUnavailableTitle": t("souvenirs","This album is not available offline"),
            "sUnavailableText": t("souvenirs","Open it once while connected, or make it available offline from the album list. It can then be viewed and edited without a connection."),
            "sBackToList": t("souvenirs","Back to the albums"),
        }
    },
    created: function() {
        window.addEventListener("resize", this.resizeEventHandler);
        // All album writes go through one serialized queue (issue #50): no two
        // album.json rewrites in flight, background saves for light edits.
        // Plain properties, not data(): no reactivity needed.
        var that = this;
        this.saveQueue = new SaveQueue({
            onChange: function(pending) { that.pendingSaves = pending; },
            onError: function(error) { that.onSaveError(error); },
        });
        this.cleanTimer = null;
        this.lastSaveErrorAt = 0;
        window.addEventListener("beforeunload", this.onBeforeUnload);
        // Offline support (issue #22), authenticated view only: the album's
        // local copy, and a sync each time the server becomes reachable again.
        this.session = null;
        this.syncing = false;
        this.stopReconnectWatch = null;
        // (offlineNoticeTimer is owned by the offlineNotice watcher, which is
        // immediate and so already ran: not reset here)
        if (this.token == "") {
            this.stopReconnectWatch = onReconnect(function() { that.onReconnected(); });
            document.addEventListener("visibilitychange", this.onVisibilityChange);
        }
    },
    beforeUnmount: function() {
        // Leaving the album (router navigation): send the debounced writes
        // now instead of dropping them with the component.
        window.removeEventListener("beforeunload", this.onBeforeUnload);
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
        if (this.stopReconnectWatch) {
            this.stopReconnectWatch();
        }
        var session = this.session;
        this.saveQueue.flush().then(function() {
            // after the last writes: store the local copy as it now stands
            if (session != null) {
                session.close();
            }
        });
        if (this.cleanTimer) {
            clearTimeout(this.cleanTimer);
            this.cleanTimer = null;
        }
        clearTimeout(this.offlineNoticeTimer);
    },
    destroyed: function() {
        window.removeEventListener("resize", this.resizeEventHandler);
        document.querySelector(".s-album").removeEventListener("scroll",this.updatePageDisplayed)
    },
    mounted: function() {
        this.resizeEventHandler(null);
        this.refreshAlbum();
        if (document.addEventListener) {
            document.addEventListener('fullscreenchange', ()=> {this.fullscreenMode = (document.fullscreenElement != null)}, false);
        }
        document.querySelector(".s-album").focus();
        document.querySelector(".s-album").addEventListener('scroll', this.updatePageDisplayed);
        console.log(this.$device);
    },
    watch: {
        editMode(newValue) {
            if (!newValue) {
                this.selectedElementId = null;
            }
        },
        fullscreenMode(newValue, oldValue) {
            if (newValue == true) {
                document.querySelector(".s-album").requestFullscreen();
            }
        },
        diaporamaMode(newValue, oldValue) {
            if (newValue == true) {
                this.diapoTick();
            } else {
                clearTimeout(this.diap_timeout);
            }
        },
        audioUrl(newValue, oldValue) {
            // Any track change (new page, re-added audio) cancels the forced
            // stop from a removal, so the next track plays normally.
            this.audioForceStop = false;
        },
        offlineNotice: {
            // Shown each time the album turns out to be offline (opened without
            // a connection, or the connection is lost), for a few seconds.
            immediate: true,
            handler(newValue) {
                var that = this;
                clearTimeout(this.offlineNoticeTimer);
                this.offlineNoticeTimer = null;
                this.offlineNoticeVisible = newValue;
                if (newValue) {
                    this.offlineNoticeTimer = setTimeout(function() {
                        that.offlineNoticeVisible = false;
                    }, OFFLINE_NOTICE_MS);
                }
            },
        },
    },
    computed: {
        'canEdit': function() {
            // Editing is only available in the authenticated (non-public)
            // view - and not while a conflict waits for the user's decision
            // (issue #22), nor on an album that could not be loaded.
            return (this.token == "") && !this.unavailable && this.sync.conflicts == null;
        },
        'online': function() {
            return this.connectivity.online;
        },
        'forcedOffline': function() {
            // offline because the user chose to (the offline button of the
            // album list), not because of the network
            return this.connectivity.forced;
        },
        'syncIndicator': function() {
            // What the status icon next to the menu shows (issue #22).
            if (this.token != "" || this.unavailable || this.loading) {
                return null;
            }
            var pending = this.sync.status === "pending";
            if (this.sync.conflicts != null) {
                return { id: "conflict", icon: AlertCircleOutline, label: t("souvenirs","Conflict: choose which version to keep") };
            }
            if (!this.online) {
                if (this.forcedOffline) {
                    return { id: "offline", icon: CloudOffOutline, label: pending
                        ? t("souvenirs","Working offline: changes are kept on this device")
                        : t("souvenirs","Working offline") };
                }
                return { id: "offline", icon: CloudOffOutline, label: pending
                    ? t("souvenirs","Offline: changes are kept on this device")
                    : t("souvenirs","Offline") };
            }
            if (pending) {
                return { id: "pending", icon: CloudUploadOutline, label: t("souvenirs","Changes waiting to be synchronized") };
            }
            if (this.sync.status === "synced") {
                return { id: "synced", icon: CloudCheckOutline, label: t("souvenirs","Synchronized") };
            }
            return null;
        },
        'offlineNotice': function() {
            // Whether the album is being viewed without the server.
            return this.token == "" && !this.unavailable && !this.loading && !this.online;
        },
        'statusBanner': function() {
            // The one-line banner above the pages (issue #22), most pressing first.
            if (this.token != "" || this.unavailable || this.loading) {
                return null;
            }
            var that = this;
            if (this.sync.authExpired) {
                return {
                    id: "auth",
                    text: t("souvenirs","Your session has expired. Your changes are kept on this device until you log in again."),
                    action: { label: t("souvenirs","Log in"), run: function() { that.goToLogin(); } },
                };
            }
            if (this.sync.gone) {
                return {
                    id: "gone",
                    text: t("souvenirs","This album no longer exists on the server: this is the copy kept on this device."),
                    action: { label: t("souvenirs","Remove this copy"), run: function() { that.discardLocalCopy(); } },
                };
            }
            if (this.offlineNoticeVisible) {
                return {
                    id: "offline",
                    text: this.forcedOffline
                        ? t("souvenirs","Working offline: changes are kept on this device and sent when you go back online, with the offline button of the album list.")
                        : t("souvenirs","Offline: changes are kept on this device and sent when the connection is back."),
                    action: null,
                };
            }
            return null;
        },
        'conflictDomains': function() {
            var conflicts = this.sync.conflicts || {};
            var domains = [];
            if (conflicts.info) {
                domains.push({ id: "info", label: t("souvenirs","Album name and date") });
            }
            if (conflicts.pages) {
                domains.push({ id: "pages", label: t("souvenirs","Pages: added, removed or reordered") });
            }
            if (conflicts.content && conflicts.content.length > 0) {
                domains.push({ id: "content", label: n("souvenirs","Content of %n page","Content of %n pages", conflicts.content.length) });
            }
            return domains;
        },
        'conflictChoicesComplete': function() {
            return this.conflictDomains.every(domain => this.conflictChoices[domain.id] != null);
        },
        'aLeftVisible': function() {
            return (this.displayedPage != 0);
        },
        'aRightVisible': function() {
            return (this.displayedPage < (this.nbPage - 1));
        },
        "nbPage": function() {
            return this.pages.length;
        },
        "audioUrl": function() {
            if (this.pages.length > 0) {
                var audioElement = getAudioElement(this.pages[this.displayedPage]);
                if (audioElement != null) {
                    if (audioElement.audio != "") {
                        if (this.token != "") {
                            return this.token+'/asset?file=' + basename(audioElement.audio);
                        } else {
                            return 'asset?apath=' + this.path + '&file=' + basename(audioElement.audio);
                        }
                        
                    }
                }
            }
            return "";
        },
        "paintPage": function() {
            if (this.paintPageId == null) {
                return null;
            }
            return this.pages.find(p => p.id === this.paintPageId) || null;
        },
        "isStopCmd": function() {
            if (this.pages.length > 0) {
                var audioElement = getAudioElement(this.pages[this.displayedPage]);
                if (audioElement != null) {
                    return audioElement.stop;
                }
            }
            return false;
        },
        "removeAudioButtons": function() {
            // NcDialog buttons: a callback that does not return false closes
            // the dialog after running.
            var that = this;
            return [
                { label: t("souvenirs","Cancel") },
                { label: t("souvenirs","Remove"), variant: "error", callback: function() { that.confirmRemoveAudio(); } },
            ];
        },
    },
    methods: {
        showNext: function () {
            if (this.displayedPage >= (this.nbPage - 1)) {
                return;
            }
            this.displayedPage += 1;
            updateScrollWithPageDisplayed(document.querySelector(".s-album"),this.displayedPage,this.isWinPortrait);
        },
        diapoTick: function() {
            this.diap_timeout = setTimeout(() => {
                    if (this.displayedPage >= (this.nbPage - 1)) {
                        this.diaporamaMode = false;
                        return;
                    }
                    this.showNext();
                    this.diapoTick();
                }, this.diaporamaSpeed * 1000);
        },
        showPrev: function () {
            if (this.displayedPage == 0) {
                return;
            }
            this.displayedPage -= 1;
            updateScrollWithPageDisplayed(document.querySelector(".s-album"),this.displayedPage,this.isWinPortrait);
        },
        showN: function(index) {
            this.displayedPage = index;
            updateScrollWithPageDisplayed(document.querySelector(".s-album"),this.displayedPage,this.isWinPortrait);
        },
        openImgFull: function(imageUrl,isPhotosphere) {
            this.imageFullUrl = imageUrl;
            this.imageFullIsPhotosphere = isPhotosphere;
            this.imageFullOn = true;
        },
        openVideoFull: function(videoUrl) {
            this.videoFullUrl = videoUrl;
            this.videoFullOn = true;
        },
        closeImgFull: function() {
            this.imageFullOn = false;
        },
        closeVideoFull: function() {
            this.videoFullOn = false;
        },
        fullscreen: function() {
            this.fullscreenMode = true;
        },
        diaporama: function(start) {
            if (start == true) {
                this.diaporamaMode = true;
            } else {
                this.diaporamaMode = false;
            }
        },
        openDownloadModal: function() {
            this.downloadModal = true;
        },
        closeDownload: function() {
            this.downloadModal = false;
        },
        openHelp: function(section) {
            // The dialog lives in the document body: in fullscreen only the
            // album element is shown, so leave fullscreen to make it visible.
            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen();
            }
            this.helpSection = section || "structure";
            this.helpOpen = true;
        },
        closeHelp: function() {
            this.helpOpen = false;
            // Give the keyboard back to the album (arrows, Space, E).
            this.$nextTick(function() {
                var album = document.querySelector(".s-album");
                if (album) {
                    album.focus();
                }
            });
        },
        download: async function() {
            this.downloadProgress = 0;
            this.downloadActive = true;
            await this.$nextTick();

            //create zip instance
            var zip = new JSZip();
            //add album
            zip.file("album.json",this.albumJson);
            var data = zip.folder("data");
            //gen assets list
            var asset_list = [];
            for (let p = 0; p < this.pages.length; p++) {
                let page = this.pages[p];
                for (let e = 0; e < page.elements.length; e++) {
                    let element = page.elements[e];
                    if ("image" in element) {
                        asset_list.push(element.image);
                    }
                    if ("video" in element) {
                        asset_list.push(element.video);
                    }
                    if ("audio" in element) {
                        asset_list.push(element.audio);
                    }
                }
            }
            //download and add to zip
            for (let i = 0; i < asset_list.length; i++) {
                let asset = asset_list[i];
                if (this.token != "") {
                    const d = await getFile(this.token + '/asset?file=' + encodeURIComponent(basename(asset)));
                    if (d) data.file(basename(asset),d,{binary:true});
                } else {
                    // this.path is already percent-encoded (see the route query):
                    // encoding it again would double-encode the slashes.
                    const d = await getFile('asset' + '?apath=' + this.path + '&file=' + encodeURIComponent(basename(asset)));
                    if (d) data.file(basename(asset),d,{binary:true});
                }
                this.downloadProgress = 100 * i / asset_list.length;
                await this.$nextTick();
            }
            //download zip
            let zipName = this.sName;
            zip.generateAsync({type:"blob"}).then(function(content) {
                saveAs(content, zipName);
            });

            this.downloadActive = false;
            this.downloadModal = false;
        },
        refreshAlbum: function() {
            this.loading = true;
            var that = this;
            if (this.token != "") {
                fetch(this.token+"/album", {
                    headers: {
                        'requesttoken': OC.requestToken,
                    }
                    })
                .then(response => {
                    response.json().then(data => {
                        that.albumJson = JSON.stringify(data);
                        that.sName = data.name;
                        that.pages = data.pages || [];
                        that.loading = false;
                    })
                }).catch(error => {
                    console.log("Error in refresh album.");
                    that.loading = false;
                });
            } else {
                // Through the album's local copy (issue #22): from the server
                // when it answers - sending first what was edited offline -,
                // from this device otherwise.
                var path = this.path;
                try {
                    path = decodeURIComponent(this.path);
                } catch (decodeError) {
                }
                this.session = new AlbumSession({
                    path: path,
                    getPages: function() { return that.pages; },
                    onState: function(state) { that.onSessionState(state); },
                    onSyncWanted: function() { that.syncAlbum(); },
                });
                this.session.open().then(record => {
                    if (record == null) {
                        // unreachable server and no local copy; a missing
                        // album is, as before, an empty view
                        that.unavailable = !that.online;
                    } else {
                        that.applyRecord(record);
                    }
                    that.loading = false;
                }).catch(error => {
                    console.log("Error in refresh album.");
                    that.loading = false;
                });
            }
        },
        applyRecord: function(record) {
            // Show the album of a local copy (issue #22): at load, and after a
            // sync that brought changes from the server.
            this.albumJson = JSON.stringify({ ...record.info, pages: record.pages });
            this.sName = record.info.name;
            this.albumId = record.id;
            this.albumDavPath = record.path || "";
            this.pages = JSON.parse(JSON.stringify(record.pages || []));
            this.elementMargin = record.info.elementMargin ?? 0;
            if (this.displayedPage >= this.pages.length) {
                this.displayedPage = Math.max(0, this.pages.length - 1);
            }
        },
        onSessionState: function(state) {
            this.sync = state;
            if (state.conflicts != null) {
                // read-only until the conflict is resolved
                this.editMode = false;
            }
        },
        remoteApi: function() {
            // Where edits are written (issue #22): through the album's local
            // copy when there is one - it sends them to the server, or keeps
            // them on this device while the server cannot be reached.
            return (this.session != null && this.session.record != null) ? this.session : directApi;
        },
        syncAlbum: function(choices) {
            // Reconcile the local copy with the server (issue #22): after a
            // reconnection, after edits kept locally, or with the user's
            // conflict choices. Runs like a structural action - after every
            // pending write, editor blocked - since it may replace pages.
            if (this.session == null || this.session.record == null || this.syncing) {
                return Promise.resolve();
            }
            var that = this;
            if (this.imageChooserSaving || this.paintSaving) {
                // media being added: their bytes are stored before the page
                // that uses them, a sync in between would drop them
                setTimeout(function() { that.syncAlbum(choices); }, 2000);
                return Promise.resolve();
            }
            this.syncing = true;
            var session = this.session;
            // kept so that an upload confirmed meanwhile can wait for the end
            // of the sync (see uploadNewAsset)
            this.syncPromise = this.runBlocking(async function() {
                var remote = await session.fetchRemote();
                if (remote == null || !session.needsSync(remote)) {
                    return null;
                }
                return session.reconcileWith(remote, choices || {});
            }).then(function(result) {
                if (result == null) {
                    return;
                }
                if (result.pulled) {
                    that.applyRecord(result.record);
                }
                if (result.record.conflicts != null) {
                    notifyConflict(that.sName);
                } else if (result.pushed) {
                    notifySynced(that.sName);
                }
            }).catch(function(error) {
                if (!isDeferrable(error)) {
                    showError(t("souvenirs","Could not synchronize the album."));
                }
            }).finally(function() {
                that.syncing = false;
                that.syncPromise = null;
            });
            return this.syncPromise;
        },
        onReconnected: function() {
            // The server is reachable again (issue #22).
            if (this.session != null && this.session.record != null) {
                return this.syncAlbum();
            }
            if (this.unavailable) {
                // the album could not be shown at all: load it now
                this.unavailable = false;
                this.refreshAlbum();
            }
        },
        resolveAllConflicts: function(side) {
            // "Keep everything from ..." shortcuts of the conflict banner.
            this.conflictChoices = { info: side, pages: side, content: side };
            return this.applyConflictChoices();
        },
        applyConflictChoices: function() {
            var choices = {};
            for (const domain of this.conflictDomains) {
                choices[domain.id] = this.conflictChoices[domain.id];
            }
            var that = this;
            return this.syncAlbum(choices).then(function() {
                that.conflictChoices = { info: null, pages: null, content: null };
            });
        },
        discardLocalCopy: function() {
            // The album is gone from the server (issue #22): drop its copy,
            // unsent changes included, and leave.
            var that = this;
            var session = this.session;
            var albumId = this.albumId;
            // nothing must store the copy again on the way out
            session.record = null;
            return forgetAlbum(albumId).catch(() => {}).then(function() {
                that.$router.push("/");
            });
        },
        goToLogin: function() {
            window.location.href = generateUrl("/login") + "?redirect_url="
                + encodeURIComponent(window.location.pathname + window.location.search);
        },
        backToList: function() {
            this.$router.push("/");
        },
        onVisibilityChange: function() {
            // A hidden tab may be discarded without notice (mobile): send or
            // store now what is still pending.
            if (document.visibilityState === "hidden" && this.session != null) {
                var session = this.session;
                this.saveQueue.flush().then(function() { session.flush(); });
            }
        },
        toggleEdit: function() {
            this.editMode = !this.editMode;
            if (!this.editMode) {
                // Finishing the edit session: persist what is still pending.
                this.saveQueue.flush();
            }
        },
        onSelectElement: function(elementId) {
            this.selectedElementId = elementId;
        },
        onAlbumClick: function(event) {
            // A click outside any editable tile deselects (issue #56); clicks
            // inside one are handled by the tile itself (it selects itself).
            if (this.selectedElementId == null) {
                return;
            }
            var target = event.target;
            if (target && target.closest && target.closest(".s-element--draggable")) {
                return;
            }
            this.selectedElementId = null;
        },
        onKeydown: function(event) {
            // Navigation/slideshow shortcuts don't apply while typing in a
            // caption or a form field (e.g. the slideshow speed input).
            var el = event.target;
            if (el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
                return;
            }
            switch (event.key) {
                case "ArrowLeft":
                case "ArrowUp":
                    event.preventDefault();
                    this.showPrev();
                    break;
                case "ArrowRight":
                case "ArrowDown":
                    event.preventDefault();
                    this.showNext();
                    break;
                case " ":
                    event.preventDefault();
                    this.diaporama(!this.diaporamaMode);
                    break;
                case "?":
                    event.preventDefault();
                    this.openHelp("shortcuts");
                    break;
            }
        },
        onEditKey: function(event) {
            // "e" toggles edit mode, but not while typing in a caption (or with a
            // modifier, e.g. Ctrl+E), and only where editing is allowed.
            if (event.ctrlKey || event.metaKey || event.altKey) {
                return;
            }
            var el = event.target;
            if (el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
                return;
            }
            if (this.canEdit) {
                this.toggleEdit();
            }
        },
        blockWhile: function(promise) {
            // Block the UI (saving overlay) until the given edit action -
            // possibly a chain of several API calls - settles.
            var that = this;
            this.savingCount++;
            return promise.finally(function() { that.savingCount--; });
        },
        runSave: function(task, options) {
            // Run an album write after every pending one (debounced page saves
            // included), never concurrently with another (issue #50).
            // `options.idempotent`: the write can safely be repeated on a
            // gateway or network error (see saveQueue).
            this.saveQueue.flush();
            return this.saveQueue.run(task, options);
        },
        runBlocking: function(task, options) {
            // Same, behind the saving overlay: for structural actions whose
            // local result is only applied once the server accepted them.
            return this.blockWhile(this.runSave(task, options));
        },
        queuePageSave: function(pageId) {
            // Background, debounced save of one page (issue #50): a burst of
            // edits (typing, resizing, zooming) becomes one request, which
            // sends the page as it is when the request starts.
            var that = this;
            this.saveQueue.schedule("page:" + pageId, function() {
                var page = that.pages.find(p => p.id === pageId);
                return (page == null) ? Promise.resolve() : that.remoteApi().updatePage(that.albumId, page);
            });
        },
        onSaveError: function(error) {
            // A background save failed for good (retries exhausted): the
            // edit stays on screen but may not be on the server. One toast
            // per burst of failures.
            console.log("Error saving album edit.", error);
            var now = Date.now();
            if (now - this.lastSaveErrorAt > 5000) {
                this.lastSaveErrorAt = now;
                showError(t("souvenirs","Could not save your last changes. Reload the album to check what was saved."));
            }
        },
        onBeforeUnload: function(event) {
            // Closing or reloading the tab with writes still pending: send
            // them and ask the browser to confirm leaving.
            if (this.saveQueue == null || this.saveQueue.pending === 0) {
                if (this.session != null) {
                    // nothing left to send: store the local copy (issue #22)
                    this.session.flush();
                }
                return;
            }
            var session = this.session;
            if (session != null) {
                this.saveQueue.idle().then(function() { session.flush(); });
            }
            this.saveQueue.flush();
            event.preventDefault();
            event.returnValue = "";
        },
        scheduleClean: function() {
            // Background, debounced GC of unreferenced assets (issue #50): one
            // cleanAssets call after a series of removals, outside the
            // blocking chains, and never while media are being added (the
            // server also keeps recent files, see Album::cleanAssets).
            var that = this;
            if (this.cleanTimer) {
                clearTimeout(this.cleanTimer);
            }
            this.cleanTimer = setTimeout(function() {
                that.cleanTimer = null;
                if (that.imageChooserSaving || that.paintSaving) {
                    that.scheduleClean();
                    return;
                }
                that.runSave(function() { return that.remoteApi().cleanAssets(that.albumId); }, { idempotent: true }).catch(() => {});
            }, 5000);
        },
        onEditText: function(pageId, elementId, newText) {
            // Locate the page, patch only the changed caption (preserving every
            // other album/page/element field), then persist that page.
            var index = this.pages.findIndex(p => p.id === pageId);
            if (index < 0) {
                return;
            }
            var updatedPage = setElementText(this.pages[index], elementId, newText);
            this.pages.splice(index, 1, updatedPage);
            this.queuePageSave(pageId);
        },
        onRemoveElement: function(pageId, elementId) {
            // Drop the element, re-grid the page so nothing overlaps, persist,
            // then best-effort GC the now-unreferenced asset on disk.
            var index = this.pages.findIndex(p => p.id === pageId);
            if (index < 0) {
                return;
            }
            var that = this;
            var updatedPage = removeElement(this.pages[index], elementId);
            // Removing the last visible element of a page deletes the page itself
            // (an invisible audio track alone must not keep a blank page alive) -
            // unless it is the only page left, which we keep so the album is not
            // left with no pages and no way to add one.
            if (!hasVisibleElements(updatedPage) && this.pages.length > 1) {
                this.saveQueue.cancel("page:" + pageId);
                return this.runBlocking(() => this.remoteApi().deletePage(this.albumId, pageId))
                    .then(() => {
                        var i = that.pages.findIndex(p => p.id === pageId);
                        if (i >= 0) {
                            that.pages.splice(i, 1);
                        }
                        if (that.displayedPage >= that.pages.length) {
                            that.displayedPage = that.pages.length - 1;
                        }
                        that.scheduleClean();
                    })
                    .catch(error => {
                        showError(t("souvenirs","Could not delete the page."));
                    });
            }
            this.pages.splice(index, 1, updatedPage);
            return this.runBlocking(() => this.remoteApi().updatePage(this.albumId, updatedPage), { idempotent: true })
                .then(() => {
                    that.scheduleClean();
                })
                .catch(error => {
                    showError(t("souvenirs","Could not remove the image."));
                });
        },
        onResizeElement: function(pageId, elementId, geometry) {
            // Patch only the resized element's geometry (preserving every other
            // album/page/element field), then persist that page.
            var index = this.pages.findIndex(p => p.id === pageId);
            if (index < 0) {
                return;
            }
            var updatedPage = setElementGeometry(this.pages[index], elementId, geometry);
            this.pages.splice(index, 1, updatedPage);
            this.queuePageSave(pageId);
        },
        onPanZoomElement: function(pageId, elementId, panZoom) {
            // Patch only the panned/zoomed element's values (preserving every
            // other album/page/element field), then persist that page.
            var index = this.pages.findIndex(p => p.id === pageId);
            if (index < 0) {
                return;
            }
            var updatedPage = setElementPanZoom(this.pages[index], elementId, panZoom);
            this.pages.splice(index, 1, updatedPage);
            this.queuePageSave(pageId);
        },
        onCycleLayout: function(pageId) {
            // Switch the page to the next layout available for its element count.
            var index = this.pages.findIndex(p => p.id === pageId);
            if (index < 0) {
                return;
            }
            var page = this.pages[index];
            var updatedPage = { ...page, elements: cycleLayout(page.elements) };
            this.pages.splice(index, 1, updatedPage);
            this.queuePageSave(pageId);
        },
        onMovePage: function(index, dir) {
            // Reorder a page one step left (dir -1) or right (dir +1), keeping the
            // view focused on the moved page. Optimistic local move, reverted on error.
            var newIndex = index + dir;
            if (newIndex < 0 || newIndex >= this.pages.length) {
                return;
            }
            var that = this;
            var page = this.pages[index];
            // Backend Album::movePage removes-then-reinserts, so the position to send
            // is index-1 (left) / index+2 (right), not the final index.
            var pos = (dir < 0) ? (index - 1) : (index + 2);
            this.pages.splice(index, 1);
            this.pages.splice(newIndex, 0, page);
            this.$nextTick(() => { that.showN(newIndex); });
            return this.runBlocking(() => this.remoteApi().movePage(this.albumId, page.id, pos)).catch(error => {
                // Revert the optimistic move.
                that.pages.splice(newIndex, 1);
                that.pages.splice(index, 0, page);
                that.$nextTick(() => { that.showN(index); });
                showError(t("souvenirs","Could not move the page."));
            });
        },
        onElementDrop: function(srcPageId, srcElementId, destPageId, destElementId) {
            if (srcPageId === destPageId) {
                // Same page: swap the two elements' positions. Dropping on the
                // page background or on itself is a no-op.
                if (destElementId == null || destElementId === srcElementId) {
                    return;
                }
                var index = this.pages.findIndex(p => p.id === destPageId);
                if (index < 0) {
                    return;
                }
                var updatedPage = swapElements(this.pages[index], srcElementId, destElementId);
                this.pages.splice(index, 1, updatedPage);
                this.queuePageSave(destPageId);
                return;
            }
            // Other page: move the element there, with the same re-layout logic
            // as adding a new element (issue #18).
            var srcIndex = this.pages.findIndex(p => p.id === srcPageId);
            var destIndex = this.pages.findIndex(p => p.id === destPageId);
            if (srcIndex < 0 || destIndex < 0) {
                return;
            }
            var element = (this.pages[srcIndex].elements || []).find(e => e.id === srcElementId);
            if (element == null) {
                return;
            }
            var that = this;
            var updatedDest = addElement(this.pages[destIndex], element);
            var updatedSrc = removeElement(this.pages[srcIndex], srcElementId);
            // Moving the last visible element away deletes the emptied page
            // (same rule as onRemoveElement), unless it is the only page left.
            var deleteSrc = !hasVisibleElements(updatedSrc) && this.pages.length > 1;
            // One atomic request for both pages (issue #50): the element can
            // no longer end up on both pages, nor on none.
            var operations = [
                { op: "update", page: updatedDest },
                deleteSrc ? { op: "delete", id: srcPageId } : { op: "update", page: updatedSrc },
            ];
            if (deleteSrc) {
                this.saveQueue.cancel("page:" + srcPageId);
            }
            return this.runBlocking(() => this.remoteApi().pageOperations(this.albumId, operations))
                .then(() => {
                    var d = that.pages.findIndex(p => p.id === destPageId);
                    if (d >= 0) {
                        that.pages.splice(d, 1, updatedDest);
                    }
                    var i = that.pages.findIndex(p => p.id === srcPageId);
                    if (deleteSrc) {
                        if (i >= 0) {
                            that.pages.splice(i, 1);
                        }
                        if (that.displayedPage >= that.pages.length) {
                            that.displayedPage = that.pages.length - 1;
                        }
                        // The deleted page's assets (e.g. its audio track).
                        that.scheduleClean();
                    } else if (i >= 0) {
                        that.pages.splice(i, 1, updatedSrc);
                    }
                })
                .catch(error => {
                    showError(t("souvenirs","Could not move the element."));
                });
        },
        onAlbumDragOver: function(event) {
            // Dragging an element near the album edge turns the page, so the
            // element can be dropped on a page that is not currently visible.
            if (!this.editMode || !isElementDrag(event)) {
                return;
            }
            var now = Date.now();
            if (now - this.dragNavLast < 800) {
                return;
            }
            var rect = document.querySelector(".s-album").getBoundingClientRect();
            var zone = 80;
            var toStart = this.isWinPortrait ? (event.clientY - rect.top) : (event.clientX - rect.left);
            var toEnd = this.isWinPortrait ? (rect.bottom - event.clientY) : (rect.right - event.clientX);
            if (toStart < zone) {
                this.dragNavLast = now;
                this.showPrev();
            } else if (toEnd < zone) {
                this.dragNavLast = now;
                this.showNext();
            }
        },
        onAddFirstPage: function() {
            // Bootstrap an empty album: enter edit mode and create the first page.
            this.editMode = true;
            this.onAddPage(0);
        },
        onAddPage: function(pos) {
            // Create a new empty page at `pos`, insert it locally, and navigate to it.
            var that = this;
            var page = buildPage();
            return this.runBlocking(() => this.remoteApi().createPage(this.albumId, pos, page)).then(() => {
                that.pages.splice(pos, 0, page);
                that.$nextTick(() => { that.showN(pos); });
            }).catch(error => {
                showError(t("souvenirs","Could not create the page."));
            });
        },
        onAddText: function(pageId) {
            // Add a new empty text element and re-lay-out the page, then persist.
            var index = this.pages.findIndex(p => p.id === pageId);
            if (index < 0) {
                return;
            }
            var updatedPage = addElement(this.pages[index], buildTextElement());
            this.pages.splice(index, 1, updatedPage);
            this.queuePageSave(pageId);
        },
        onPaint: function(pageId) {
            this.paintSaving = false;
            this.paintPageId = pageId;
        },
        closePaint: function() {
            // Ignore the dialog's close while a confirmed drawing is being saved.
            if (!this.paintSaving) {
                this.paintPageId = null;
            }
        },
        onPaintConfirm: async function(blob) {
            var index = this.pages.findIndex(p => p.id === this.paintPageId);
            if (index < 0 || this.paintSaving) {
                return;
            }
            var page = this.pages[index];
            // A fully transparent drawing (blob == null) means no overlay: drop
            // the page's paint element(s) instead of saving an empty PNG.
            if (blob == null) {
                if (getPaintElement(page) == null) {
                    this.paintPageId = null;
                    return;
                }
                var cleared = removePaintElements(page);
                this.paintSaving = true;
                try {
                    await this.runSave(() => this.remoteApi().updatePage(this.albumId, cleared), { idempotent: true });
                } catch (error) {
                    this.paintSaving = false;
                    showError(t("souvenirs","Could not save the drawing."));
                    return;
                }
                this.pages.splice(index, 1, cleared);
                this.paintSaving = false;
                this.paintPageId = null;
                // Best-effort GC of the removed drawing's PNG.
                this.scheduleClean();
                return;
            }
            // A page holds 0 or 1 paint element (as in the Android app): an
            // existing one keeps its id and asset path (the PNG is overwritten
            // in place, only `size` changes), exceeding ones are dropped; a
            // fresh one is appended when the page had none.
            var updatedPage = setPagePaintElement(page, blob.size);
            var element = getPaintElement(updatedPage);
            this.paintSaving = true;
            try {
                // Upload before persisting the page, so a failed upload never
                // leaves an element pointing at a missing asset.
                await this.uploadNewAsset(element.image, blob);
                await this.runSave(() => this.remoteApi().updatePage(this.albumId, updatedPage), { idempotent: true });
            } catch (error) {
                // Keep the dialog open so the drawing is not lost.
                this.paintSaving = false;
                showError(t("souvenirs","Could not save the drawing."));
                return;
            }
            this.pages.splice(index, 1, updatedPage);
            this.paintSaving = false;
            this.paintPageId = null;
            // Best-effort GC of assets orphaned by dropped paint elements.
            this.scheduleClean();
        },
        onAddImage: function(pageId) {
            this.imageChooserSaving = false;
            this.imageChooserPageId = pageId;
        },
        onRemoveAudio: function(pageId) {
            // Open the confirmation dialog; the actual removal happens in
            // confirmRemoveAudio (the dialog's Remove button).
            this.audioRemovePageId = pageId;
        },
        onRemoveAudioDialogOpen: function(open) {
            // Fired when the dialog closes (X, Esc, outside click, or after a
            // button callback ran).
            if (!open) {
                this.audioRemovePageId = null;
            }
        },
        confirmRemoveAudio: function() {
            var pageId = this.audioRemovePageId;
            this.audioRemovePageId = null;
            var index = this.pages.findIndex(p => p.id === pageId);
            if (index < 0) {
                return;
            }
            var that = this;
            // No re-layout: audio takes no layout slot, so the visible
            // elements' geometry must survive the removal.
            var updatedPage = removeAudioElements(this.pages[index]);
            this.pages.splice(index, 1, updatedPage);
            return this.runBlocking(() => this.remoteApi().updatePage(this.albumId, updatedPage), { idempotent: true })
                .then(() => {
                    // The player deliberately keeps playing when its URL goes
                    // away; a removed track must actually stop.
                    that.audioForceStop = true;
                    // Best-effort GC of the now-unreferenced audio asset.
                    that.scheduleClean();
                })
                .catch(error => {
                    showError(t("souvenirs","Could not remove the audio."));
                });
        },
        closeImageChooser: function() {
            // Ignore the dialog's close while a chosen image is being saved.
            if (!this.imageChooserSaving) {
                this.imageChooserPageId = null;
            }
        },
        onImagePick: function(entries) {
            // The chooser emits the picked media as an array, in selection
            // order (issue #36).
            return this.addPickedMedia(entries);
        },
        onImageUpload: function(files) {
            return this.addUploadedMedia(files);
        },
        chooserTargetIndex: function(items) {
            // Index of the page the chooser was opened from, or -1 when there
            // is nothing to do (no page, already saving, empty selection).
            var targetIndex = this.pages.findIndex(p => p.id === this.imageChooserPageId);
            if (targetIndex < 0 || this.imageChooserSaving || items.length === 0) {
                return -1;
            }
            return targetIndex;
        },
        linkErrorString: function(isVideo, isAudio) {
            return isVideo
                ? t("souvenirs","Could not link the selected video. It must be located outside the Souvenirs albums folder.")
                : isAudio
                    ? t("souvenirs","Could not link the selected audio. It must be located outside the Souvenirs albums folder.")
                    : t("souvenirs","Could not link the selected image. It must be located outside the Souvenirs albums folder.");
        },
        addPickedMedia: async function(entries) {
            // Link picked Nextcloud files into the album (no copy/upload), then
            // put them on pages. Issue #50: every file is linked in ONE request
            // (the server is told where each file is, so it does not search the
            // user's files), and every page change is saved in ONE more,
            // instead of two requests per medium. As before, the first failure
            // stops the batch with an error toast and keeps the chooser open;
            // the media before it are added.
            var targetIndex = this.chooserTargetIndex(entries);
            if (targetIndex < 0) {
                return;
            }
            this.imageChooserSaving = true;
            var picked = [];
            var failed = false;
            for (const entry of entries) {
                if (!entry.size) {
                    showError(t("souvenirs","Could not read the selected file."));
                    failed = true;
                    break;
                }
                const file = { name: entry.basename, size: entry.size, mime: entry.mime };
                const isVideo = VIDEO_MIMES.includes(entry.mime);
                const isAudio = AUDIO_MIMES.includes(entry.mime);
                // Build the element first so we know the in-album asset path to link.
                const element = isVideo ? buildVideoElement(file)
                    : isAudio ? buildAudioElement(file)
                    : buildImageElement(file);
                const asset = isVideo ? element.video : (isAudio ? element.audio : element.image);
                picked.push({ entry, element, isVideo, isAudio, asset });
            }
            var elements = [];
            if (picked.length > 0) {
                var statuses;
                try {
                    statuses = await searchAssets(this.albumId, picked.map(p => ({
                        asset: p.asset, name: p.entry.basename, size: p.entry.size, source: p.entry.path,
                    })));
                } catch (error) {
                    this.imageChooserSaving = false;
                    showError(this.mediaErrorString(picked[0].element));
                    return;
                }
                for (let i = 0; i < picked.length; i++) {
                    if (statuses[i] !== "found") {
                        showError(this.linkErrorString(picked[i].isVideo, picked[i].isAudio));
                        failed = true;
                        break;
                    }
                    var element = picked[i].element;
                    if (picked[i].isVideo) {
                        element = await this.pickedVideoPoster(element, picked[i].entry);
                    }
                    elements.push(element);
                }
            }
            await this.insertMediaElements(targetIndex, elements, !failed);
        },
        addUploadedMedia: async function(files) {
            // Upload local files as new album assets, then put them on pages
            // with ONE save (issue #50). Stops at the first failed upload
            // (error toast, chooser kept open); the media before it are added.
            var targetIndex = this.chooserTargetIndex(files);
            if (targetIndex < 0) {
                return;
            }
            this.imageChooserSaving = true;
            var elements = [];
            for (const file of files) {
                var element = await this.prepareFileElement(file);
                if (element == null) {
                    break;
                }
                elements.push(element);
            }
            await this.insertMediaElements(targetIndex, elements, elements.length === files.length);
        },
        insertMediaElements: async function(targetIndex, elements, complete) {
            // Place the prepared elements (see planMediaInsertion) and save
            // every touched page in one request. `complete`: the whole
            // selection made it, so the chooser can close.
            var that = this;
            if (elements.length > 0) {
                var plan = planMediaInsertion(this.pages, targetIndex, elements);
                try {
                    await this.runSave(() => this.remoteApi().pageOperations(this.albumId, plan.operations));
                } catch (error) {
                    this.imageChooserSaving = false;
                    showError(this.mediaErrorString(elements[0]));
                    // GC the links/uploads of the never-persisted elements.
                    this.scheduleClean();
                    return;
                }
                applyPageOperationsLocally(this.pages, plan.operations);
                if (plan.audioReplaced) {
                    // Replaced tracks leave their old audio asset orphaned.
                    this.scheduleClean();
                }
            }
            this.imageChooserSaving = false;
            if (!complete) {
                // Keep the dialog open so the user can retry or pick something
                // else; GC whatever landed for the failed medium.
                this.scheduleClean();
                return;
            }
            this.imageChooserPageId = null;
            if (elements.length > 0 && plan.visualCount > 1) {
                // Land on the last created page so the whole batch is visible.
                this.$nextTick(() => { that.showN(targetIndex + plan.visualCount - 1); });
            }
        },
        pickedVideoPoster: async function(element, entry) {
            // Poster of a video already on the server (issue #50), cheapest
            // first: the server's own preview of it when a video preview
            // provider is enabled, else a frame captured while streaming the
            // video (range requests: never the whole file). Best-effort: no
            // poster just means none, the element stays usable.
            var preview = null;
            try {
                preview = await getFilePreviewBlob(entry.fileid);
            } catch (previewError) {
            }
            if (preview != null) {
                return this.uploadVideoPoster(element, preview);
            }
            return this.attachVideoPoster(element, getFileUrl(entry.path));
        },
        uploadNewAsset: async function(asset, blob) {
            // Upload the bytes of a new album asset over native WebDAV (same
            // flow as the Android app). The album folder is known since the
            // album was loaded (issue #50), so no assetprobe round trip: one
            // PUT, whose success means the file landed. The probe remains the
            // fallback should the path be unknown.
            if (this.session != null && this.session.record != null) {
                // Through the local copy (issue #22): on the server, or kept
                // on this device until the next sync when it is unreachable.
                // Not in the middle of a sync, though: the chooser and paint
                // dialogs sit above its overlay, and bytes stored while it
                // runs would be taken for unused and dropped.
                if (this.syncPromise != null) {
                    await this.syncPromise;
                }
                return this.session.uploadNewAsset(asset, blob);
            }
            var davPath = this.albumDavPath ? (this.albumDavPath + "/" + asset) : null;
            if (davPath == null) {
                var probe = await probeAsset(this.albumId, asset);
                if (probe == null || !probe.path) {
                    throw new Error("assetprobe returned no upload path");
                }
                davPath = probe.path;
            }
            await uploadAsset(davPath, blob);
        },
        prepareFileElement: async function(file) {
            // Upload a local file as a new album asset and return the element
            // referencing it, or null after showing an error toast. Same flow
            // as the paint dialog (and the Android app): the bytes go up over
            // native WebDAV before any page starts referencing them.
            const isVideo = VIDEO_MIMES.includes(file.type);
            const isAudio = AUDIO_MIMES.includes(file.type);
            const picked = { name: file.name, size: file.size, mime: file.type };
            var element = isVideo ? buildVideoElement(picked)
                : isAudio ? buildAudioElement(picked)
                : buildImageElement(picked);
            const asset = isVideo ? element.video : (isAudio ? element.audio : element.image);
            try {
                await this.uploadNewAsset(asset, file);
                if (isVideo) {
                    // the poster is captured from the local file: no download
                    element = await this.attachVideoPoster(element, file);
                }
                return element;
            } catch (error) {
                // GC any bytes that landed before the failure (the element was
                // never persisted).
                showError(isVideo
                    ? t("souvenirs","Could not upload the video.")
                    : isAudio
                        ? t("souvenirs","Could not upload the audio.")
                        : t("souvenirs","Could not upload the image."));
                this.scheduleClean();
                return null;
            }
        },
        mediaErrorString: function(element) {
            return element.class === "VideoElement"
                ? t("souvenirs","Could not add the video.")
                : element.class === "AudioElement"
                    ? t("souvenirs","Could not add the audio.")
                    : t("souvenirs","Could not add the image.");
        },
        attachVideoPoster: async function(element, videoSource) {
            // Capture a poster frame of the video (local bytes or the URL of a
            // video on the server) and upload it as the element's `image`
            // asset (the Android app stores a generated thumbnail there too).
            // Best-effort: any failure - undecodable codec, upload error -
            // returns the element without a poster, which every consumer
            // (web and Android) tolerates.
            var poster = await captureVideoPoster(videoSource);
            if (poster == null) {
                return { ...element, image: '' };
            }
            return this.uploadVideoPoster(element, poster);
        },
        uploadVideoPoster: async function(element, poster) {
            // Upload a poster image as the element's `image` asset; on failure
            // the element simply has no poster.
            try {
                await this.uploadNewAsset(element.image, poster);
                return element;
            } catch (error) {
                return { ...element, image: '' };
            }
        },
        resizeEventHandler: function(e) {
            if (window.innerHeight > window.innerWidth) {
                if (!this.isWinPortrait) {
                    this.isWinPortrait = true;
                }
            } else {
                if (this.isWinPortrait) {
                    this.isWinPortrait = false;
                }
            }
        },
        updatePageDisplayed: function(e) {
            this.displayedPage = getFirstPageDisplayed(document.querySelector(".s-album"),this.isWinPortrait);
        }
    },
    components: {
        page: Page,
        Imagefull: Imagefull,
        Videofull: Videofull,
        AudioPlayer: AudioPlayer,
        "paint-dialog": PaintDialog,
        "image-chooser-dialog": ImageChooserDialog,
        "help-dialog": HelpDialog,
        NcModal,
        NcDialog,
        NcProgressBar,
        NcActions,
        NcActionButton,
        NcActionInput,
        NcActionSeparator,
        NcLoadingIcon,
        NcButton,
        Plus,
        Pencil,
        PencilOff,
        HelpCircleOutline,
        CloudOffOutline,
    },
}

function basename(path) {
   return path.split('/').reverse()[0];
}
function getFile(url) {
    return new Promise(function(result) {
        const request = new XMLHttpRequest();
        request.open('GET', url);
        request.responseType = "arraybuffer";
        request.onload = function (oEvent) {
            result(request.response); 
        };
        request.send(null);
    });
}
function isTouchDevice() {
  return (('ontouchstart' in window) ||
     (navigator.maxTouchPoints > 0) ||
     (navigator.msMaxTouchPoints > 0));
}
function getFirstPageDisplayed(el, isPortrait) {
    if (isPortrait) {
        return Math.ceil(el.scrollTop / el.clientWidth);
    } else {
        return Math.ceil(el.scrollLeft / el.clientHeight);
    }
    
}
function updateScrollWithPageDisplayed(el, dPage, isPortrait) {
    if (isPortrait) {
        let top_offset = el.clientWidth * dPage - ((el.clientHeight - el.clientWidth) / 2);
        el.scrollTo({
            top: top_offset,
            left: 0,
            behavior: 'smooth'
        });
    } else {
        let left_offset = el.clientHeight * dPage - ((el.clientWidth - el.clientHeight) / 2);
        el.scrollTo({
            top: 0,
            left: left_offset,
            behavior: 'smooth'
        });
    }
}

</script>

<style scoped>
.progress-item {
    width: 20px;
    height: 20px;
    display: inline-block;
    margin: 2px;
}

.progress-item-portrait {
    width: 20px;
    height: 20px;
    display: flex;
    margin: 2px;
}

.progress-item-full {
    background-image: url("./img/circle_full.svg");
    background-size: cover;
    transition: background-image 500ms ease-in-out;
    opacity: 50%;
}

.progress-item-empty {
    background-image: url("./img/circle_empty.svg");
    background-size: cover;
    transition: background-image 500ms ease-in-out;
    opacity: 50%;
}

.progress {
    text-align: center;
    width: 100%;
    position: absolute;
    bottom: 20px;
    height: 20px;
    z-index: 9;
}

.progress-portrait {
    width: 20px;
    position: absolute;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 9;
}

.s-album {
    width: 100%;
    height: 100%;
    white-space: nowrap;
    overflow: scroll;
    background-color: white;
}

.s-album:fullscreen {
    background-color: black;
}

.downloadIcon {
    background-image: url("./img/download.svg");
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
    width: 50px;
    height: 50px;
}


.arrow-right {
    background-image: url("./img/left_arrow.svg");
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
	display: inline-block;
	position: fixed;
    top: 10%;
    transform: rotate(180deg);
	right: 20px;
	width: 100px;
	height: 80%;
    z-index: 9;
    opacity: 0.2;
}

.arrow-right:hover {
    background-color: #d2d2d2;
}

.arrow-left {
    background-image: url("./img/left_arrow.svg");
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
	display: inline-block;
	position: fixed;
	left: 20px;
	width: 100px;
	height: 80%;
    z-index: 9;
    opacity: 0.2;
    top: 50%;
    transform: translateY(-50%);
}

.arrow-left:hover {
    background-color: #d2d2d2;
}

.arrow-top {
    background-image: url("./img/left_arrow.svg");
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
	display: inline-block;
	position: fixed;
	left: 0;
	width: 100px;
	height: 80vmin;
    z-index: 9;
    opacity: 0.2;
    top: 0;
    transform: rotate(90deg) translateY(-90vmin) translateX(70px);
    transform-origin: top left;
}

.arrow-top:hover {
    background-color: #d2d2d2;
}

.arrow-bottom {
    background-image: url("./img/left_arrow.svg");
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
	display: inline-block;
	position: fixed;
	bottom: 0;
	width: 100px;
	height: 80vmin;
    z-index: 9;
    opacity: 0.2;
    right: 0;
    transform: rotate(-90deg) translateX(100%) translateX(20px) translateY(-10vmin);
    transform-origin: bottom right;
}

.arrow-bottom:hover {
    background-color: #d2d2d2;
}


.transparent {
    opacity: 50%;
}

.top-right {
    display: inline-block;
	position: absolute;
    right: 5px;
    top: 5px;
    /* Above every in-page control (element delete/drag handles are 8, page
       insert/move and progress are 9), so the menu stays reachable in edit mode. */
    z-index: 10;
}

.saving-indicator {
    display: inline-flex;
    vertical-align: middle;
    margin-right: 6px;
}

.sync-indicator {
    display: inline-flex;
    vertical-align: middle;
    margin-right: 6px;
    padding: 4px;
    border-radius: 50%;
    color: var(--color-main-text, #222);
    background-color: var(--color-main-background-translucent, rgba(255, 255, 255, 0.8));
}

.sync-indicator--synced {
    opacity: 0.6;
}

.sync-indicator--pending,
.sync-indicator--offline {
    color: var(--color-warning-text, #a37200);
}

.sync-indicator--conflict {
    color: var(--color-error-text, #c00);
}

.album-banner {
    position: fixed;
    /* below the row of the menu button, which sits in the top right corner */
    top: calc(var(--header-height, 50px) + 56px);
    left: 50%;
    transform: translateX(-50%);
    /* same level as the menu: above every in-page control */
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: min(90vw, 640px);
    padding: 8px 16px;
    border-radius: var(--border-radius-large, 10px);
    white-space: normal;
    color: var(--color-main-text, #222);
    background-color: var(--color-main-background, #fff);
    border: 1px solid var(--color-border-dark, #ccc);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.album-banner--offline,
.album-banner--auth,
.album-banner--gone {
    border-color: var(--color-warning, #e9a500);
}

.album-banner--conflict {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    border-color: var(--color-error, #e9322d);
}

.album-banner__title {
    font-weight: bold;
}

.conflict-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.conflict-row__label {
    flex: 1 1 auto;
}

.conflict-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}

.album-unavailable {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: min(90vw, 480px);
    white-space: normal;
    text-align: center;
    color: var(--color-main-text, #222);
}

.s-album.editing {
    /* Make it unmistakable that the album is in edit mode. */
    outline: 4px solid var(--color-primary-element, #0082c9);
    outline-offset: -4px;
}
 
.top-left {
    display: inline-block;
	position: absolute;
    left: 5px;
    top: 5px;
}

.center-page {
  position: fixed;
  top: 50%;
  left: 50%;
}

.saving-overlay {
  /* Blocks every pointer interaction while an edit call is in flight, simply
     by sitting on top of the whole page. */
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(102, 102, 102, 0.5);
  /* Above the Nextcloud header (z-index 2000), below NcModal dialogs
     (z-index 9998+). */
  z-index: 5000;
}

.empty-album {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 7;
}

p.center {
    text-align: center;    
}

div.center {
    margin: 0 auto;
}

@media (prefers-color-scheme: dark) {
    .s-album {
        background-color: black;
    }

}

</style>