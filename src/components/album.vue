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
        <imagefull v-if="imageFullOn" v-bind:imageUrl="imageFullUrl" v-on:click="closeImgFull" v-on:closeimagefull="closeImgFull">
        </imagefull>
    </div>
</template>

<script>

import Page from './page'
import Imagefull from './imagefull'
import fitText from './page'

export default {
    props: {
      "sName": String,
      "pages": Array,
      "path": String,
      "token": String,
    },
    data: function() {
        return {
            "displayedPage": 0,
            "imageFullOn": false,
            "imageFullUrl": "",
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
        }
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
        openImgFull: function(imageUrl) {
            this.imageFullUrl = imageUrl;
            this.imageFullOn = true;
        },
        closeImgFull: function() {
            this.imageFullOn = false;
        },
        fullscreen: function() {
            $(".s-album").each(function() {
                this.requestFullscreen();
            });
        }
    },
    components: {
        page: Page,
        Imagefull: Imagefull,
    },
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
</style>