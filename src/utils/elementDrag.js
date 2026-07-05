/**
 * Shared helpers for the HTML5 drag and drop of album elements.
 *
 * The drag payload (source page id + element id) travels through the native
 * DataTransfer under a custom MIME type, so element drags are distinguishable
 * from any other drag (files, text selections from the caption editor, ...).
 * During dragover the payload itself is not readable (HTML5 restriction), so
 * drop acceptance is checked from the type list alone.
 */

export const ELEMENT_DRAG_TYPE = 'application/x-souvenirs-element'

/**
 * Attach an element-drag payload to a dragstart event.
 *
 * @param {DragEvent} event - the dragstart event
 * @param {string} pageId - id of the page the element is dragged from
 * @param {string} elementId - id of the dragged element
 */
export function setElementDragData(event, pageId, elementId) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(ELEMENT_DRAG_TYPE, JSON.stringify({ pageId: pageId, elementId: elementId }))
}

/**
 * Whether the ongoing drag carries an element payload (usable during dragover,
 * when the payload content is not yet readable).
 *
 * @param {DragEvent} event
 * @returns {boolean}
 */
export function isElementDrag(event) {
    return event.dataTransfer != null
        && Array.prototype.includes.call(event.dataTransfer.types, ELEMENT_DRAG_TYPE)
}

/**
 * Read the element-drag payload from a drop event.
 *
 * @param {DragEvent} event
 * @returns {?{pageId: string, elementId: string}} the payload, or null if absent/malformed
 */
export function getElementDragData(event) {
    if (event.dataTransfer == null) {
        return null
    }
    try {
        const data = JSON.parse(event.dataTransfer.getData(ELEMENT_DRAG_TYPE))
        if (data != null && typeof data.pageId === 'string' && typeof data.elementId === 'string') {
            return data
        }
    } catch (e) {
        // Not our payload (or malformed): treat as no element drag.
    }
    return null
}
