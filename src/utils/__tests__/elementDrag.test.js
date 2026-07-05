import { describe, it, expect } from 'vitest'
import { ELEMENT_DRAG_TYPE, setElementDragData, isElementDrag, getElementDragData } from '../elementDrag.js'

// Minimal DataTransfer stand-in (jsdom does not implement DataTransfer).
function makeEvent() {
    const store = {}
    return {
        dataTransfer: {
            effectAllowed: null,
            get types() { return Object.keys(store) },
            setData(type, value) { store[type] = value },
            getData(type) { return store[type] ?? '' },
        },
    }
}

describe('element drag payload', () => {
    it('round-trips the page and element ids through the DataTransfer', () => {
        const event = makeEvent()
        setElementDragData(event, 'page-1', 'el-1')
        expect(isElementDrag(event)).toBe(true)
        expect(getElementDragData(event)).toEqual({ pageId: 'page-1', elementId: 'el-1' })
    })

    it('requests a move effect', () => {
        const event = makeEvent()
        setElementDragData(event, 'page-1', 'el-1')
        expect(event.dataTransfer.effectAllowed).toBe('move')
    })

    it('does not recognize foreign drags (files, text selections)', () => {
        const event = makeEvent()
        event.dataTransfer.setData('text/plain', 'hello')
        expect(isElementDrag(event)).toBe(false)
        expect(getElementDragData(event)).toBe(null)
    })

    it('returns null on a malformed payload instead of throwing', () => {
        const event = makeEvent()
        event.dataTransfer.setData(ELEMENT_DRAG_TYPE, 'not json')
        expect(getElementDragData(event)).toBe(null)
        event.dataTransfer.setData(ELEMENT_DRAG_TYPE, JSON.stringify({ pageId: 1 }))
        expect(getElementDragData(event)).toBe(null)
    })

    it('tolerates events without a dataTransfer', () => {
        expect(isElementDrag({ dataTransfer: null })).toBe(false)
        expect(getElementDragData({ dataTransfer: null })).toBe(null)
    })
})
