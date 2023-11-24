<template>
    <div ref="eldiv" v-bind:class="['s-element', ((sClass.endsWith('ImageElement') || sClass.endsWith('VideoElement')) && sZoom < 100) ? 'blur-back' : '']" 
    v-bind:id="sId"
    v-bind:style="'top:'+sTop.toString()+'%;left:'+sLeft.toString()+'%;width:'+(sRight-sLeft).toString()+'%;height:'+(sBottom-sTop).toString()+'%;--image-src-url:url(\''+sImageSrc+'\')'">
		<div class="s-element-text resize" v-if="(sText)">{{sText}}</div>
        <video v-bind:id="sId+'video'" v-if="sClass.endsWith('VideoElement')" v-on:click="openVideo"
            v-bind:class="['video-element', isImgCenterCrop ? 'centercrop' : '', isImgFill ? 'fill' : '' ]" 
            loop="true" preload="auto" :key="videoUrlSrc"
            v-on:waiting="waitingVideo" v-on:canplay="playingVideo" v-on:loadstart="waitingVideo">
            <source v-bind:src="videoUrlSrc">
        </video>
        <div v-if="sImageSrc == null && (sClass.endsWith('ImageElement') || sClass.endsWith('VideoElement'))">
            <NcLoadingIcon :size="64"></NcLoadingIcon>
        </div>
        
		<img id="image_element" v-bind:style="imageStyle" v-bind:class="['image-element', isImgCenterCrop ? 'centercrop' : '', isImgFill ? 'fill' : '' ]"
        v-if="sImage != '' && (sClass.endsWith('ImageElement') || sClass.endsWith('VideoElement'))" 
        v-bind:src="sImageSrc" v-on:click="openImgFull" />
        <img v-bind:class="['paint-element', isImgCenterCrop ? 'centercrop' : '', isImgFill ? 'fill' : '' ]" v-if="sImage != '' && sClass.endsWith('PaintElement')" v-bind:src="sImageSrc"/>
        <div v-if="sMime == 'application/vnd.google.panorama360+jpg'" class="image-element-pano-icon"/>
        <div v-if="sVideo != null" class="image-element-video-icon"/>
        <div v-bind:id="'pano-'+sId" style="position:absolute;top:0;left:0;width: 100%;height: 100%;"/>
        <div v-if="isVideoLoading" class="center">
            <NcLoadingIcon :size="64">
            </NcLoadingIcon>
        </div>
    </div>
</template>

<script>

const IMG_FILL = 0;
const IMG_CENTERCROP = 1;
const IMG_ZOOMOFFSET = 2;

const GOOGLE_PANORAMA_360_MIMETYPE = "application/vnd.google.panorama360+jpg";

import { Viewer } from 'photo-sphere-viewer';
import 'photo-sphere-viewer/dist/photo-sphere-viewer.css'
import { NcLoadingIcon } from '@nextcloud/vue'

