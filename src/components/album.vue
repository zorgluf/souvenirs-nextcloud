<template>
	<div class="s-album" tabindex="0" v-on:keyup.left="showPrev" v-on:keyup.right="showNext"
    v-on:keyup.up="showPrev" v-on:keyup.down="showNext" v-on:keyup.space="diaporama(!diaporamaMode)">
	    <i v-bind:class="isWinPortrait ? 'arrow-top': 'arrow-left'" v-on:click="showPrev" v-bind:style="{ visibility: aLeftVisible ? 'visible' : 'hidden', }"></i>
        <page v-for="(page, index) in pages" v-bind:s-num="index" v-bind:s-id="page.id" v-bind:displayed-page="displayedPage" v-bind:key="page.id"
            v-bind:elements="page.elements" v-bind:album-path="path" v-bind:is-win-portrait="isWinPortrait"
            v-bind:token="token" v-on:imagefull="openImgFull" v-on:videofull="openVideoFull">
	    </page>
	    <i v-bind:class="isWinPortrait ? 'arrow-bottom': 'arrow-right'" v-on:click="showNext" v-bind:style="{ visibility: aRightVisible ? 'visible' : 'hidden', }"></i>
        <div class="progress">
            <div class="progress-item" v-for="(page, index) in pages" v-bind:key="index" v-bind:class="index == displayedPage ? 'progress-item-full' : 'progress-item-empty'"
            v-on:click="showN(index)">
            </div>
        </div>
        <div class="top-right">
            <NcActions default-icon="icon-menu" :force-menu="true" :primary="true" v-if="!fullscreenMode">
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
            v-on:click="closeImgFull" v-on:closeimagefull="closeImgFull">
        </imagefull>
        <videofull v-if="videoFullOn" v-bind:videoUrl="videoFullUrl"
            v-on:click="closeVideoFull" v-on:closevideofull="closeVideoFull">
        </videofull>
        <AudioPlayer v-bind:audioUrl="audioUrl" v-bind:stop="isStopCmd"></AudioPlayer>
        <div v-if="loading" class="center-page">
            <img v-bind:src="imgLoading"/>
        </div>
        <NcModal v-if="downloadModal" @close="closeDownload" size="small">
            <p class="center">{{ sDownloadZip }}</p>
            <div v-if="!downloadActive" class="downloadIcon center" v-on:click="download"></div>
            <NcProgressBar v-if="downloadActive" size="medium" v-bind:value="downloadProgress"/>
        </NcModal>
    </div>
</template>

<script>

import Page from './page'
import Imagefull from './imagefull'
import Videofull from './videofull'
import AudioPlayer from './audio_player'
import { NcActionInput, NcActionButton, NcActions, NcProgressBar, NcModal, NcActionSeparator } from '@nextcloud/vue'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import ImgLoading from "./img/loading.gif"

export default {
    props: {
      "path": String,
      "token": String,
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
            "pages": [],
            "loading": true,
            "downloadModal": false,
            "downloadActive": false,
            "downloadProgress": 0,
            "albumJson": "",
            "imgLoading": ImgLoading,
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
        }
    },
    created: function() {
        window.addEventListener("resize", this.resizeEventHandler);
    },
    destroyed: function() {
        window.removeEventListener("resize", this.resizeEventHandler);
    },
    mounted: function() {
        this.resizeEventHandler(null);
        this.refreshAlbum();
        if (document.addEventListener) {
            document.addEventListener('fullscreenchange', ()=> {this.fullscreenMode = (document.fullscreenElement != null)}, false);
        }
        document.querySelector(".s-album").focus();
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
        },
        diapoTick: function() {
            this.diap_timeout = setTimeout(() => {
                    if (this.displayedPage >= (this.nbPage - 1)) {
                        this.diaporamaMode = false;
                        return;
                    }
                    this.displayedPage += 1;
                    this.diapoTick();
                }, this.diaporamaSpeed * 1000);
        },
        showPrev: function () {
            if (this.displayedPage == 0) {
                return;
            }
            this.displayedPage -= 1;
        },
        showN: function(index) {
            this.displayedPage = index;
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
                        that.pages = data.pages;
                        that.loading = false;
                    })
                }).catch(error => {
                    console.log("Error in refresh album.");
                });
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
        NcActionSeparator
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
</script>

<style scoped>
.progress-item {
    width: 20px;
    height: 20px;
    display: inline-block;
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

</style>