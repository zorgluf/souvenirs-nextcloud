/**
 * Pure, framework-free helpers for editing album data.
 *
 * These functions exist as a single, well-tested seam for the core safety
 * guarantee of the editing feature: when the user changes one field, we must
 * patch ONLY that field and preserve every other (possibly unknown) field of
 * the album / page / element, since album.json on disk is not a strict schema.
 *
 * They never mutate their arguments: a shallow-cloned copy is returned so the
 * caller decides when to commit the change to component state.
 */

import { v4 as uuidv4 } from 'uuid'
import { relayoutElements } from './tilePageLayout.js'

// Re-exported so existing call sites (and tests) can keep importing it from here.
export { relayoutElements }

/**
 * Return a copy of `page` with the element identified by `elementId` removed and
 * the remaining visible elements re-laid-out (default style for the new count).
 * All other page/element fields (including unknown ones) are preserved.
 *
 * @param {object} page - a page object, expected to contain an `elements` array
 * @param {string} elementId - the `id` of the element to remove
 * @returns {object} a new page object with the element removed
 */
export function removeElement(page, elementId) {
    const elements = Array.isArray(page.elements) ? page.elements : []
    return {
        ...page,
        elements: relayoutElements(elements.filter(element => element.id !== elementId)),
    }
}

/**
 * Build a fresh ImageElement for a picked Nextcloud file, following the on-disk
 * format produced by the Android app: the asset is stored under a generated UUID
 * file name (`image`), while `name`/`size` keep the original file's identity so
 * the asset-reuse endpoints (assetsearch/clean) can match it. Geometry is left at
 * full-page; the caller runs it through `addElement` (which re-lays-out the page).
 *
 * @param {object} file - the picked file: `{ name, size, mime }`
 * @returns {object} a new ImageElement object (not yet placed in a page)
 */
export function buildImageElement({ name, size, mime }) {
    const dot = name.lastIndexOf('.')
    const extension = dot >= 0 ? name.slice(dot) : ''
    return {
        class: 'ImageElement',
        id: uuidv4(),
        // Stored asset uses a unique name to avoid colliding with other assets
        // that share the original basename; preview resolves it via its .lnk.
        image: 'data/' + uuidv4() + extension,
        mime: mime,
        name: name,
        size: size,
        offsetX: 0,
        offsetY: 0,
        zoom: 100,
        transformType: 2, // IMG_ZOOMOFFSET (zoom 100 / no offset): cover-fit, matches the Android format
        stop: false,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
    }
}

/**
 * Build a fresh VideoElement for a picked Nextcloud file (issue #32). On disk
 * (as in the Android app) a VideoElement is an ImageElement — whose `image` is a
 * generated poster/thumbnail of the video — plus a `video` field holding the
 * actual video asset. `name`/`size`/`mime` keep the ORIGINAL VIDEO file's
 * identity, so the asset-reuse endpoints (assetsearch/clean) match the video,
 * not the poster (which is generated, hence never present elsewhere).
 * Geometry is left at full-page; the caller runs it through `addElement`.
 *
 * @param {object} file - the picked file: `{ name, size, mime }`
 * @returns {object} a new VideoElement object (not yet placed in a page)
 */
export function buildVideoElement({ name, size, mime }) {
    const dot = name.lastIndexOf('.')
    const extension = dot >= 0 ? name.slice(dot) : ''
    return {
        class: 'VideoElement',
        id: uuidv4(),
        video: 'data/' + uuidv4() + extension,
        // Poster frame captured from the video, stored as a JPEG asset. The
        // caller blanks this field if the capture/upload fails (best-effort).
        image: 'data/' + uuidv4() + '.jpg',
        mime: mime,
        name: name,
        size: size,
        offsetX: 0,
        offsetY: 0,
        zoom: 100,
        transformType: 2, // IMG_ZOOMOFFSET (zoom 100 / no offset): cover-fit, matches the Android format
        stop: false,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
    }
}

/**
 * Build a fresh, empty TextElement following the on-disk format produced by the
 * Android app. Geometry is left at full-page; the caller runs it through
 * `addElement` (which re-lays-out the page). The caption is filled in afterwards
 * via the inline EditableText in edit mode.
 *
 * @returns {object} a new TextElement object (not yet placed in a page)
 */
