<template>
	<div v-bind:class="['s-album', { 'editing': editMode }]" tabindex="0" v-on:keydown="onKeydown"
    v-on:keydown.e="onEditKey" v-on:dragover="onAlbumDragOver">
        <div class="top-right">
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
                <NcActionButton icon="icon-download" @click="openDownloadModal" :close-after-click="true">{{ sDownload }}</NcActionButton>
            </NcActions>
        </div>
	    <i v-bind:class="isWinPortrait ? 'arrow-top': 'arrow-left'" v-on:click="showPrev"  v-if="!isTouchDevice"
            v-bind:style="{ visibility: aLeftVisible ? 'visible' : 'hidden', }"></i>
        <page v-for="(page, index) in pages" v-bind:s-num="index" v-bind:s-id="page.id" v-bind:displayed-page="displayedPage" v-bind:key="page.id"
            v-bind:elements="page.elements" v-bind:album-path="path" v-bind:is-win-portrait="isWinPortrait"
            v-bind:token="token" v-on:imagefull="openImgFull" v-on:videofull="openVideoFull" v-bind:element-margin="elementMargin"
            v-bind:edit-mode="editMode" v-on:edit-text="onEditText"
            v-bind:is-last="index === pages.length - 1"
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
        <image-chooser-dialog v-if="imageChooserPageId != null" :saving="imageChooserSaving"
            v-on:close="closeImageChooser" v-on:pick="onImagePick" v-on:upload="onImageUpload">
        </image-chooser-dialog>
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
import { setElementText, setElementGeometry, setElementPanZoom, removeElement, buildImageElement, buildVideoElement, buildAudioElement, buildTextElement, buildPage, addElement, swapElements, getPaintElement, setPagePaintElement, removePaintElements, getAudioElement, setPageAudioElement, removeAudioElements, hasVisibleElements } from '../utils/albumEdit.js'
import { isElementDrag } from '../utils/elementDrag.js'
import { captureVideoPoster } from '../utils/videoPoster.js'
import { getFileBlob, VIDEO_MIMES, AUDIO_MIMES } from '../api/davApi.js'
import { cycleLayout } from '../utils/tilePageLayout.js'
import { updatePage, searchAsset, cleanAssets, createPage, deletePage, movePage, probeAsset, uploadAsset } from '../api/albumApi.js'
import PaintDialog from './PaintDialog.vue'
import ImageChooserDialog from './ImageChooserDialog.vue'
import { showError } from '@nextcloud/dialogs'
import '@nextcloud/dialogs/style.css'
import Pencil from 'vue-material-design-icons/Pencil.vue'
import PencilOff from 'vue-material-design-icons/PencilOff.vue'

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
            // Number of in-flight edit actions (issue #39): while > 0, a
            // full-page overlay blocks any further modification. A counter,
            // not a boolean, so overlapping actions compose.
            "savingCount": 0,
        }
    },
    created: function() {
        window.addEventListener("resize", this.resizeEventHandler);
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
        }
    },
    computed: {
        'canEdit': function() {
            // Editing is only available in the authenticated (non-public) view.
            return (this.token == "");
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
                fetch("apiv2/album/unknown/full?apath="+this.path, {
                    headers: {
                        'requesttoken': OC.requestToken,
                    }
                    })
                .then(response => {
                    response.json().then(data => {
                        that.albumJson = JSON.stringify(data);
                        that.sName = data.name;
                        that.albumId = data.id;
                        that.pages = data.pages || [];
                        that.elementMargin = data.elementMargin ??= 0;
                        that.loading = false;
                    })
                }).catch(error => {
                    console.log("Error in refresh album.");
                    that.loading = false;
                });
            }
        },
        toggleEdit: function() {
            this.editMode = !this.editMode;
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
        onEditText: function(pageId, elementId, newText) {
            // Locate the page, patch only the changed caption (preserving every
            // other album/page/element field), then persist that page.
            var index = this.pages.findIndex(p => p.id === pageId);
            if (index < 0) {
                return;
            }
            var updatedPage = setElementText(this.pages[index], elementId, newText);
            this.pages.splice(index, 1, updatedPage);
            this.blockWhile(updatePage(this.albumId, updatedPage).catch(error => {
                console.log("Error saving album page edit.");
            }));
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
                this.blockWhile(deletePage(this.albumId, pageId)
                    .then(() => {
                        that.pages.splice(index, 1);
                        if (that.displayedPage >= that.pages.length) {
                            that.displayedPage = that.pages.length - 1;
                        }
                        return cleanAssets(that.albumId).catch(() => {});
                    })
                    .catch(error => {
                        showError(t("souvenirs","Could not delete the page."));
                    }));
                return;
            }
            this.pages.splice(index, 1, updatedPage);
            this.blockWhile(updatePage(this.albumId, updatedPage)
                .then(() => {
                    return cleanAssets(this.albumId).catch(() => {});
                })
                .catch(error => {
                    showError(t("souvenirs","Could not remove the image."));
                }));
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
            this.blockWhile(updatePage(this.albumId, updatedPage).catch(error => {
                showError(t("souvenirs","Could not resize the element."));
            }));
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
            this.blockWhile(updatePage(this.albumId, updatedPage).catch(error => {
                showError(t("souvenirs","Could not adjust the image."));
            }));
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
            this.blockWhile(updatePage(this.albumId, updatedPage).catch(error => {
                showError(t("souvenirs","Could not change the layout."));
            }));
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
            this.blockWhile(movePage(this.albumId, page.id, pos).catch(error => {
                // Revert the optimistic move.
                that.pages.splice(newIndex, 1);
                that.pages.splice(index, 0, page);
                that.$nextTick(() => { that.showN(index); });
                showError(t("souvenirs","Could not move the page."));
            }));
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
                this.blockWhile(updatePage(this.albumId, updatedPage).catch(error => {
                    showError(t("souvenirs","Could not move the element."));
                }));
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
            this.pages.splice(destIndex, 1, updatedDest);
            // Persist the destination first: if the source update then fails,
            // the element at worst exists on both pages instead of being lost.
            this.blockWhile(updatePage(this.albumId, updatedDest)
                .then(() => {
                    // Moving the last visible element away deletes the emptied
                    // page (same rule as onRemoveElement), unless it is the
                    // only page left.
                    if (!hasVisibleElements(updatedSrc) && that.pages.length > 1) {
                        return deletePage(that.albumId, srcPageId).then(() => {
                            var i = that.pages.findIndex(p => p.id === srcPageId);
                            if (i >= 0) {
                                that.pages.splice(i, 1);
                            }
                            if (that.displayedPage >= that.pages.length) {
                                that.displayedPage = that.pages.length - 1;
                            }
                            // Best-effort GC of the deleted page's assets
                            // (e.g. its audio track).
                            return cleanAssets(that.albumId).catch(() => {});
                        });
                    }
                    var i = that.pages.findIndex(p => p.id === srcPageId);
                    if (i >= 0) {
                        that.pages.splice(i, 1, updatedSrc);
                    }
                    return updatePage(that.albumId, updatedSrc);
                })
                .catch(error => {
                    showError(t("souvenirs","Could not move the element."));
                }));
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
            this.blockWhile(createPage(this.albumId, pos, page).then(() => {
                that.pages.splice(pos, 0, page);
                that.$nextTick(() => { that.showN(pos); });
            }).catch(error => {
                showError(t("souvenirs","Could not create the page."));
            }));
        },
        onAddText: function(pageId) {
            // Add a new empty text element and re-lay-out the page, then persist.
            var index = this.pages.findIndex(p => p.id === pageId);
            if (index < 0) {
                return;
            }
            var updatedPage = addElement(this.pages[index], buildTextElement());
            this.pages.splice(index, 1, updatedPage);
            this.blockWhile(updatePage(this.albumId, updatedPage).catch(error => {
                showError(t("souvenirs","Could not add the text."));
            }));
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
                    await updatePage(this.albumId, cleared);
                } catch (error) {
                    this.paintSaving = false;
                    showError(t("souvenirs","Could not save the drawing."));
                    return;
                }
                this.pages.splice(index, 1, cleared);
                this.paintSaving = false;
                this.paintPageId = null;
                // Best-effort GC of the removed drawing's PNG.
                cleanAssets(this.albumId).catch(() => {});
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
                // The probe returns where the asset lives under the user's files
                // root; the bytes then go up over native WebDAV (same flow as the
                // Android app). Upload before persisting the page, so a failed
                // upload never leaves an element pointing at a missing asset.
                var probe = await probeAsset(this.albumId, element.image);
                if (probe == null || !probe.path) {
                    throw new Error("assetprobe returned no upload path");
                }
                await uploadAsset(probe.path, blob);
                // The server must confirm the PNG actually landed in the album
                // before the page starts referencing it.
                var check = await probeAsset(this.albumId, element.image);
                if (check == null || check.status !== "ok") {
                    throw new Error("uploaded asset not found in the album");
                }
                await updatePage(this.albumId, updatedPage);
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
            cleanAssets(this.albumId).catch(() => {});
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
            this.blockWhile(updatePage(this.albumId, updatedPage)
                .then(() => {
                    // The player deliberately keeps playing when its URL goes
                    // away; a removed track must actually stop.
                    that.audioForceStop = true;
                    // Best-effort GC of the now-unreferenced audio asset.
                    return cleanAssets(that.albumId).catch(() => {});
                })
                .catch(error => {
                    showError(t("souvenirs","Could not remove the audio."));
                }));
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
            return this.addMediaItems(entries, this.prepareEntryElement);
        },
        onImageUpload: function(files) {
            return this.addMediaItems(files, this.prepareFileElement);
        },
        prepareEntryElement: async function(entry) {
            // Link a picked Nextcloud file into the album (no copy/upload) and
            // return the element referencing it, or null after showing an
            // error toast (the caller then keeps the chooser open). Videos get
            // their poster captured too (issue #32), best-effort.
            const file = { name: entry.basename, size: entry.size, mime: entry.mime };
            if (!file.size) {
                showError(t("souvenirs","Could not read the selected file."));
                return null;
            }
            const isVideo = VIDEO_MIMES.includes(entry.mime);
            const isAudio = AUDIO_MIMES.includes(entry.mime);
            // Build the element first so we know the in-album asset path to link,
            // then ask the backend to link the picked file to it.
            var element = isVideo ? buildVideoElement(file)
                : isAudio ? buildAudioElement(file)
                : buildImageElement(file);
            try {
                var res = await searchAsset(this.albumId, isVideo ? element.video : (isAudio ? element.audio : element.image), file.name, file.size);
                if (res == null || res.status !== "found") {
                    showError(isVideo
                        ? t("souvenirs","Could not link the selected video. It must be located outside the Souvenirs albums folder.")
                        : isAudio
                            ? t("souvenirs","Could not link the selected audio. It must be located outside the Souvenirs albums folder.")
                            : t("souvenirs","Could not link the selected image. It must be located outside the Souvenirs albums folder."));
                    return null;
                }
                if (isVideo) {
                    // The poster capture pulls the video bytes once over WebDAV;
                    // no bytes just means no poster, the element stays usable.
                    var blob = null;
                    try {
                        blob = await getFileBlob(entry.path);
                    } catch (fetchError) {
                    }
                    element = (blob != null)
                        ? await this.attachVideoPoster(element, blob)
                        : { ...element, image: '' };
                }
                return element;
            } catch (error) {
                showError(this.mediaErrorString(element));
                // GC the link/poster of the never-persisted element.
                cleanAssets(this.albumId).catch(() => {});
                return null;
            }
        },
        prepareFileElement: async function(file) {
            // Upload a local file as a new album asset and return the element
            // referencing it, or null after showing an error toast. Same flow
            // as the paint dialog (and the Android app): the probe returns
            // where the asset lives under the user's files root, the bytes go
            // up over native WebDAV, and the server must confirm the file
            // landed before any page starts referencing it.
            const isVideo = VIDEO_MIMES.includes(file.type);
            const isAudio = AUDIO_MIMES.includes(file.type);
            const picked = { name: file.name, size: file.size, mime: file.type };
            var element = isVideo ? buildVideoElement(picked)
                : isAudio ? buildAudioElement(picked)
                : buildImageElement(picked);
            const asset = isVideo ? element.video : (isAudio ? element.audio : element.image);
            try {
                var probe = await probeAsset(this.albumId, asset);
                if (probe == null || !probe.path) {
                    throw new Error("assetprobe returned no upload path");
                }
                await uploadAsset(probe.path, file);
                var check = await probeAsset(this.albumId, asset);
                if (check == null || check.status !== "ok") {
                    throw new Error("uploaded asset not found in the album");
                }
                if (isVideo) {
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
                cleanAssets(this.albumId).catch(() => {});
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
        addMediaItems: async function(items, prepare) {
            // Insert the chosen media in order (issue #36): the first visual
            // medium joins the page the chooser was opened from (as a single
            // pick always did), each further one gets its own new page right
            // after — one medium per page. Audio (issue #33) is not a tile: it
            // becomes the audio track of the page the batch is currently on,
            // replacing any existing track (last one wins).
            var that = this;
            var targetIndex = this.pages.findIndex(p => p.id === this.imageChooserPageId);
            if (targetIndex < 0 || this.imageChooserSaving || items.length === 0) {
                return;
            }
            this.imageChooserSaving = true;
            var visualCount = 0;
            var audioReplaced = false;
            for (const item of items) {
                var element = await prepare(item);
                if (element == null) {
                    // Error already shown; keep the dialog open (media inserted
                    // so far stay) so the user can retry or pick something else.
                    this.imageChooserSaving = false;
                    return;
                }
                try {
                    if (element.class === "AudioElement") {
                        // The page the batch is currently on: the target page
                        // until a visual medium has created a new one. Read the
                        // page at application time — earlier iterations may
                        // have replaced the object in `pages`.
                        var currentIndex = targetIndex + Math.max(0, visualCount - 1);
                        var current = this.pages[currentIndex];
                        audioReplaced = audioReplaced || (getAudioElement(current) != null);
                        var withAudio = setPageAudioElement(current, element);
                        await updatePage(this.albumId, withAudio);
                        this.pages.splice(currentIndex, 1, withAudio);
                    } else if (visualCount === 0) {
                        var updatedPage = addElement(this.pages[targetIndex], element);
                        await updatePage(this.albumId, updatedPage);
                        this.pages.splice(targetIndex, 1, updatedPage);
                        visualCount++;
                    } else {
                        var pos = targetIndex + visualCount;
                        var page = addElement(buildPage(), element);
                        await createPage(this.albumId, pos, page);
                        this.pages.splice(pos, 0, page);
                        visualCount++;
                    }
                } catch (error) {
                    this.imageChooserSaving = false;
                    showError(this.mediaErrorString(element));
                    cleanAssets(this.albumId).catch(() => {});
                    return;
                }
            }
            if (audioReplaced) {
                // Replaced tracks leave their old audio asset orphaned.
                cleanAssets(this.albumId).catch(() => {});
            }
            this.imageChooserSaving = false;
            this.imageChooserPageId = null;
            if (visualCount > 1) {
                // Land on the last created page so the whole batch is visible.
                this.$nextTick(() => { that.showN(targetIndex + visualCount - 1); });
            }
        },
        attachVideoPoster: async function(element, videoBlob) {
            // Capture a poster frame of the video and upload it as the
            // element's `image` asset (the Android app stores a generated
            // thumbnail there too). Best-effort: any failure — undecodable
            // codec, upload error — returns the element without a poster,
            // which every consumer (web and Android) tolerates.
            try {
                var poster = await captureVideoPoster(videoBlob);
                if (poster == null) {
                    throw new Error("poster capture failed");
                }
                var probe = await probeAsset(this.albumId, element.image);
                if (probe == null || !probe.path) {
                    throw new Error("assetprobe returned no upload path");
                }
                await uploadAsset(probe.path, poster);
                var check = await probeAsset(this.albumId, element.image);
                if (check == null || check.status !== "ok") {
                    throw new Error("uploaded poster not found in the album");
                }
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