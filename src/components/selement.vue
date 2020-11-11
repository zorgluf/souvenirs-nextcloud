<template>
    <div v-bind:class="['s-element', ]" v-bind:id="sId" v-bind:style="'top:'+sTop.toString()+'%;left:'+sLeft.toString()+'%;width:'+(sRight-sLeft).toString()+'%;height:'+(sBottom-sTop).toString()+'%;'">
		<div class="s-element-text resize" v-if="(sText)">{{sText}}</div>
		<img v-bind:class="['image-element', isImgCenterCrop ? 'centercrop' : 'fill' ]" v-if="sImage != '' && sClass == 'ImageElement'" v-bind:src="sImageSrc" v-on:click="openImgFull" />
        <img v-bind:class="['paint-element', isImgCenterCrop ? 'centercrop' : 'fill' ]" v-if="sImage != '' && sClass == 'PaintElement'" v-bind:src="sImageSrc"/>
    </div>
</template>

<script>

const IMG_FILL = 0;
const IMG_CENTERCROP = 1;

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
      "sClass": String,
      "albumPath": String,
      "preload": Boolean,
      "token": String,
    },
    data: function() {
        return {
            "sImageSrc": require('./img/loading.gif'),
            "loadingImage": null,
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
            return Math.floor(ew*(this.sRight-this.sLeft)/100);
        },
        'sHeight': function() {
            var eh = $("#album-parent-frame").height();
            return Math.floor(eh*(this.sBottom-this.sTop)/100);
        },
        'isImgCenterCrop': function() {
            return (this.sTransformType == IMG_CENTERCROP);
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
</script>

<style scoped>

.s-element {
	position: absolute;
	font-size: 0px;
	display: flex;
	align-items: center;
	justify-content: center;
    pointer-events: none;
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