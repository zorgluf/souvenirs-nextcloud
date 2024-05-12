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
                v-bind:element-margin="elementMargin">
	</selement>
    </div>
</template>

<script>

import Selement from "./selement.vue"

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
    },
    data: function() {
        return {
            "isFocus": false,
            "preloadScope": 5,
        }
    },
    computed: {
        "pagePreload": function() {
          if (Math.abs(this.displayedPage - this.sNum) < this.preloadScope) {
            return true;
          } else {
            return false;
          }
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
    },
    methods: {
      openImgFull: function(imageUrl,isPhotosphere) {
        this.$emit("imagefull",imageUrl,isPhotosphere);
      },
      openVideoFull: function(videoUrl) {
        this.$emit("videofull",videoUrl);
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
</style>