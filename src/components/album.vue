<template>
	<div class="s-album" tabindex="0" v-on:keyup.left="showPrev" v-on:keyup.right="showNext">
	    <i class="arrow-left" v-on:click="showPrev" v-bind:style="{ visibility: aLeftVisible ? 'visible' : 'hidden', }"></i>
        <page v-for="(page, index) in pages" v-bind:s-num="index" v-bind:s-id="page.id" v-bind:displayed-page="displayedPage" v-bind:key="page.id"
            v-bind:elements="page.elements" v-bind:album-path="path"
            v-bind:token="token" v-on:imagefull="openImgFull">
	    </page>
	    <i class="arrow-right" v-on:click="showNext" v-bind:style="{ visibility: aRightVisible ? 'visible' : 'hidden', }"></i>
        <div class="progress">
            <div class="progress-item" v-for="(page, index) in pages" v-bind:key="index" v-bind:class="index == displayedPage ? 'progress-item-full' : 'progress-item-empty'"
            v-on:click="showN(index)">
            </div>
        </div>
        <div class="fullscreen" v-on:click="fullscreen"></div>
        <imagefull v-if="imageFullOn" v-bind:imageUrl="imageFullUrl" v-bind:isPhotosphere="imageFullIsPhotosphere"
            v-on:click="closeImgFull" v-on:closeimagefull="closeImgFull">
        </imagefull>
        <AudioPlayer v-bind:audioUrl="audioUrl" v-bind:stop="isStopCmd"></AudioPlayer>
        <div v-if="loading" class="center">
            <img src="./img/loading.gif"/>
        </div>
    </div>
</template>

<script>

import Page from './page'
import Imagefull from './imagefull'
import AudioPlayer from './audio_player'

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
            "sName": "",
            "pages": [],
            "loading": true,
        }
    },
    mounted: function() {
        this.refreshAlbum();
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
        closeImgFull: function() {
            this.imageFullOn = false;
        },
        fullscreen: function() {
            $(".s-album").each(function() {
                this.requestFullscreen();
            });
        },
        refreshAlbum: function() {
            this.loading = true;
            if (this.token != "") {
                $.get(this.token+"/album", album => {
                this.sName = album.name;
                this.pages = album.pages;
                this.loading = false;
                });
            } else {
                $.get("apiv2/album/unknown/full?apath="+this.path, album => {
                this.sName = album.name;
                this.pages = album.pages;
                this.loading = false;
                });
            }
        },
    },
    components: {
        page: Page,
        Imagefull: Imagefull,
        AudioPlayer: AudioPlayer,
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
}
.arrow-right {
    background-image: url("./img/right_arrow.svg");
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
	display: inline-block;
	position: absolute;
    top: 50%;
    transform: translateY(-50%);
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
	position: absolute;
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

.fullscreen {
    background-image: url("./img/fullscreen.svg");
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
    display: inline-block;
	position: absolute;
    right: 5px;
    top: 5px;
    width: 50px;
    height: 50px;
    opacity: 50%;
}

:fullscreen .fullscreen {
    visibility: hidden;
}

.center {
  position: fixed;
  top: 50%;
  left: 50%;
}

</style>