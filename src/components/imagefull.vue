<template>
    <div class="image-full" id="image_full">
		<img class="fill" v-bind:src="imageUrl" v-on:click="closeImgFull" v-if="!isPhotosphere"/>
    </div>
</template>

<script>

import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import { VisibleRangePlugin } from '@photo-sphere-viewer/visible-range-plugin';
import { imagePath } from '@nextcloud/router'

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
                loadingImg: imagePath('souvenirs','loading.gif'),
                touchmoveTwoFingers: true,
                mousewheelCtrlKey: true,
                navbar: [
                   "zoom",
                   "move",  
                    {
                       id: 'close-button',
                       content: '<svg version="1.1" viewBox="0 0 20.699 21.479" xmlns="http://www.w3.org/2000/svg"><g transform="translate(1.632 1.6339)" label="Layer 1"><path d="m-2.5783e-4 -0.0014681 17.436 18.214" fill="#FFFFFF" stroke="#FFFFFF" stroke-linecap="round" stroke-width="4"/><path d="m-2.5783e-4 18.212 17.436-18.214" fill="#FFFFFF" stroke="#FFFFFF" stroke-linecap="round" stroke-width="4"/><title>Layer 1</title></g></svg>',
                       title: 'Close',
                       className: 'custom-button',
                       onClick: () => {
                           this.closeImgFull();
                       },
                    },
                ],
                plugins: [ 
                    VisibleRangePlugin.withConfig({
                        usePanoData: true,
                    }),
                ],
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
    height: 100vh;
    width: 100vw;
    position: fixed;
    z-index: 100;
    left: 0;
    top: 0;
    background-color: rgb(0,0,0);
    background-color: rgba(0,0,0, 0.9);
    overflow-x: hidden;
    transition: 0.5s;
}

#image_full * {
    box-sizing: unset;
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