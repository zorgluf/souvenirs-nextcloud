<template>
    <NcModal size="large" :name="sPaintPage" @close="$emit('close')">
        <div class="paint-dialog">
            <div class="paint-stage">
                <!-- Live, non-interactive rendering of the page being painted, so the
                     user draws over what the page actually looks like. The existing
                     paint overlay is excluded: its PNG is loaded into the canvas
                     instead (drawing continues on it). displayed-page != s-num keeps
                     the page unfocused (no video autoplay / photosphere rotation)
                     while still preloading its images. -->
                <page :s-id="'paintbg-' + pageId" :s-num="0" :displayed-page="1"
                    :elements="backgroundElements" :album-path="albumPath" token=""
                    :is-win-portrait="true" :element-margin="elementMargin"
                    :edit-mode="false" :is-last="true">
                </page>
                <canvas ref="canvas" class="paint-canvas"
                    v-on:pointerdown="onPointerDown" v-on:pointermove="onPointerMove"
                    v-on:pointerup="onPointerUp" v-on:pointercancel="onPointerCancel">
                </canvas>
            </div>
            <div class="paint-toolbar">
                <!-- `pressed` marks the active tool: darker (primary) face and
                     aria-pressed for accessibility. The click handlers act as a
                     radio group, so update:pressed is intentionally not bound
                     (clicking the active tool must not un-press it). -->
                <NcButton :pressed="tool === 'pen'"
                    :aria-label="sPen" :title="sPen" v-on:click="tool = 'pen'">
                    <template #icon>
                        <Brush :size="20" />
                    </template>
                </NcButton>
                <NcButton :pressed="tool === 'eraser'"
                    :aria-label="sEraser" :title="sEraser" v-on:click="tool = 'eraser'">
                    <template #icon>
                        <Eraser :size="20" />
                    </template>
                </NcButton>
                <NcColorPicker v-model="color" v-model:open="colorOpen">
                    <NcButton :aria-label="sColor" :title="sColor">
                        <template #icon>
                            <Palette :size="20" />
                        </template>
                        <span class="paint-color-swatch" :style="{ backgroundColor: color }"></span>
                    </NcButton>
                </NcColorPicker>
                <div class="paint-toolbar-spacer"></div>
                <NcButton :disabled="saving" v-on:click="$emit('close')">
                    {{ sCancel }}
                </NcButton>
                <NcButton variant="primary" :disabled="saving" v-on:click="onConfirm">
                    <template #icon>
                        <NcLoadingIcon v-if="saving" :size="20" />
                        <Check v-else :size="20" />
                    </template>
                    {{ sConfirm }}
                </NcButton>
            </div>
        </div>
    </NcModal>
</template>

<script>

import Page from './page.vue'
import { NcModal, NcButton, NcColorPicker, NcLoadingIcon } from '@nextcloud/vue'
import Brush from 'vue-material-design-icons/Brush.vue'
import Eraser from 'vue-material-design-icons/Eraser.vue'
import Palette from 'vue-material-design-icons/Palette.vue'
import Check from 'vue-material-design-icons/Check.vue'
import { getPaintElement } from '../utils/albumEdit.js'
import { showError, showWarning } from '@nextcloud/dialogs'
import { penStart, penMove, penEnd, drawPenSegment, erase, hasInk } from '../utils/paintBrush.js'