export function buildTextElement() {
    return {
        class: 'TextElement',
        id: uuidv4(),
        text: '',
        offsetX: 0,
        offsetY: 0,
        size: 0,
        stop: false,
        transformType: 0,
        zoom: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
    }
}

function isPaintElement(element) {
    return element != null && typeof element.class === 'string'
        && element.class.endsWith('PaintElement')
}

/**
 * The page's paint overlay element, or null. Like the Android app, a page holds
 * at most one paint element (painting again edits it), so the first match wins.
 *
 * @param {object} page - a page object, expected to contain an `elements` array
 * @returns {object|null}
 */
export function getPaintElement(page) {
    const elements = Array.isArray(page.elements) ? page.elements : []
    return elements.find(isPaintElement) || null
}

/**
 * Build a fresh PaintElement following the on-disk format produced by the
 * Android app: a transparent full-page PNG overlay (transformType 0 = fit; the
 * PNG is captured with the page's aspect ratio, so "fit" is an exact overlay).
 * Paint elements never take part in page layouts, so the full-page geometry
 * set here is what gets persisted.
 *
 * @param {number} size - the PNG size in bytes
 * @returns {object} a new PaintElement object (not yet placed in a page)
 */
export function buildPaintElement(size = 0) {
    return {
        class: 'PaintElement',
        id: uuidv4(),
        image: 'data/' + uuidv4() + '.png',
        mime: 'image/png',
        name: '',
        size: size,
        offsetX: 0,
        offsetY: 0,
        zoom: 100,
        transformType: 0, // IMG_FILL: exact overlay, see above
        stop: false,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
    }
}

/**
 * Return a copy of `page` holding exactly one paint element, for a confirmed
 * (non-empty) drawing:
 * - if the page has none, a fresh full-page PaintElement is appended (last in
 *   the array = drawn on top);
 * - otherwise the FIRST paint element is kept — same id and same `image` asset
 *   path, whose PNG the caller overwrites in place — with only `size` updated,
 *   and any exceeding paint elements are dropped (a page holds 0 or 1).
 *
 * The other elements are left completely untouched (paint takes no layout
 * slot, so no re-layout happens and manual geometry survives).
 *
 * @param {object} page - a page object, expected to contain an `elements` array
 * @param {number} size - the confirmed PNG size in bytes
 * @returns {object} a new page object with the single paint element in place
 */
export function setPagePaintElement(page, size) {
    const elements = Array.isArray(page.elements) ? page.elements : []
    const first = elements.find(isPaintElement)
    if (first == null) {
        return { ...page, elements: [...elements, buildPaintElement(size)] }
    }
    return {
        ...page,
        elements: elements
            .filter(element => !isPaintElement(element) || element === first)
            .map(element => (element === first ? { ...element, size } : element)),
    }
}

/**
 * Return a copy of `page` with every paint element removed (a drawing confirmed
 * fully transparent means "no overlay"). Unlike `removeElement`, the remaining
 * elements are NOT re-laid-out: paint takes no layout slot, so removing it must
 * not touch anyone's geometry.
 *
 * @param {object} page - a page object, expected to contain an `elements` array
 * @returns {object} a new page object without paint elements
 */
export function removePaintElements(page) {
    const elements = Array.isArray(page.elements) ? page.elements : []
    return {
        ...page,
        elements: elements.filter(element => !isPaintElement(element)),
    }
}

/**
 * Build a fresh, empty page. The backend stamps its lastEditDate on creation.
 *
 * @returns {object} a new page object `{ id, elements: [] }`
 */
export function buildPage() {
    return {
        id: uuidv4(),
        elements: [],
    }
}

/**
 * Return a copy of `page` with `element` appended and the page re-laid-out with the
 * default style for the new element count. All other page/element fields are preserved.
 *
 * @param {object} page - a page object, expected to contain an `elements` array
 * @param {object} element - the element to add (e.g. from `buildImageElement`)
 * @returns {object} a new page object with the element added
 */
export function addElement(page, element) {
    const elements = Array.isArray(page.elements) ? page.elements : []
    // As in the Android app, the paint overlay stays last in the array (= drawn
    // on top of the tiles), so new non-paint elements go before it.
    const paintIndex = elements.findIndex(isPaintElement)
    const insertAt = (paintIndex >= 0 && !isPaintElement(element)) ? paintIndex : elements.length
    const added = [...elements]
    added.splice(insertAt, 0, element)
    return {
        ...page,
        elements: relayoutElements(added),
    }
}

