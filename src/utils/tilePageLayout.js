/**
 * Page tile layouts, ported from the Souvenirs Android app's
 * `model/TilePageBuilder.java` (PAGE_STYLE_MAP_TILE + applyStyle/getDefaultStyle).
 *
 * A "style" is an ordered list of `[left, top, right, bottom]` rectangles (in
 * page percentages, 0..100). Styles are grouped by how many slots they have, so
 * a page can be switched between the layouts that match its element count.
 *
 * As in the Android app, applying a style lays out the image-like elements first
 * (ImageElement/VideoElement, in page order), then the text elements; PaintElement,
 * AudioElement and anything else keep their position. Image-like elements are reset
 * to cover-fit (transformType 2, zoom 100, no offset). All other fields are preserved.
 *
 * Web-only deviation: the Android 2-element default uses portrait/landscape
 * detection (image height vs width), but album.json elements carry no image
 * dimensions, so two images default to the stacked "2 V" style; the user can
 * switch with the layout button.
 */

// [left, top, right, bottom] — index matches the Android comments.
export const PAGE_STYLE_MAP = [
    // 0 — 1 element
    [[0, 0, 100, 100]],
    // 1 — 2 V (1 small): title style
    [[0, 0, 100, 80], [0, 80, 100, 100]],
    // 2 — 2 V
    [[0, 0, 100, 50], [0, 50, 100, 100]],
    // 3 — 2 H
    [[0, 0, 50, 100], [50, 0, 100, 100]],
    // 4 — 2 vignette
    [[0, 0, 100, 100], [50, 0, 100, 50]],
    // 5 — 2 vignette R
    [[50, 0, 100, 50], [0, 0, 100, 100]],
    // 6 — 3: 1H + 2H
    [[0, 0, 100, 50], [0, 50, 50, 100], [50, 50, 100, 100]],
    // 7 — 3: 2H + 1H
    [[0, 0, 50, 50], [50, 0, 100, 50], [0, 50, 100, 100]],
    // 8 — 3: 1V + 2V
    [[0, 0, 50, 100], [50, 0, 100, 50], [50, 50, 100, 100]],
    // 9 — 3: 2V + 1V
    [[0, 0, 50, 50], [0, 50, 50, 100], [50, 0, 100, 100]],
    // 10 — 4
    [[0, 0, 50, 50], [50, 0, 100, 50], [0, 50, 50, 100], [50, 50, 100, 100]],
]

function isImageLike(element) {
    return typeof element.class === 'string'
        && (element.class.endsWith('ImageElement') || element.class.endsWith('VideoElement'))
}

function isText(element) {
    return typeof element.class === 'string' && element.class.endsWith('TextElement')
}

// Elements that take part in a layout: image-like + text. Paint/Audio/unknown stay put.
function isLayoutElement(element) {
    return isImageLike(element) || isText(element)
}

function round(value) {
    return Math.round(value * 10000) / 10000
}

/**
 * Indices of the styles that have exactly `n` slots.
 * @param {number} n
 * @returns {number[]}
 */
export function stylesForCount(n) {
    const out = []
    PAGE_STYLE_MAP.forEach((style, i) => { if (style.length === n) out.push(i) })
    return out
}

// Image-like elements first (page order), then text elements — mirrors Android applyStyle.
function orderedLayoutElements(elements) {
    const images = []
    const texts = []
    elements.forEach(e => { if (isImageLike(e)) images.push(e); else if (isText(e)) texts.push(e) })
    return images.concat(texts)
}

/**
 * The default style index for a page's current element count, following Android's
 * getDefaultStyle: a 2-element page with text uses the title style; otherwise the
 * first style matching the count. Returns -1 when no style fits (0 or >4 elements).
 *
 * @param {Array} elements
 * @returns {number}
 */
export function defaultStyleIndex(elements) {
    const layout = (Array.isArray(elements) ? elements : []).filter(isLayoutElement)
    const n = layout.length
    if (n === 2) {
        // Android: text -> title style; otherwise the stacked "2 V" (portrait
        // detection is not available on the web, see file header).
        return layout.some(isText) ? 1 : 2
    }
    return PAGE_STYLE_MAP.findIndex(style => style.length === n)
}