export default {
    props: {
        "pageId": String,
        // The full elements array of the page (paint element included).
        "elements": Array,
        "albumPath": String,
        "elementMargin": Number,
        // True while the album is uploading/persisting the confirmed drawing;
        // freezes the buttons so it cannot be confirmed twice.
        "saving": Boolean,
    },
    emits: ['close', 'confirm'],
    data: function() {
        return {
            "tool": "pen",
            "color": "#000000",
            // Open state of the color-picker popover, controlled so it can be
            // closed as soon as a color is picked.
            "colorOpen": false,
            "sPaintPage": t("souvenirs", "Paint on page"),
            "sPen": t("souvenirs", "Pen"),
            "sEraser": t("souvenirs", "Eraser"),
            "sColor": t("souvenirs", "Pen color"),
            "sCancel": t("souvenirs", "Cancel"),
            "sConfirm": t("souvenirs", "Confirm"),
        }
    },
    components: {
        page: Page,
        NcModal,
        NcButton,
        NcColorPicker,
        NcLoadingIcon,
        Brush,
        Eraser,
        Palette,
        Check,
    },
    computed: {
        'paintElement': function() {
            return getPaintElement({ elements: this.elements });
        },
        'backgroundElements': function() {
            // The paint element is edited in the canvas, not shown behind it; the
            // other elements get prefixed ids so the DOM ids (video/photosphere
            // containers) cannot collide with the real page rendered behind the modal.
            return (this.elements || [])
                .filter(element => element !== this.paintElement)
                .map(element => ({ ...element, id: 'paintbg-' + element.id }));
        },
    },
    watch: {
        "color": function() {
            // Picking a color is a one-shot action: close the picker right away.
            this.colorOpen = false;
        },
    },
    created: function() {
        // Plain properties, not data(): the in-flight stroke state is internal
        // to the pointer handlers, not rendered.
        this.stroke = null;
        this.activePointer = null;
        this.pointScale = 1;
    },
    mounted: function() {
        var canvas = this.$refs.canvas;
        // Fixed high-resolution backing store, independent of the modal's layout
        // (which may not be settled yet inside the teleported/animated NcModal)
        // and of later window resizes: pointer positions are mapped against the
        // rendered box at event time instead.
        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;
        // Painting again on this page: continue on the existing drawing.
        if (this.paintElement != null && this.paintElement.image) {
            this.loadExistingDrawing(canvas);
        }
    },
    methods: {
        // Fetch the current paint PNG and paint it into the canvas. The bytes
        // are fetched directly and decoded with createImageBitmap, which sniffs
        // the actual image format from the content — the response's declared
        // Content-Type (derived server-side from the file extension, sometimes
        // wrong) cannot block the load, unlike an <img>/Image() under
        // Nextcloud's nosniff policy. Failures surface with the HTTP status.
        loadExistingDrawing: async function(canvas) {
            // albumPath is passed through raw, like in every other component:
            // the value from the route query is already percent-encoded, so
            // encoding it again would double-encode the slashes and make the
            // server look up a folder that does not exist. The size busts the
            // HTTP cache: re-painting overwrites the PNG under the same path.
            var url = 'asset?apath=' + this.albumPath
                + '&file=' + basename(this.paintElement.image)
                + '&v=' + (this.paintElement.size || 0);
            try {
                var response = await fetch(url, {
                    headers: { 'requesttoken': OC.requestToken },
                });
                if (response.status === 404) {
                    // The element points at a PNG that is gone (e.g. saved by an
                    // old client whose upload failed): start from a blank canvas;
                    // the next confirm re-creates the asset and heals the element.
                    console.warn('souvenirs: paint asset missing on the server, starting blank: '
                        + this.paintElement.image);
                    showWarning(t("souvenirs","The previous drawing is missing on the server, starting with a blank page."));
                    return;
                }
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                var blob = await response.blob();
                var bitmap = await decodeImageBlob(blob);
                canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            } catch (error) {
                console.error('souvenirs: could not load the existing paint drawing '
                    + this.paintElement.image, error);
                showError(t("souvenirs","Could not load the existing drawing.")
                    + ' (' + (error && error.message ? error.message : error) + ')');
            }
        },
        // Pointer position in canvas pixels, plus the canvas-px-per-CSS-px scale
        // (pen/eraser widths are defined in on-screen pixels, as on Android).
        // Null when the canvas has no rendered box (mid-transition).
        canvasPoint: function(event) {
            var canvas = this.$refs.canvas;
            var rect = canvas.getBoundingClientRect();
            if (!(rect.width > 0) || !(rect.height > 0)) {
                return null;
            }
            return {
                x: (event.clientX - rect.left) * canvas.width / rect.width,
                y: (event.clientY - rect.top) * canvas.height / rect.height,
                scale: canvas.width / rect.width,
            };
        },
        onPointerDown: function(event) {
            // Only the primary button draws (no right/middle-click strokes).
            if (this.activePointer != null || (event.button != null && event.button !== 0)) {
                return;
            }
            event.preventDefault();
            var p = this.canvasPoint(event);
            if (p == null) {
                return;
            }
            this.activePointer = event.pointerId;
            this.pointScale = p.scale;
            if (event.target.setPointerCapture) {
                event.target.setPointerCapture(event.pointerId);
            }
            if (this.tool === 'eraser') {
                erase(this.ctx(), p.x, p.y, p.scale);
            } else {
                this.stroke = penStart(p.x, p.y);
            }
        },
        onPointerMove: function(event) {
            if (event.pointerId !== this.activePointer) {
                return;
            }
            event.preventDefault();
            var p = this.canvasPoint(event);
            if (p == null) {
                return;
            }
            if (this.tool === 'eraser') {
                erase(this.ctx(), p.x, p.y, p.scale);
            } else if (this.stroke != null) {
                var move = penMove(this.stroke, p.x, p.y);
                this.stroke = move.state;
                if (move.segment != null) {
                    drawPenSegment(this.ctx(), move.segment, this.color, p.scale);
                }
            }
        },
        onPointerUp: function(event) {
            if (event.pointerId !== this.activePointer) {
                return;
            }
            this.activePointer = null;
            if (this.stroke != null) {
                drawPenSegment(this.ctx(), penEnd(this.stroke), this.color, this.pointScale);
                this.stroke = null;
            }
        },
        onPointerCancel: function(event) {
            if (event.pointerId !== this.activePointer) {
                return;
            }
            this.activePointer = null;
            this.stroke = null;
        },
        ctx: function() {
            return this.$refs.canvas.getContext('2d');
        },
        onConfirm: function() {
            if (this.saving) {
                return;
            }
            var canvas = this.$refs.canvas;
            // A drawing without any visible pixel means "no overlay": confirmed
            // as null, so the album removes the paint element instead of saving
            // an all-transparent PNG.
            if (!hasInk(this.ctx(), canvas.width, canvas.height)) {
                this.$emit('confirm', null);
                return;
            }
            canvas.toBlob((blob) => {
                if (blob != null) {
                    this.$emit('confirm', blob);
                }
            }, 'image/png');
        },
    },
}