export default {
    props: {
      "sId": String,
      "sTop": Number,
      "sBottom": Number,
      "sLeft": Number,
      "sRight": Number,
      "sText": String,
      "sImage": String,
      "sVideo": String,
      "sTransformType": Number,
      "sZoom": Number,
      "sOffsetX": Number,
      "sOffsetY": Number,
      "sClass": String,
      "albumPath": String,
      "preload": Boolean,
      "token": String,
      "sMime": String,
      "isFocus": Boolean,
    },
    data: function() {
        return {
            "sImageSrc": null,
            "videoUrlSrc": null,
            "loadingImage": null,
            "imageStyle": {},
            "isVideoLoading": false,
        }
    },
    components: {
        NcLoadingIcon,
    },
    watch: {
        "preload": function(newPreload, oldPreload) {
            if (newPreload != oldPreload) {
                if (this.preload && this.loadingImage==null) {
                    this.loadImage();
                }
            }
        },
        "isFocus": function(newFocus,oldFocus) {
            if (this.sClass == 'VideoElement') {
                if (newFocus != oldFocus) {
                    let video = document.getElementById(this.sId+"video");
                    if (newFocus) {
                        if (!this.isVideoLoading) {
                            video.play();
                        }
                    } else {
                        const isVideoPlaying = video => !!(video.currentTime > 0 && !video.paused && !video.ended && video.readyState > 3);
                        if (isVideoPlaying) {
                            video.pause();
                        }
                    }
                }
            }
        }
    },
    created: function() {
            if (this.preload) {
                this.loadImage();
            }
        },
    computed: {
        'sWidth': function() {
            var ew = document.getElementById("souvenirs-main").clientWidth;
            if (this.sTransformType == IMG_ZOOMOFFSET) {
                ew = ew*this.sZoom/100;
            }
            return Math.floor(ew*(this.sRight-this.sLeft)/100);
        },
        'sHeight': function() {
            var eh = document.getElementById("souvenirs-main").clientHeight;
            if (this.sTransformType == IMG_ZOOMOFFSET) {
                eh = eh*this.sZoom/100;
            }
            return Math.floor(eh*(this.sBottom-this.sTop)/100);
        },
        'isImgCenterCrop': function() {
            return (this.sTransformType == IMG_CENTERCROP);
        },
        'isImgFill': function() {
            return (this.sTransformType == IMG_FILL);
        },
        'videoUrl': function() {
            if (this.sVideo != null) {
                if (this.token != "") {
                    return this.token+'/asset?file=' + basename(this.sVideo);
                } else {
                    return 'asset?apath=' + this.albumPath + '&file=' + basename(this.sVideo);
                }
            }
        },
    },
    methods: {
        loadImage: function() {
            if (this.sImage != '') {
                this.loadingImage = new Image();
                this.loadingImage.onload = this.onLoadedImage;
                this.loadingImage.src = this.imageUrl();
            }
            if ((this.sVideo != '') && (this.sVideo != undefined)) {
                this.videoUrlSrc = this.videoUrl;
            }
        },
        onLoadedImage: function() {
            this.sImageSrc = this.loadingImage.src;
            if (((this.sClass == 'ImageElement') || (this.sClass == 'VideoElement')) && (this.sTransformType == IMG_ZOOMOFFSET)) {
                this.imageStyle = getImageZoomOffsetStyle(this.sZoom,this.sOffsetX,this.sOffsetY,this.$refs.eldiv.clientWidth,this.$refs.eldiv.clientHeight,this.loadingImage.width,this.loadingImage.height);
            }
            if (this.isPhotosphere()) {
                var pano = new Viewer({
                    panorama: this.imageUrl(true),
                    container: "pano-"+this.sId,
                    loadingImg: './img/loading.gif', //FIXME : broken
                    useXmpData: true,
                    defaultLong: 110,
                    navbar: [],
                    autorotateDelay: 1
                });
            }
        },
        imageUrl: function(full = false) {
            if (full) {
                if (this.token != "") {
                    return this.token+'/preview?file=' + this.sImage;
                } else {
                    return 'preview?apath=' + this.albumPath + '&file=' + this.sImage;
                }
            }
            if (this.token != "") {
                return this.token+'/preview?file=' + this.sImage + '&width=' + this.sWidth + '&height=' + this.sHeight;
            } else {
                return 'preview?apath=' + this.albumPath + '&file=' + this.sImage + '&width=' + this.sWidth + '&height=' + this.sHeight;
            }
        },
        isPhotosphere: function() {
            return (this.sMime == GOOGLE_PANORAMA_360_MIMETYPE);
        },
        openImgFull: function() {
            this.$emit("imagefull",this.imageUrl(true),this.isPhotosphere());
        },
        openVideo: function() {
            document.getElementById(this.sId+"video").pause();
            this.$emit("videofull",this.videoUrl);
        },
        waitingVideo: function() {
            this.isVideoLoading = true;
        },
        playingVideo: function() {
            this.isVideoLoading = false;
            if (this.isFocus) {
                document.getElementById(this.sId+"video").play();
            }
        }
    }
}

function getImageZoomOffsetStyle(zoom, offsetX, offsetY, destWidth, destHeight, imgWidth, imgHeight) {
    var style = {
        "position" : 'absolute',
        "top" : '50%',
        "left" : '50%',
        };
    var widthScale = destWidth / imgWidth;
    var heightScale = destHeight / imgHeight;
    var scale = Math.max(widthScale, heightScale);
    if (widthScale > heightScale) {
        style["width"]="100%";
        style["height"]="auto";
    } else {
        style["width"]="auto";
        style["height"]="100%";
    }
    style["transform"] = "translate(-50%,-50%) translate("+offsetX*destWidth/100+"px,"+offsetY*destHeight/100+"px) scale("+zoom/100+")";
    var originX = -((destWidth - imgWidth * scale) / 2 + offsetX*destWidth/100);
    var originY = -((destHeight - imgHeight * scale) / 2 + offsetY*destHeight/100);
    style["transform-origin"] = originX+"px "+originY+"px";
            
    return style;
}

function basename(path) {
   return path.split('/').reverse()[0];
}
</script>

<style scoped>

.s-element {
	position: absolute;
	font-size: 0px;
	display: flex;
	align-items: center;
	justify-content: center;
    pointer-events: none;
    overflow: hidden;
}

.s-element-text {
	font-size: 1000px;
	width: 100%;
	height: 100%;
	hyphens: auto;
	display: flex;
	align-items: center;
	justify-content: center;
	text-align: center;
    white-space: pre-wrap;
}

:fullscreen .s-element-text {
    color: white;
}

center {
    margin:auto;
    position: absolute;
}

.centercrop {
    object-fit: cover;
    width: 100%;
	height: 100%;
}
reture
.fill {
    object-fit: contain;
    width: 100%;
	height: 100%;
}

.paint-element {
    pointer-events: none;
}

.image-element {
    pointer-events: all;
}

.video-element {
    z-index: 5;
    pointer-events: all;
}

.image-element-pano-icon {
    background-image: url("./img/pano.svg");
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
    width: 50px;
    height: 50px;
    display: inline-block;
	position: absolute;
    left: 10px;
    top: 10px;
    opacity: 50%;
}

.image-element-video-icon {
    background-image: url("./img/video.svg");
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
    width: 50px;
    height: 50px;
    display: inline-block;
	position: absolute;
    left: 10px;
    top: 10px;
    opacity: 50%;
}

.blur-back::before {
    content: ' ';
    display: block;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-image: var(--image-src-url);
    background-size: 100% 100%;
    background-position: center;
    filter: blur(25px);
    opacity: 0.5;
}

</style>
