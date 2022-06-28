<template>
    <div class="s-page" v-bind:id="sId">
	<selement v-for="(element, index) in elements" v-bind:s-id="element.id" v-bind:s-top="element.top"
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
                v-on:imagefull="openImgFull" v-on:videofull="openVideoFull">
	</selement>
    </div>
</template>

<script>

import Selement from "./selement"

export default {
    props: {
      "sId": String,
      "sNum": Number,
      'displayedPage': Number,
      "elements": Array,
      "albumPath": String,
      "token": String,
    },
    data: function() {
        return {
            "isFocus": false,
        }
    },
    computed: {
        "pagePreload": function() {
          if (Math.abs(this.displayedPage - this.sNum) < 3) {
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
            //scroll to page
            var albumEl = $("#"+this.sId).parent();
            albumEl.animate(
              { scrollLeft: albumEl.scrollLeft() + $("#"+this.sId).offset().left - (albumEl.width() - albumEl.height())/2 },
              500);
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
    var elements = $('.resize');
    if(elements.length < 0) {
      return;
    }
    elements.each(function(i, element) {
      while(element.scrollWidth > element.offsetWidth || element.scrollHeight > element.offsetHeight) {
        var newFontSize = (parseFloat($(element).css('font-size').slice(0, -2)) * 0.95) + 'px';
        $(element).css('font-size', newFontSize);
        $(element).css('line-height', newFontSize);
      }
    });
  };

function elementInViewport(el) {
  var top = el.offsetTop;
  var left = el.offsetLeft;
  var width = el.offsetWidth;
  var height = el.offsetHeight;

  while(el.offsetParent) {
    el = el.offsetParent;
    top += el.offsetTop;
    left += el.offsetLeft;
  }

  return (
    top < (window.pageYOffset + window.innerHeight) &&
    left < (window.pageXOffset + window.innerWidth) &&
    (top + height) > window.pageYOffset &&
    (left + width) > window.pageXOffset
  );
}
</script>

<style scoped>

.s-page {
  height: calc(100vmin - 50px);
  width: calc(100vmin - 50px);
  display: inline-block;
  position: relative;
}
</style>