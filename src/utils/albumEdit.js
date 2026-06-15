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
