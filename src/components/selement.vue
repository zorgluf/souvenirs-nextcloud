<template>
    <div ref="eldiv" v-bind:class="['s-element', ]" v-bind:id="sId" v-bind:style="'top:'+sTop.toString()+'%;left:'+sLeft.toString()+'%;width:'+(sRight-sLeft).toString()+'%;height:'+(sBottom-sTop).toString()+'%;'">
		<div class="s-element-text resize" v-if="(sText)">{{sText}}</div>
		<img v-bind:style="imageStyle" v-bind:class="['image-element', isImgCenterCrop ? 'centercrop' : '', isImgFill ? 'fill' : '' ]"
        v-if="sImage != '' && sClass.endsWith('ImageElement')" 
        v-bind:src="sImageSrc" v-on:click="openImgFull" />
        <img v-bind:class="['paint-element', isImgCenterCrop ? 'centercrop' : '', isImgFill ? 'fill' : '' ]" v-if="sImage != '' && sClass.endsWith('PaintElement')" v-bind:src="sImageSrc"/>
    </div>
</template>

<script>

const IMG_FILL = 0;
const IMG_CENTERCROP = 1;
const IMG_ZOOMOFFSET = 2;

export default {
    props: {
      "sId": String,
      "sTop": Number,
      "sBottom": Number,
      "sLeft": Number,
      "sRight": Number,
      "sText": String,
      "sImage": String,
      "sTransformType": Number,
      "sZoom": Number,
      "sOffsetX": Number,
      "sOffsetY": Number,
      "sClass": String,
      "albumPath": String,
      "preload": Boolean,
      "token": String,
    },
    data: function() {
        return {
            "sImageSrc": require('./img/loading.gif'),
            "loadingImage": null,
            "imageStyle": {},
        }
    },
    watch: {
        "preload": function(newPreload, oldPreload) {
            if (newPreload != oldPreload) {
                if (this.preload && this.loadingImage==null) {
                    this.loadImage();
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
            var ew = $("#album-parent-frame").width();
            if (this.sTransformType == IMG_ZOOMOFFSET) {
                ew = ew*this.sZoom/100;
            }
            return Math.floor(ew*(this.sRight-this.sLeft)/100);
        },
        'sHeight': function() {
            var eh = $("#album-parent-frame").height();
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
    },
    methods: {
        loadImage: function() {
            if (this.sImage != '') {
                this.loadingImage = new Image();
                this.loadingImage.onload = this.onLoadedImage;
                this.loadingImage.src = this.imageUrl();
            }
        },
        onLoadedImage: function() {
            this.sImageSrc = this.loadingImage.src;
            if ((this.sClass == 'ImageElement') && (this.sTransformType == IMG_ZOOMOFFSET)) {
                this.imageStyle = getImageZoomOffsetStyle(this.sZoom,this.sOffsetX,this.sOffsetY,this.$refs.eldiv.clientWidth,this.$refs.eldiv.clientHeight,this.loadingImage.width,this.loadingImage.height);
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
        openImgFull: function() {
            this.$emit("imagefull",this.imageUrl(true));
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

.centercrop {
    object-fit: cover;
    width: 100%;
	height: 100%;
}

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

</style>
