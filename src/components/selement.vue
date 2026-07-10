<template>
    <div ref="eldiv" v-bind:class="['s-element', ((sClass.endsWith('ImageElement') || sClass.endsWith('VideoElement')) && sZoom < 100) ? 'blur-back' : '',
    { 's-element--draggable': isDraggable, 's-element--dragging': isDragging, 's-element--dragover': isDragOver }]"
    v-bind:id="sId"
    v-bind:draggable="isDraggable && !dragSuppressed"
    v-on:mousedown="onRootMouseDown"
    v-on:dragstart="onDragStart" v-on:dragend="onDragEnd"
    v-on:dragenter="onDragEnter" v-on:dragleave="onDragLeave"
    v-on:dragover="onDragOver" v-on:drop="onDrop"
    v-bind:style="rootStyle">
		<button v-if="editMode && isRemovable" class="s-element-delete" :title="removeTitle" v-on:click.stop="onRemove">
			<Delete :size="20" />
		</button>
		<NcButton v-if="isDraggable" class="s-element-drag-handle" type="primary"
			:aria-label="sDragToMove" :title="sDragToMove">
			<template #icon>
				<CursorMove :size="20" />
			</template>
		</NcButton>
		<template v-if="isResizable">
			<div v-for="corner in resizeCorners" v-bind:key="'resize-'+corner"
				v-bind:class="['s-element-resize-handle', 's-element-resize-handle--'+corner]"
				:title="sDragToResize"
				v-on:pointerdown="onResizeStart($event, corner)"
				v-on:pointermove="onResizeMove"
				v-on:pointerup="onResizeEnd"
				v-on:pointercancel="onResizeCancel"></div>
		</template>
		<EditableText v-if="sText || editMode" class="s-element-text resize"
			:value="sText" :editable="editMode" :auto-fit="true"
			@save="onTextSave" />
        <video v-bind:id="sId+'video'" v-if="sClass.endsWith('VideoElement')" v-on:click="openVideo"
            v-bind:class="['video-element', sZoom == 100 ? 'centercrop' : 'fill' ]" 
            loop="true" preload="auto" :key="videoUrlSrc"
            v-on:waiting="waitingVideo" v-on:canplay="playingVideo" v-on:loadstart="waitingVideo">
            <source v-bind:src="videoUrlSrc">
        </video>
        <div v-if="sImageSrc == null && (sClass.endsWith('ImageElement') || sClass.endsWith('VideoElement'))">
            <NcLoadingIcon :size="64"></NcLoadingIcon>
        </div>
        
		<img id="image_element" v-bind:style="imageStyle" v-bind:class="['image-element', isImgCenterCrop ? 'centercrop' : '', isImgFill ? 'fill' : '' ]"
        v-if="sImage != '' && (sClass.endsWith('ImageElement') || sClass.endsWith('VideoElement'))"
        v-bind:src="sImageSrc" v-on:click="openImgFull" v-bind:draggable="!editMode" />
        <img v-bind:class="['paint-element', isImgCenterCrop ? 'centercrop' : '', isImgFill ? 'fill' : '' ]" v-if="sImage != '' && sClass.endsWith('PaintElement')" v-bind:src="sImageSrc" v-bind:draggable="!editMode"/>
        <div v-if="sMime == 'application/vnd.google.panorama360+jpg'" class="image-element-pano-icon"/>
        <div v-if="sVideo != null" class="image-element-video-icon"/>
        <!-- In edit mode the tile takes pointer-events:all (drag and drop), which
             would make this whole-tile overlay swallow clicks meant for the
             caption editor below it: keep it click-through while editing. -->
        <div v-bind:id="'pano-'+sId" v-bind:style="'position:absolute;top:0;left:0;width: 100%;height: 100%;' + (editMode ? 'pointer-events:none;' : '')"/>
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

