<template>
	<div v-bind:class="['s-album', { 'editing': editMode }]" tabindex="0" v-on:keydown.prevent.left="showPrev" v-on:keydown.prevent.right="showNext"
    v-on:keydown.prevent.up="showPrev" v-on:keydown.prevent.down="showNext" v-on:keydown.prevent.space="diaporama(!diaporamaMode)">
	    <i v-bind:class="isWinPortrait ? 'arrow-top': 'arrow-left'" v-on:click="showPrev"  v-if="!isTouchDevice"
            v-bind:style="{ visibility: aLeftVisible ? 'visible' : 'hidden', }"></i>
        <page v-for="(page, index) in pages" v-bind:s-num="index" v-bind:s-id="page.id" v-bind:displayed-page="displayedPage" v-bind:key="page.id"
            v-bind:elements="page.elements" v-bind:album-path="path" v-bind:is-win-portrait="isWinPortrait"
            v-bind:token="token" v-on:imagefull="openImgFull" v-on:videofull="openVideoFull" v-bind:element-margin="elementMargin"
            v-bind:edit-mode="editMode" v-on:edit-text="onEditText"
            v-bind:is-last="index === pages.length - 1"
            v-on:remove-element="onRemoveElement" v-on:add-image="onAddImage"
            v-on:add-text="onAddText" v-on:cycle-layout="onCycleLayout"
            v-on:add-page="onAddPage" v-on:move-page="onMovePage">
	    </page>
	    <i v-bind:class="isWinPortrait ? 'arrow-bottom': 'arrow-right'" v-on:click="showNext" v-if="!isTouchDevice"
            v-bind:style="{ visibility: aRightVisible ? 'visible' : 'hidden', }"></i>
        <div v-bind:class="isWinPortrait ? 'progress-portrait': 'progress'" v-if="!isTouchDevice">
            <div v-bind:class=" [ isWinPortrait ? 'progress-item-portrait': 'progress-item', index == displayedPage ? 'progress-item-full' : 'progress-item-empty']" v-for="(page, index) in pages" v-bind:key="index"
            v-on:click="showN(index)">
            </div>
        </div>
        <div v-if="editMode" class="edit-badge">{{ sEditing }}</div>
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
        <imagefull v-if="imageFullOn" v-bind:imageUrl="imageFullUrl" v-bind:isPhotosphere="imageFullIsPhotosphere"
            v-on:closeimagefull="closeImgFull">
        </imagefull>
        <videofull v-if="videoFullOn" v-bind:videoUrl="videoFullUrl"
            v-on:click="closeVideoFull" v-on:closevideofull="closeVideoFull">
        </videofull>
        <AudioPlayer v-bind:audioUrl="audioUrl" v-bind:stop="isStopCmd"></AudioPlayer>
        <div v-if="loading" class="center-page">
            <NcLoadingIcon :size="64">
            </NcLoadingIcon>
        </div>
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
import { NcLoadingIcon, NcActionInput, NcActionButton, NcActions, NcProgressBar, NcModal, NcActionSeparator } from '@nextcloud/vue'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { setElementText, removeElement, buildImageElement, buildTextElement, buildPage, addElement } from '../utils/albumEdit.js'
import { cycleLayout } from '../utils/tilePageLayout.js'
import { updatePage, searchAsset, cleanAssets, createPage, deletePage, movePage } from '../api/albumApi.js'
import { getFilePickerBuilder, showError } from '@nextcloud/dialogs'
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
            "sStartSh": t("souvenirs","Start slideshow"),
            "sStopSh": t("souvenirs","Stop slideshow"),
            "sSpeedSh": t("souvenirs","Slideshow speed"),
            "sDownload": t("souvenirs","Download"),
            "sFullscreen": t("souvenirs","Fullscreen"),
            "sDownloadZip": t("souvenirs","Click to download album in a zip file."),
            "sEdit": t("souvenirs","Edit"),
            "sFinishEdit": t("souvenirs","Finish editing"),
            "sEditing": t("souvenirs","Editing"),
            "elementMargin": 1,
            "isTouchDevice": isTouchDevice(),
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
        "isStopCmd": function() {
            if (this.pages.length > 0) {
                var audioElement = getAudioElement(this.pages[this.displayedPage]);
                if (audioElement != null) {
                    return audioElement.stop;
                }
            }
            return false;
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
                    const d = await getFile('asset' + '?apath=' + encodeURIComponent(this.path) + '&file=' + encodeURIComponent(basename(asset)));
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
                        that.pages = data.pages;
                        that.loading = false;
                    })
                }).catch(error => {
                    console.log("Error in refresh album.");
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
                        that.pages = data.pages;
                        that.elementMargin = data.elementMargin ??= 0;
                        that.loading = false;
                    })
                }).catch(error => {
                    console.log("Error in refresh album.");
                });
            }
        },
        toggleEdit: function() {
            this.editMode = !this.editMode;
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
            updatePage(this.albumId, updatedPage).catch(error => {
                console.log("Error saving album page edit.");
            });
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
            // Removing the last element of a page deletes the page itself - unless
            // it is the only page left, which we keep (empty) so the album is not
            // left with no pages and no way to add one.
            if (updatedPage.elements.length === 0 && this.pages.length > 1) {
                deletePage(this.albumId, pageId)
                    .then(() => {
                        that.pages.splice(index, 1);
                        if (that.displayedPage >= that.pages.length) {
                            that.displayedPage = that.pages.length - 1;
                        }
                        cleanAssets(that.albumId).catch(() => {});
                    })
                    .catch(error => {
                        showError(t("souvenirs","Could not delete the page."));
                    });
                return;
            }
            this.pages.splice(index, 1, updatedPage);
            updatePage(this.albumId, updatedPage)
                .then(() => {
                    cleanAssets(this.albumId).catch(() => {});
                })
                .catch(error => {
                    showError(t("souvenirs","Could not remove the image."));
                });
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
            updatePage(this.albumId, updatedPage).catch(error => {
                showError(t("souvenirs","Could not change the layout."));
            });
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
            movePage(this.albumId, page.id, pos).catch(error => {
                // Revert the optimistic move.
                that.pages.splice(newIndex, 1);
                that.pages.splice(index, 0, page);
                that.$nextTick(() => { that.showN(index); });
                showError(t("souvenirs","Could not move the page."));
            });
        },
        onAddPage: function(pos) {
            // Create a new empty page at `pos`, insert it locally, and navigate to it.
            var that = this;
            var page = buildPage();
            createPage(this.albumId, pos, page).then(() => {
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
            updatePage(this.albumId, updatedPage).catch(error => {
                showError(t("souvenirs","Could not add the text."));
            });
        },
        onAddImage: async function(pageId) {
            var index = this.pages.findIndex(p => p.id === pageId);
            if (index < 0) {
                return;
            }
            // Browse the user's existing Nextcloud files and pick one image.
            var node;
            try {
                const picker = getFilePickerBuilder(t("souvenirs","Choose an image"))
                    .setMimeTypeFilter(["image/png","image/jpeg","image/gif","image/webp","image/bmp","image/tiff","image/svg+xml"])
                    .setMultiSelect(false)
                    .allowDirectories(false)
                    // Without an explicit confirm button the picker shows no way to
                    // validate a selection, so pickNodes() would never resolve.
                    .setButtonFactory((nodes) => [{
                        label: t("souvenirs","Choose"),
                        variant: "primary",
                        disabled: nodes.length === 0,
                        callback: () => {},
                    }])
                    .build();
                const nodes = await picker.pickNodes();
                node = Array.isArray(nodes) ? nodes[0] : nodes;
            } catch (e) {
                // The picker rejects when closed without a selection: ignore.
                return;
            }
            if (node == null) {
                return;
            }
            const file = { name: node.basename, size: node.size, mime: node.mime };
            if (!file.size) {
                showError(t("souvenirs","Could not read the selected file."));
                return;
            }
            // Build the element first so we know the in-album asset path to link,
            // then ask the backend to link the picked file to it (no copy/upload).
            const element = buildImageElement(file);
            var res;
            try {
                res = await searchAsset(this.albumId, element.image, file.name, file.size);
            } catch (e) {
                showError(t("souvenirs","Could not add the image."));
                return;
            }
            if (res == null || res.status !== "found") {
                showError(t("souvenirs","Could not link the selected image. It must be located outside the Souvenirs albums folder."));
                return;
            }
            const updatedPage = addElement(this.pages[index], element);
            this.pages.splice(index, 1, updatedPage);
            updatePage(this.albumId, updatedPage).catch(error => {
                showError(t("souvenirs","Could not save the added image."));
            });
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
        NcModal,
        NcProgressBar,
        NcActions,
        NcActionButton,
        NcActionInput,
        NcActionSeparator,
        NcLoadingIcon,
        Pencil,
        PencilOff,
    },
}

var getAudioElement = function(page) {
    for (let i = 0; i < page.elements.length; i++) {
        var element = page.elements[i];
        if (element.class == "AudioElement") {
            return element;
        }
    }
    return null;
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
    z-index: 6;
}

.s-album.editing {
    /* Make it unmistakable that the album is in edit mode. */
    outline: 4px solid var(--color-primary-element, #0082c9);
    outline-offset: -4px;
}

.edit-badge {
    position: absolute;
    left: 5px;
    top: 5px;
    z-index: 7;
    padding: 4px 10px;
    border-radius: var(--border-radius-pill, 14px);
    background-color: var(--color-primary-element, #0082c9);
    color: var(--color-primary-element-text, #ffffff);
    font-weight: bold;
    font-size: 13px;
    pointer-events: none;
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