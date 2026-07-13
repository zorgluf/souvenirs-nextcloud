/**
 * Pure, framework-free math for the in-place pan & zoom of image elements
 * (issue #27), matching the rendering done by getImageZoomOffsetStyle in
 * selement.vue (itself matching the Android app's zoom/offset transform):
 *
 *   rendered position of image point q (px, element-box coordinates):
 *     P(q) = z * ((boxSize - coverSize) / 2 + offsetPx + q)
 *
 * where z = zoom / 100, coverSize is the image size cover-fitted to the box at
 * zoom 100, and offsetPx = offset% * boxSize / 100. In other words the layout
 * is the centered cover-fit shifted by the offsets, scaled by the zoom about
 * the box's top-left corner. The helpers below invert that mapping so pointer
 * deltas (px) become offset/zoom deltas (album.json percent units).
 *
 * All functions take:
 *   state - { zoom, offsetX, offsetY } in album.json units (percents)
 *   box   - { width, height } of the element box, in px
 *   img   - { width, height } natural size of the image, in px
 * and never mutate their arguments.
 */

// The zoom the user can set by gesture, in album.json percent units
// (100 = cover-fit). Below 100 the tile shows the blurred backdrop.
export const ZOOM_MIN = 10
export const ZOOM_MAX = 1000

const IMG_FILL = 0
const IMG_ZOOMOFFSET = 2

/**
 * Displayed size of the image at zoom 100: cover-fitted to the box (scaled by
 * max(widthScale, heightScale), so one dimension equals the box and the other
 * overflows).
 */
function coverSize(box, img) {
    const scale = Math.max(box.width / img.width, box.height / img.height)
    return { width: img.width * scale, height: img.height * scale }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
}

/**
 * Clamp a state to the allowed zoom range and to offsets that keep the image
 * at least touching the box (so it can never be panned fully out of view).
 * Bounds, from P(q) above: the image's leading edge must not pass the box's
 * trailing edge (offsetPx <= boxSize/z - (boxSize-cover)/2) and its trailing
 * edge must not pass the box's leading edge (offsetPx >= -(boxSize+cover)/2).
 */
function clampState(state, box, img) {
    const zoom = clamp(state.zoom, ZOOM_MIN, ZOOM_MAX)
    const z = zoom / 100
    const cover = coverSize(box, img)
    const minX = -(box.width + cover.width) / 2 * 100 / box.width
    const maxX = (box.width / z - (box.width - cover.width) / 2) * 100 / box.width
    const minY = -(box.height + cover.height) / 2 * 100 / box.height
    const maxY = (box.height / z - (box.height - cover.height) / 2) * 100 / box.height
    return {
        zoom: zoom,
        offsetX: clamp(state.offsetX, minX, maxX),
        offsetY: clamp(state.offsetY, minY, maxY),
    }
}

/**
 * The pan/zoom state a gesture starts from, for any of the three transform
 * types. Zoom-offset elements keep their stored values; center-crop is exactly
 * zoom-offset at (100, 0, 0); fill (contain) converts to the equivalent
 * zoom-offset zoom (100 * containScale / coverScale), so switching the element
 * to zoom-offset on the first gesture does not visually jump.
 *
 * @param {{transformType: number, zoom: number, offsetX: number, offsetY: number}} element
 * @param {{width: number, height: number}} box
 * @param {{width: number, height: number}} img
 * @returns {{zoom: number, offsetX: number, offsetY: number}}
 */
export function initialPanZoom(element, box, img) {
    if (element.transformType === IMG_ZOOMOFFSET) {
        return clampState({
            zoom: Number.isFinite(element.zoom) && element.zoom > 0 ? element.zoom : 100,
            offsetX: Number.isFinite(element.offsetX) ? element.offsetX : 0,
            offsetY: Number.isFinite(element.offsetY) ? element.offsetY : 0,
        }, box, img)
    }
    if (element.transformType === IMG_FILL) {
        const contain = Math.min(box.width / img.width, box.height / img.height)
        const cover = Math.max(box.width / img.width, box.height / img.height)
        return clampState({ zoom: 100 * contain / cover, offsetX: 0, offsetY: 0 }, box, img)
    }
    // IMG_CENTERCROP (and anything unknown): plain cover-fit.
    return { zoom: 100, offsetX: 0, offsetY: 0 }
}

/**
 * Pan the image so it follows a pointer that moved by `delta` px: the rendered
 * layout is scaled by z about the box origin, so a 1px pointer move is a 1/z px
 * offset move.
 *
 * @param {{zoom: number, offsetX: number, offsetY: number}} state
 * @param {{x: number, y: number}} delta - pointer movement in px
 * @param {{width: number, height: number}} box
 * @param {{width: number, height: number}} img
 * @returns {{zoom: number, offsetX: number, offsetY: number}} the panned state
 */
export function panBy(state, delta, box, img) {
    const z = state.zoom / 100
    return clampState({
        zoom: state.zoom,
        offsetX: state.offsetX + delta.x * 100 / (z * box.width),
        offsetY: state.offsetY + delta.y * 100 / (z * box.height),
    }, box, img)
}

/**
 * Multiply the zoom by `factor`, keeping the image point currently under
 * `anchor` (px, box coordinates — e.g. the mouse cursor or the pinch midpoint)
 * fixed on screen: solving P(q) = anchor for both zooms gives
 * offsetPx' = offsetPx + anchor * (1/z' - 1/z).
 *
 * @param {{zoom: number, offsetX: number, offsetY: number}} state
 * @param {number} factor - multiplicative zoom change (>1 zooms in)
 * @param {{x: number, y: number}} anchor - fixed point, in px from the box's top-left
 * @param {{width: number, height: number}} box
 * @param {{width: number, height: number}} img
 * @returns {{zoom: number, offsetX: number, offsetY: number}} the zoomed state
 */
export function zoomAt(state, factor, anchor, box, img) {
    const z0 = state.zoom / 100
    const zoom = clamp(state.zoom * factor, ZOOM_MIN, ZOOM_MAX)
    const z1 = zoom / 100
    return clampState({
        zoom: zoom,
        offsetX: state.offsetX + anchor.x * (1 / z1 - 1 / z0) * 100 / box.width,
        offsetY: state.offsetY + anchor.y * (1 / z1 - 1 / z0) * 100 / box.height,
    }, box, img)
}

/**
 * Round a state to 2 decimals for persistence, like the geometry values
 * (album.json stores plain numbers; sub-percent precision is plenty).
 *
 * @param {{zoom: number, offsetX: number, offsetY: number}} state
 * @returns {{zoom: number, offsetX: number, offsetY: number}}
 */
export function roundPanZoom(state) {
    const round2 = value => Math.round(value * 100) / 100
    return { zoom: round2(state.zoom), offsetX: round2(state.offsetX), offsetY: round2(state.offsetY) }
}