import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import { AutorotatePlugin } from '@photo-sphere-viewer/autorotate-plugin';
import { VisibleRangePlugin } from '@photo-sphere-viewer/visible-range-plugin';
import { NcLoadingIcon, NcButton } from '@nextcloud/vue'
import { imagePath } from '@nextcloud/router'
import EditableText from './EditableText.vue'
import Delete from 'vue-material-design-icons/Delete.vue'
import CursorMove from 'vue-material-design-icons/CursorMove.vue'
import { setElementDragData, isElementDrag, getElementDragData } from '../utils/elementDrag.js'

export default {
    props: {
      "sId": String,
      // Id of the page hosting this element, needed as the drag payload source.
      "sPageId": String,
      "editMode": Boolean,
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
      "elementMargin": Number,
    },
    data: function() {
        return {
            "sImageSrc": "",
            "videoUrlSrc": null,
            "loadingImage": null,
            "imageStyle": {},
            "isVideoLoading": false,
            "isDragging": false,
            "isDragOver": false,
            // True while the current press started inside the caption editor:
            // the tile must not be draggable then, otherwise the browser
            // suppresses caret placement / text selection in the contenteditable.
            "dragSuppressed": false,
            "sDragToMove": t("souvenirs","Drag to move"),
            "sDragToResize": t("souvenirs","Drag to resize"),
            "resizeCorners": ['nw', 'ne', 'sw', 'se'],
            // State of the corner drag in progress (pointer id, start position,
            // page size in px, original geometry), null when not resizing.
            "resizing": null,
            // Geometry shown while a corner is being dragged; the committed
            // props (sTop/...) take over again once the resize is released.
            "resizePreview": null,
            // dragenter/dragleave also fire when moving over children, so the
            // drag-over highlight is tracked with an enter/leave counter.
            "dragOverCount": 0,
        }
    },
    components: {
        NcLoadingIcon,
        NcButton,
        EditableText,
        Delete,
        CursorMove,
    },
    watch: {
        "geometryKey": function() {
            // The page can be re-laid-out (e.g. after adding/removing an image),
            // which resizes this element's box. A zoom/offset cover-fit is computed
            // from the box size at load time, so recompute it on resize, otherwise
            // the image would keep a stale transform and letterbox in its new cell.
            if (this.loadingImage != null && this.loadingImage.complete
                && (this.sClass == 'ImageElement' || this.sClass == 'VideoElement')
                && this.sTransformType == IMG_ZOOMOFFSET) {
                this.$nextTick(() => {
                    this.imageStyle = getImageZoomOffsetStyle(this.sZoom, this.sOffsetX, this.sOffsetY,
                        this.$refs.eldiv.clientWidth, this.$refs.eldiv.clientHeight,
                        this.loadingImage.width, this.loadingImage.height);
                });
            }
        },
        "preload": function(newPreload, oldPreload) {
            if (newPreload != oldPreload) {
                if (this.preload && this.loadingImage==null) {
                    this.loadImage();
                }
            }
        },
        "isFocus": function(newFocus,oldFocus) {
            if (this.autorotate != null && this.panoReady) {
                if (newFocus) {
                    this.autorotate.start();
                } else {
                    this.autorotate.stop();
                }
            }
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
            // Plain properties, not data(): wrapping the Photo Sphere Viewer
            // plugin in a reactive proxy is useless and fragile.
            this.autorotate = null;
            this.panoReady = false;
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
        'geometryKey': function() {
            return [this.sTop, this.sBottom, this.sLeft, this.sRight].join(',');
        },
        'isRemovable': function() {
            // Media tiles (image / video / paint) and text elements can be removed.
            return this.sClass != null && (this.sClass.endsWith('ImageElement')
                || this.sClass.endsWith('VideoElement')
                || this.sClass.endsWith('PaintElement')
                || this.sClass.endsWith('TextElement'));
        },
        'isDraggable': function() {
            // The same visible tiles that can be removed can be dragged (Audio
            // and unknown elements have no visual box to grab).
            return this.editMode && this.isRemovable;
        },
        'isResizable': function() {
            // Any tile that can be dragged can also be resized (issue #20).
            return this.isDraggable;
        },
        'displayGeometry': function() {
            // Live preview while a corner is being dragged, committed props otherwise.
            return this.resizePreview != null ? this.resizePreview
                : { top: this.sTop, bottom: this.sBottom, left: this.sLeft, right: this.sRight };
        },
        'rootStyle': function() {
            var g = this.displayGeometry;
            return 'top:' + (g.top + this.elementMargin) + '%;left:' + (g.left + this.elementMargin)
                + '%;width:' + (g.right - g.left - 2 * this.elementMargin)
                + '%;height:' + (g.bottom - g.top - 2 * this.elementMargin)
                + "%;--image-src-url:url('" + this.sImageSrc + "')";
        },
        'removeTitle': function() {
            return (this.sClass != null && this.sClass.endsWith('TextElement'))
                ? t("souvenirs","Remove text")
                : t("souvenirs","Remove image");
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
                    loadingImg: imagePath('souvenirs','loading.gif'),
                    // false, not []: an empty list still renders the translucent bar.
                    navbar: false,
                    plugins: [
                        AutorotatePlugin.withConfig({
                            // Rotation is driven by page focus (see the isFocus
                            // watcher), not by the plugin's own autostart/idle timers.
                            autostartDelay: null,
                            autostartOnIdle: false,
                        }),
                        VisibleRangePlugin.withConfig({
                            usePanoData: true,
                        }),
                     ],
                });
                this.autorotate = pano.getPlugin(AutorotatePlugin);
                pano.addEventListener('ready', () => {
                    this.panoReady = true;
                    if (this.isFocus) {
                        this.autorotate.start();
                    }
                }, { once: true });
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
        onTextSave: function(newText) {
            // Bubble the caption change up with this element's id so the album
            // can patch and persist it (sId is the element id here).
            this.$emit("edit-text", this.sId, newText);
        },
        onRemove: function() {
            // Bubble the removal up with this element's id (sId).
            this.$emit("remove-element", this.sId);
        },
        onRootMouseDown: function(event) {
            // Decide per-press whether the tile is draggable: a press inside the
            // caption editor must edit text, not start a drag. The browser makes
            // the selection-vs-drag call during this very mousedown's default
            // action, before Vue's async attribute patch would land, so the
            // attribute is also updated synchronously here.
            this.dragSuppressed = !!(event.target && event.target.isContentEditable);
            if (this.$refs.eldiv) {
                this.$refs.eldiv.setAttribute("draggable", String(this.isDraggable && !this.dragSuppressed));
            }
        },
        onResizeStart: function(event, corner) {
            if (!this.isResizable || this.resizing != null) {
                return;
            }
            // The press belongs to the resize: keep it from starting an HTML5
            // drag of the tile and from reaching onRootMouseDown.
            event.preventDefault();
            event.stopPropagation();
            var page = this.$refs.eldiv ? this.$refs.eldiv.parentElement : null;
            if (page == null) {
                return;
            }
            // Element geometry is in page percentages, so pointer deltas are
            // converted against the page box (the element's positioned parent).
            var rect = page.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return;
            }
            this.resizing = {
                corner: corner,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                pageWidth: rect.width,
                pageHeight: rect.height,
                orig: { top: this.sTop, bottom: this.sBottom, left: this.sLeft, right: this.sRight },
            };
            // Route the whole gesture to the handle, even when the pointer
            // leaves it (or the element) while dragging.
            if (event.target.setPointerCapture) {
                event.target.setPointerCapture(event.pointerId);
            }
        },
        onResizeMove: function(event) {
            if (this.resizing == null || event.pointerId !== this.resizing.pointerId) {
                return;
            }
            this.resizePreview = resizedGeometry(this.resizing, event.clientX, event.clientY);
        },
        onResizeEnd: function(event) {
            if (this.resizing == null || event.pointerId !== this.resizing.pointerId) {
                return;
            }
            var geometry = resizedGeometry(this.resizing, event.clientX, event.clientY);
            var orig = this.resizing.orig;
            this.resizing = null;
            this.resizePreview = null;
            if (geometry.top !== orig.top || geometry.bottom !== orig.bottom
                || geometry.left !== orig.left || geometry.right !== orig.right) {
                // Bubble the new geometry up with this element's id so the
                // album can patch and persist it (sId is the element id here).
                this.$emit("resize-element", this.sId, geometry);
            }
        },
        onResizeCancel: function(event) {
            if (this.resizing == null || event.pointerId !== this.resizing.pointerId) {
                return;
            }
            this.resizing = null;
            this.resizePreview = null;
        },
        onDragStart: function(event) {
            if (!this.isDraggable || this.dragSuppressed || this.resizing != null) {
                event.preventDefault();
                return;
            }
            // A drag starting inside the caption editor is the browser dragging
            // selected text: leave it to the native behavior (our drop targets
            // ignore it, as it does not carry the element payload).
            if (event.target && event.target.isContentEditable) {
                return;
            }
            setElementDragData(event, this.sPageId, this.sId);
            this.isDragging = true;
        },
        onDragEnd: function() {
            this.isDragging = false;
        },
        onDragEnter: function(event) {
            if (!this.editMode || !isElementDrag(event)) {
                return;
            }
            this.dragOverCount += 1;
            this.isDragOver = !this.isDragging;
        },
        onDragLeave: function(event) {
            if (!this.editMode || !isElementDrag(event)) {
                return;
            }
            this.dragOverCount -= 1;
            if (this.dragOverCount <= 0) {
                this.dragOverCount = 0;
                this.isDragOver = false;
            }
        },
        onDragOver: function(event) {
            // preventDefault marks this element as a valid drop target.
            if (this.editMode && isElementDrag(event)) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
            }
        },
        onDrop: function(event) {
            this.dragOverCount = 0;
            this.isDragOver = false;
            if (!this.editMode || !isElementDrag(event)) {
                return;
            }
            event.preventDefault();
            // Do not let the page treat this as a drop on its background.
            event.stopPropagation();
            var data = getElementDragData(event);
            if (data == null) {
                return;
            }
            // Bubble up: source (page, element) + this element as drop target.
            this.$emit("element-drop", data.pageId, data.elementId, this.sId);
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

// Tiles cannot be resized below this, so the corner handles stay grabbable
// (in page percentages, i.e. 5% of the page side).
const MIN_ELEMENT_SIZE_PCT = 5;

// Geometry (in page percentages) of an ongoing corner resize: the two edges
// meeting at the grabbed corner follow the pointer, clamped to the page bounds
// and to the minimum tile size; the opposite edges stay put.
function resizedGeometry(resizing, clientX, clientY) {
    var dx = (clientX - resizing.startX) * 100 / resizing.pageWidth;
    var dy = (clientY - resizing.startY) * 100 / resizing.pageHeight;
    var g = {
        top: resizing.orig.top,
        bottom: resizing.orig.bottom,
        left: resizing.orig.left,
        right: resizing.orig.right,
    };
    if (resizing.corner === 'nw' || resizing.corner === 'ne') {
        g.top = clampPct(resizing.orig.top + dy, 0, g.bottom - MIN_ELEMENT_SIZE_PCT);
    } else {
        g.bottom = clampPct(resizing.orig.bottom + dy, g.top + MIN_ELEMENT_SIZE_PCT, 100);
    }
    if (resizing.corner === 'nw' || resizing.corner === 'sw') {
        g.left = clampPct(resizing.orig.left + dx, 0, g.right - MIN_ELEMENT_SIZE_PCT);
    } else {
        g.right = clampPct(resizing.orig.right + dx, g.left + MIN_ELEMENT_SIZE_PCT, 100);
    }
    return g;
}

function clampPct(value, min, max) {
    if (max < min) {
        // A tile already smaller than the minimum (e.g. hand-written album.json)
        // can only grow, never shrink further.
        max = min;
    }
    return Math.round(Math.min(Math.max(value, min), max) * 100) / 100;
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

/* Draggable tiles (edit mode) must receive pointer/drag events; the base
   .s-element disables them (children normally opt back in). */
.s-element--draggable {
	pointer-events: all;
	cursor: grab;
}

/* The tile being dragged: ghost it so the user sees it is in flight. */
.s-element--dragging {
	opacity: 0.4;
}

/* Grab handle, mirroring the delete button in the opposite corner. It floats
   above the caption editor (which fills the whole cell on text tiles), so text
   elements stay draggable even though a press inside the editor never drags.
   It is a primary NcButton so its face (color, hover) is exactly the one of the
   other edit buttons ("Add image", ...); only placement is set here. */
.s-element-drag-handle {
	position: absolute;
	top: 6px;
	left: 6px;
	z-index: 8;
	pointer-events: all;
}

.s-element-drag-handle,
.s-element-drag-handle :deep(*) {
	cursor: grab;
}

/* Corner resize handles (edit mode). Above the drag/delete buttons (z 8) so
   the small overlap in the top corners resolves to the resize cursor; inside
   the tile because .s-element clips its overflow. touch-action:none keeps the
   browser from turning the pointer gesture into a scroll on touch screens. */
.s-element-resize-handle {
	position: absolute;
	width: 16px;
	height: 16px;
	z-index: 9;
	/* The element wrapper disables pointer events; handles must opt back in. */
	pointer-events: all;
	touch-action: none;
	background-color: var(--color-primary-element, #0082c9);
	border: 2px solid var(--color-primary-element-text, #ffffff);
	border-radius: 3px;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	opacity: 0.9;
}

.s-element-resize-handle:hover {
	opacity: 1;
}

.s-element-resize-handle--nw { top: 0; left: 0; cursor: nwse-resize; }
.s-element-resize-handle--ne { top: 0; right: 0; cursor: nesw-resize; }
.s-element-resize-handle--sw { bottom: 0; left: 0; cursor: nesw-resize; }
.s-element-resize-handle--se { bottom: 0; right: 0; cursor: nwse-resize; }

/* Valid drop target under the dragged tile. Inset dashed frame (the tile clips
   its overflow, so an offset outline would be cut on the page edges). */
.s-element--dragover {
	outline: 3px dashed var(--color-primary-element, #0082c9);
	outline-offset: -3px;
}

.s-element-delete {
	position: absolute;
	top: 6px;
	right: 6px;
	z-index: 8;
	/* The element wrapper disables pointer events; the button must opt back in. */
	pointer-events: all;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	padding: 0;
	border: none;
	border-radius: 50%;
	cursor: pointer;
	color: #ffffff;
	/* Solid red: the theme's --color-error is a pale background tint (#FFE7E7),
	   not a bold red, so it is intentionally not used here. */
	background-color: #e9322d;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	/* Slightly translucent so it reads as a subtle overlay; full strength on hover. */
	opacity: 0.8;
}

.s-element-delete:hover {
	background-color: #c4231d;
	opacity: 1;
}

.s-element-text {
	font-size: 1000px;
	/* Fill the cell directly: as a flex item of .s-element, width/height:100%
	   gets shrunk/grown unreliably, which mis-sized the editable box and clipped
	   its border. Absolute positioning with explicit 100% size matches the cell. */
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	hyphens: auto;
	display: flex;
	align-items: center;
	justify-content: center;
	text-align: center;
    white-space: pre-wrap;
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
