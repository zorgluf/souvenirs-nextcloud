<template>
    <div v-bind:class="(isWinPortrait ? 's-page-vert' : 's-page-hori')" v-bind:id="sId">
	<selement v-for="element in elements" v-bind:s-id="element.id" v-bind:s-top="element.top"
				v-bind:s-bottom="element.bottom" v-bind:s-left="element.left"
				v-bind:s-right="element.right" v-bind:s-text="element.text"
        v-bind:s-offset-x="element.offsetX" v-bind:s-offset-y="element.offsetY" v-bind:s-zoom="element.zoom"
				v-bind:s-image="('image' in element) ? element.image.replace(/.*\//, '') : ''" 
        v-bind:s-mime="element.mime"
        v-bind:key="element.id"
                v-bind:album-path="albumPath" v-bind:token="token"
                v-bind:preload="pagePreload" v-bind:s-transform-type="element.transformType"
                v-bind:s-class="element.class"
                v-bind:s-video="element.video" v-bind:is-focus="isFocus"
                v-on:imagefull="openImgFull" v-on:videofull="openVideoFull"
                v-bind:edit-mode="editMode" v-on:edit-text="onEditText"
                v-on:remove-element="onRemoveElement"
                v-bind:element-margin="elementMargin">
	</selement>
        <div v-if="editMode" class="page-edit-toolbar">
            <NcButton type="primary" v-on:click="onAddImage">
                <template #icon>
                    <Plus :size="20" />
                </template>
                {{ sAddImage }}
            </NcButton>
            <NcButton v-if="canCycle" type="secondary" v-on:click="onCycleLayout">
                <template #icon>
                    <ViewDashboardVariantOutline :size="20" />
                </template>
                {{ sChangeLayout }}
            </NcButton>
        </div>
    </div>
</template>

<script>

import Selement from "./selement.vue"
import { NcButton } from '@nextcloud/vue'
import Plus from 'vue-material-design-icons/Plus.vue'
import ViewDashboardVariantOutline from 'vue-material-design-icons/ViewDashboardVariantOutline.vue'
import { canCycleLayout } from '../utils/tilePageLayout.js'

export default {
    props: {
      "sId": String,
      "sNum": Number,
      'displayedPage': Number,
      "elements": Array,
      "albumPath": String,
      "token": String,
      "isWinPortrait": Boolean,
      "elementMargin": Number,
      "editMode": Boolean,
    },
    data: function() {
        return {
            "isFocus": false,
            "preloadScope": 5,
            "sAddImage": t("souvenirs","Add image"),
            "sChangeLayout": t("souvenirs","Change layout"),
        }
    },
    computed: {
        "pagePreload": function() {
          if (Math.abs(this.displayedPage - this.sNum) < this.preloadScope) {
            return true;
          } else {
            return false;
          }
        },
        "canCycle": function() {
          return canCycleLayout(this.elements);
        }
    },
    watch: {
        // whenever page changes, this function will run
        displayedPage: function (newPage, oldPage) {
          if (this.displayedPage == this.sNum) {
            //update text size
            fitText();
            //mark page as displayed
            this.isFocus = true;
          } else {
            this.isFocus = false;
          }
          
        }
    },
    components: {
        "selement": Selement,
        NcButton,
        Plus,
        ViewDashboardVariantOutline,
    },
    methods: {
      openImgFull: function(imageUrl,isPhotosphere) {
        this.$emit("imagefull",imageUrl,isPhotosphere);
      },
      openVideoFull: function(videoUrl) {
        this.$emit("videofull",videoUrl);
      },
      onEditText: function(elementId, newText) {
        // Re-emit with this page's id (sId) so the album can locate the element.
        this.$emit("edit-text", this.sId, elementId, newText);
      },
      onRemoveElement: function(elementId) {
        // Re-emit with this page's id (sId) so the album can locate the element.
        this.$emit("remove-element", this.sId, elementId);
      },
      onAddImage: function() {
        // Ask the album to run the file picker and add an image to this page.
        this.$emit("add-image", this.sId);
      },
      onCycleLayout: function() {
        // Ask the album to switch this page to the next available layout.
        this.$emit("cycle-layout", this.sId);
      }
    },
    mounted: function() {
        fitText();
    }
}

//tools : autosize text
var fitText = function() {
    var elements = document.querySelectorAll('.resize');
    if(elements.length <= 0) {
      return;
    }
    elements.forEach(function(element) {
      while( (element.scrollWidth > element.offsetWidth) || (element.scrollHeight > element.offsetHeight) ) {
        var newFontSize = (parseFloat(window.getComputedStyle(element).fontSize.slice(0, -2)) * 0.95) + 'px';
        element.style.fontSize = newFontSize;
        element.style.lineHeight = newFontSize;
      }
    });
  };

function isFullyVisible(el) {
    var rect = el.getBoundingClientRect();
    var elemTop = rect.top;
    var elemBottom = rect.bottom;

    var isVisible = (elemTop >= 0) && (elemBottom <= window.innerHeight);
    return isVisible;
}

</script>

<style scoped>

.s-page-vert {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  position: relative;
}

.s-page-hori {
  display: inline-block;
  height: 100%;
  aspect-ratio: 1 / 1;
  position: relative;
}

.page-edit-toolbar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 8;
}
</style>