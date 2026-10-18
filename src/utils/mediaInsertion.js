/**
 * Where added media go, as one batch of page operations (issue #50).
 *
 * Same placement rules as before (issue #36 / #33): the first visual medium
 * joins the page the chooser was opened from, each further one gets its own
 * new page right after - one medium per page - and an audio medium becomes
 * the track of the page the batch is currently on (last one wins). What
 * changed is that the whole batch is now computed up front and sent as ONE
 * request (albumApi.pageOperations) instead of one request per medium.
 */

import { addElement, buildPage, getAudioElement, setPageAudioElement } from './albumEdit.js'

/**
 * @param {Array<object>} pages - the album pages (not modified)
 * @param {number} targetIndex - index of the page the chooser was opened from
 * @param {Array<object>} elements - the new elements, in selection order
 * @returns {{operations: Array<object>, visualCount: number, audioReplaced: boolean}}
 *   operations: for albumApi.pageOperations and applyPageOperations, in order
 *   visualCount: number of visual media placed (pages touched)
 *   audioReplaced: whether an existing audio track was replaced (its asset
 *   is now orphaned)
 */
export function planMediaInsertion(pages, targetIndex, elements) {
    const working = pages.slice()
    const operations = []
    const opByPageId = new Map()
    let visualCount = 0
    let audioReplaced = false

    // One operation per page: later changes to a page already in the batch
    // (an audio track on a page created just before) update its operation.
    const upsert = (page) => {
        const existing = opByPageId.get(page.id)
        if (existing) {
            existing.page = page
            return
        }
        const op = { op: 'update', page }
        operations.push(op)
        opByPageId.set(page.id, op)
    }

    for (const element of elements) {
        if (element.class === 'AudioElement') {
            const currentIndex = targetIndex + Math.max(0, visualCount - 1)
            const current = working[currentIndex]
            audioReplaced = audioReplaced || (getAudioElement(current) != null)
            const withAudio = setPageAudioElement(current, element)
            working[currentIndex] = withAudio
            upsert(withAudio)
        } else if (visualCount === 0) {
            const updated = addElement(working[targetIndex], element)
            working[targetIndex] = updated
            upsert(updated)
            visualCount++
        } else {
            const pos = targetIndex + visualCount
            const page = addElement(buildPage(), element)
            working.splice(pos, 0, page)
            const op = { op: 'create', pos, page }
            operations.push(op)
            opByPageId.set(page.id, op)
            visualCount++
        }
    }
    return { operations, visualCount, audioReplaced }
}

/**
 * Apply page operations to a local pages array, the way the server applies
 * them (Album::applyPageOperations), once it accepted them.
 *
 * @param {Array<object>} pages - modified in place (e.g. the reactive array)
 * @param {Array<object>} operations - update / create / delete operations
 */
export function applyPageOperationsLocally(pages, operations) {
    for (const operation of operations) {
        if (operation.op === 'update') {
            const index = pages.findIndex(p => p.id === operation.page.id)
            if (index >= 0) {
                pages.splice(index, 1, operation.page)
            }
        } else if (operation.op === 'create') {
            pages.splice(Math.min(operation.pos, pages.length), 0, operation.page)
        } else if (operation.op === 'delete') {
            const index = pages.findIndex(p => p.id === operation.id)
            if (index >= 0) {
                pages.splice(index, 1)
            }
        } else {
            // 'move' uses the server's remove-then-reinsert position convention;
            // not needed by the callers so far, so refuse rather than desync.
            throw new Error('applyPageOperationsLocally: unsupported operation ' + operation.op)
        }
    }
}
