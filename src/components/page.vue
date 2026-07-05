<template>
    <div v-bind:class="(isWinPortrait ? 's-page-vert' : 's-page-hori')" v-bind:id="sId"
        v-on:dragover="onPageDragOver" v-on:drop="onPageDrop">
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
                v-bind:s-page-id="sId" v-on:element-drop="onElementDrop"
                v-bind:element-margin="elementMargin">
	</selement>
        <div v-if="editMode" class="page-insert page-insert--before" v-on:click="onAddPageBefore" :title="sAddPage">
            <button class="page-insert__btn"><Plus :size="20" /></button>
            <div class="page-insert__line"></div>
        </div>
        <div v-if="editMode && isLast" class="page-insert page-insert--after" v-on:click="onAddPageAfter" :title="sAddPage">
            <button class="page-insert__btn"><Plus :size="20" /></button>
            <div class="page-insert__line"></div>
        </div>
        <div v-if="editMode && sNum > 0" class="page-move page-move--left">
            <NcButton type="primary" :aria-label="sMoveLeft" :title="sMoveLeft" v-on:click="onMoveLeft">
                <template #icon>
                    <ChevronLeft :size="20" />
                </template>
            </NcButton>
        </div>
        <div v-if="editMode && !isLast" class="page-move page-move--right">
            <NcButton type="primary" :aria-label="sMoveRight" :title="sMoveRight" v-on:click="onMoveRight">
                <template #icon>
                    <ChevronRight :size="20" />
                </template>
            </NcButton>
        </div>
        <div v-if="editMode" class="page-edit-toolbar">
            <NcButton type="primary" v-on:click="onAddImage">
                <template #icon>
                    <Plus :size="20" />
                </template>
                {{ sAddImage }}
            </NcButton>
            <NcButton type="primary" v-on:click="onAddText">
                <template #icon>
                    <TextBoxPlusOutline :size="20" />
                </template>
                {{ sAddText }}
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
import TextBoxPlusOutline from 'vue-material-design-icons/TextBoxPlusOutline.vue'
import ViewDashboardVariantOutline from 'vue-material-design-icons/ViewDashboardVariantOutline.vue'
import ChevronLeft from 'vue-material-design-icons/ChevronLeft.vue'
import ChevronRight from 'vue-material-design-icons/ChevronRight.vue'
import { canCycleLayout } from '../utils/tilePageLayout.js'
import { isElementDrag, getElementDragData } from '../utils/elementDrag.js'

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
      "isLast": Boolean,
    },
    data: function() {
        return {
            "isFocus": false,
            "preloadScope": 5,
            "sAddImage": t("souvenirs","Add image"),
            "sAddText": t("souvenirs","Add text"),
            "sChangeLayout": t("souvenirs","Change layout"),
            "sAddPage": t("souvenirs","Add page"),
            "sMoveLeft": t("souvenirs","Move page left"),
            "sMoveRight": t("souvenirs","Move page right"),
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
        TextBoxPlusOutline,
        ViewDashboardVariantOutline,
        ChevronLeft,
        ChevronRight,
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
      onElementDrop: function(srcPageId, srcElementId, destElementId) {
        // Drop landed on one of this page's elements: re-emit with this page as
        // the destination so the album can swap (same page) or move (other page).
        this.$emit("element-drop", srcPageId, srcElementId, this.sId, destElementId);
      },
      onPageDragOver: function(event) {
        // preventDefault marks the page background as a valid drop target.
        if (this.editMode && isElementDrag(event)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      },
      onPageDrop: function(event) {
        // Drop on the page background (not on an element — those stop
        // propagation): move the element onto this page.
        if (!this.editMode || !isElementDrag(event)) {
          return;
        }
        event.preventDefault();
        var data = getElementDragData(event);
        if (data == null) {
          return;
        }
        this.$emit("element-drop", data.pageId, data.elementId, this.sId, null);
      },
      onAddImage: function() {
        // Ask the album to run the file picker and add an image to this page.
        this.$emit("add-image", this.sId);
      },
      onAddText: function() {
        // Ask the album to add a new (empty) text element to this page.
        this.$emit("add-text", this.sId);
      },
      onCycleLayout: function() {
        // Ask the album to switch this page to the next available layout.
        this.$emit("cycle-layout", this.sId);
      },
      onAddPageBefore: function() {
        // Insert a new page at this page's position (i.e. just before it).
        this.$emit("add-page", this.sNum);
      },
      onAddPageAfter: function() {
        // Insert a new page right after this (last) page.
        this.$emit("add-page", this.sNum + 1);
      },
      onMoveLeft: function() {
        this.$emit("move-page", this.sNum, -1);
      },
      onMoveRight: function() {
        this.$emit("move-page", this.sNum, 1);
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

/* Insert-page affordance: a "+" button at the top of a vertical line that sits
   on the seam between two pages. Zero width so it does not affect page layout;
   children opt back into pointer events. */
.page-insert {
  position: absolute;
  top: 0;
  height: 100%;
  width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 9;
  pointer-events: none;
  cursor: pointer;
}

.page-insert--before { left: 0; }
.page-insert--after { right: 0; }

/* Move-page arrows (NcButton), in the bottom corners of the page. */
.page-move {
  position: absolute;
  bottom: 16px;
  z-index: 9;
}

.page-move--left { left: 16px; }
.page-move--right { right: 16px; }

.page-insert__btn {
  pointer-events: all;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-top: 6px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--color-primary-element-text, #ffffff);
  background-color: var(--color-primary-element, #0082c9);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.page-insert:hover .page-insert__btn,
.page-insert:hover .page-insert__line {
  filter: brightness(0.9);
}

.page-insert__line {
  pointer-events: all;
  flex: 1 1 auto;
  width: 3px;
  background-color: var(--color-primary-element, #0082c9);
  opacity: 0.85;
}
</style>