/**
 * Return a copy of `elements` with the given style applied. Image-like elements
 * take the first rectangles, text elements the rest (cycling the rectangle list
 * if there are more elements than slots, as Android does). Image-like elements are
 * reset to cover-fit. Non-layout elements (Paint/Audio/unknown) are returned untouched.
 *
 * @param {Array} elements
 * @param {number} styleIndex - index into PAGE_STYLE_MAP
 * @returns {Array} new elements array
 */
export function applyStyle(elements, styleIndex) {
    const list = Array.isArray(elements) ? elements : []
    const rects = PAGE_STYLE_MAP[styleIndex]
    if (!rects) {
        return list.map(e => ({ ...e }))
    }
    const ordered = orderedLayoutElements(list)
    const rectByElement = new Map()
    ordered.forEach((e, i) => { rectByElement.set(e, rects[i % rects.length]) })
    return list.map(e => {
        const r = rectByElement.get(e)
        if (!r) {
            return { ...e }
        }
        const placed = { ...e, left: r[0], top: r[1], right: r[2], bottom: r[3] }
        if (isImageLike(e)) {
            placed.transformType = 2 // IMG_ZOOMOFFSET cover-fit
            placed.offsetX = 0
            placed.offsetY = 0
            placed.zoom = 100
        }
        return placed
    })
}

// Square-ish grid fallback for element counts with no Android style (>4).
function gridLayout(elements) {
    const list = Array.isArray(elements) ? elements : []
    const count = list.filter(isLayoutElement).length
    if (count === 0) {
        return list.map(e => ({ ...e }))
    }
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    const cellWidth = 100 / cols
    const cellHeight = 100 / rows
    let i = 0
    return list.map(e => {
        if (!isLayoutElement(e)) {
            return { ...e }
        }
        const col = i % cols
        const row = Math.floor(i / cols)
        i += 1
        const placed = {
            ...e,
            left: round(col * cellWidth),
            right: round((col + 1) * cellWidth),
            top: round(row * cellHeight),
            bottom: round((row + 1) * cellHeight),
        }
        if (isImageLike(e)) {
            placed.transformType = 2
            placed.offsetX = 0
            placed.offsetY = 0
            placed.zoom = 100
        }
        return placed
    })
}

/**
 * Lay out a page with a sensible default for its element count: the Android default
 * style when one fits, otherwise a square grid (for >4 elements). Used after adding
 * or removing an element so the page never overlaps.
 *
 * @param {Array} elements
 * @returns {Array} new elements array
 */
export function relayoutElements(elements) {
    const list = Array.isArray(elements) ? elements : []
    const idx = defaultStyleIndex(list)
    return idx === -1 ? gridLayout(list) : applyStyle(list, idx)
}

/**
 * Whether the page offers more than one layout to switch between (i.e. its element
 * count has 2+ styles). True for 2- and 3-element pages.
 *
 * @param {Array} elements
 * @returns {boolean}
 */
export function canCycleLayout(elements) {
    const n = (Array.isArray(elements) ? elements : []).filter(isLayoutElement).length
    return stylesForCount(n).length > 1
}

function matchesStyle(ordered, rects) {
    if (ordered.length !== rects.length) {
        return false
    }
    return ordered.every((e, i) => {
        const r = rects[i]
        return e.left === r[0] && e.top === r[1] && e.right === r[2] && e.bottom === r[3]
    })
}

/**
 * Switch the page to the next layout available for its element count, wrapping
 * around. The current layout is detected from the elements' geometry; if it matches
 * none, the first style is used. Returns the elements untouched when there is nothing
 * to cycle (0/1 styles for the count).
 *
 * @param {Array} elements
 * @returns {Array} new elements array
 */
export function cycleLayout(elements) {
    const list = Array.isArray(elements) ? elements : []
    const ordered = orderedLayoutElements(list)
    const candidates = stylesForCount(ordered.length)
    if (candidates.length <= 1) {
        return list.map(e => ({ ...e }))
    }
    const current = candidates.findIndex(si => matchesStyle(ordered, PAGE_STYLE_MAP[si]))
    // current === -1 -> (-1 + 1) = 0 -> first candidate
    const next = candidates[(current + 1 + candidates.length) % candidates.length]
    return applyStyle(list, next)
}