// Backing-store side of the (square) drawing canvas: high enough to stay crisp
// full-screen, matching the resolution class of Android-produced paint PNGs.
const CANVAS_SIZE = 1080;

function basename(path) {
    return path.split('/').reverse()[0];
}

// Decode image bytes into something drawImage accepts. createImageBitmap is
// the content-sniffing path (see loadExistingDrawing); the object-URL Image is
// a fallback for browsers without it.
function decodeImageBlob(blob) {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(blob);
    }
    return new Promise((resolve, reject) => {
        var objectUrl = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('undecodable image')); };
        img.src = objectUrl;
    });
}

</script>

<style scoped>

.paint-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
}

/* The square page replica; sized so it fits the modal on any screen. */
.paint-stage {
    position: relative;
    width: min(70vmin, 100%);
    aspect-ratio: 1 / 1;
    margin: 0 auto;
    background-color: var(--color-main-background, #ffffff);
    outline: 1px solid var(--color-border, #dddddd);
}

/* The drawing surface, covering the page replica. Above every element layer of
   the page (video is z-index 5) so it receives all pointer input.
   touch-action: none keeps touch gestures from scrolling instead of drawing. */
.paint-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 7;
    cursor: crosshair;
    touch-action: none;
}

.paint-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
}

.paint-toolbar-spacer {
    flex: 1 1 auto;
}

/* Current pen color, shown inside the color picker trigger button. */
.paint-color-swatch {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--color-border-dark, #999999);
}

</style>