/**
 * Return a copy of `page` in which the elements identified by `elementIdA` and
 * `elementIdB` have exchanged places: each takes the other's geometry
 * (top/left/right/bottom) AND the other's slot in the elements array. Swapping
 * the array slots too keeps the visual order and the persisted order in sync,
 * so a later re-layout (e.g. adding an element) does not undo the swap.
 * Everything else (zoom/offset, captions, unknown fields, ...) is preserved.
 *
 * If either id is missing, or both are the same element, the page is returned
 * unchanged (as a copy).
 *
 * @param {object} page - a page object, expected to contain an `elements` array
 * @param {string} elementIdA - the `id` of the first element
 * @param {string} elementIdB - the `id` of the second element
 * @returns {object} a new page object with the two elements swapped
 */
export function swapElements(page, elementIdA, elementIdB) {
    const elements = Array.isArray(page.elements) ? page.elements : []
    const swapped = elements.map(element => ({ ...element }))
    const indexA = elements.findIndex(element => element.id === elementIdA)
    const indexB = elements.findIndex(element => element.id === elementIdB)
    if (indexA >= 0 && indexB >= 0 && indexA !== indexB) {
        const geometry = ({ top, left, right, bottom }) => ({ top, left, right, bottom })
        swapped[indexA] = { ...elements[indexB], ...geometry(elements[indexA]) }
        swapped[indexB] = { ...elements[indexA], ...geometry(elements[indexB]) }
    }
    return {
        ...page,
        elements: swapped,
    }
}

/**
 * Return a copy of `page` in which the element identified by `elementId` has its
 * geometry (top/left/right/bottom, in page percentages) replaced. All other fields
 * of the page and of every element (including ones this app does not know about)
 * are preserved untouched. Used by the corner-handle resize (issue #20).
 *
 * @param {object} page - a page object, expected to contain an `elements` array
 * @param {string} elementId - the `id` of the element being resized
 * @param {{top: number, left: number, right: number, bottom: number}} geometry
 * @returns {object} a new page object with the single change applied
 */
export function setElementGeometry(page, elementId, { top, left, right, bottom }) {
    const elements = Array.isArray(page.elements) ? page.elements : []
    return {
        ...page,
        elements: elements.map(element =>
            element.id === elementId
                ? { ...element, top, left, right, bottom }
                : element,
        ),
    }
}

/**
 * Return a copy of `page` in which the element identified by `elementId` has its
 * pan & zoom values (zoom, offsetX, offsetY — album.json percent units) and its
 * `transformType` replaced. The transform type is included because the first
 * pan/zoom gesture on a fill/center-crop element switches it to the zoom-offset
 * type (issue #27). All other fields of the page and of every element (including
 * ones this app does not know about) are preserved untouched.
 *
 * @param {object} page - a page object, expected to contain an `elements` array
 * @param {string} elementId - the `id` of the element being panned/zoomed
 * @param {{zoom: number, offsetX: number, offsetY: number, transformType: number}} panZoom
 * @returns {object} a new page object with the single change applied
 */
export function setElementPanZoom(page, elementId, { zoom, offsetX, offsetY, transformType }) {
    const elements = Array.isArray(page.elements) ? page.elements : []
    return {
        ...page,
        elements: elements.map(element =>
            element.id === elementId
                ? { ...element, zoom, offsetX, offsetY, transformType }
                : element,
        ),
    }
}

/**
 * Return a copy of `page` in which the element identified by `elementId` has its
 * `text` set to `newText`. All other fields of the page and of every element
 * (including ones this app does not know about) are preserved untouched.
 *
 * @param {object} page - a page object, expected to contain an `elements` array
 * @param {string} elementId - the `id` of the element whose caption changes
 * @param {string} newText - the new caption text
 * @returns {object} a new page object with the single change applied
 */
export function setElementText(page, elementId, newText) {
    const elements = Array.isArray(page.elements) ? page.elements : []
    return {
        ...page,
        elements: elements.map(element =>
            element.id === elementId
                ? { ...element, text: newText }
                : element,
        ),
    }
}
