<template>
    <div v-bind:class="isPhotosphere ? 'image-full' : 'image-full'" id="image_full">
		<img class="fill" v-bind:src="imageUrl" v-on:click="closeImgFull" v-if="!isPhotosphere"/>
    </div>
</template>

<script>

import { Viewer } from 'photo-sphere-viewer';
import 'photo-sphere-viewer/dist/photo-sphere-viewer.css'

export default {
    props: {
      "imageUrl": String,
      "isPhotosphere": Boolean
    },
    mounted: function() {
        if (this.isPhotosphere) {
            new Viewer({
                panorama: this.imageUrl,
                container: 'image_full',
                loadingImg: './img/loading.gif',
                touchmoveTwoFingers: true,
                mousewheelCtrlKey: true,
                useXmpData: true,
                navbar: [
                    {
                        id: 'close-button',
                        content: '<svg version="1.1" viewBox="0 0 20.699 21.479" xmlns="http://www.w3.org/2000/svg"><g transform="translate(1.632 1.6339)" label="Layer 1"><path d="m-2.5783e-4 -0.0014681 17.436 18.214" fill="#000000" stroke="#000000" stroke-linecap="round" stroke-width="4"/><path d="m-2.5783e-4 18.212 17.436-18.214" fill="#000000" stroke="#000000" stroke-linecap="round" stroke-width="4"/><title>Layer 1</title></g></svg>',
                        title: 'Close',
                        className: 'custom-button',
                        onClick: () => {
                            this.closeImgFull();
                        },
                    },
                    "autorotate",
                    "zoomRange"
                ],
                autorotateDelay: 1
            });
        }
    },
    data: function() {
        return {
        }
    },
    methods: {
        closeImgFull: function() {
            this.$emit("closeimagefull");
        }
    }
}
</script>

<style scoped>

.image-full {
    height: 100%;
    width: 100%;
    position: fixed;
    z-index: 1;
    left: 0;
    top: 0;
    background-color: rgb(0,0,0);
    background-color: rgba(0,0,0, 0.9);
    overflow-x: hidden;
    transition: 0.5s;
}

.image-full-sphere {
    width: 100%; 
    height: 100%;
    position: fixed;
    z-index: 1;
    left: 0;
    top: 0;
}

.fill {
    object-fit: contain;
    width: 100%;
	height: 100%;
}

</style>