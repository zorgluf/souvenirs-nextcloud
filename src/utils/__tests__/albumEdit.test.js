import { describe, it, expect } from 'vitest'
import { setElementText } from '../albumEdit.js'

describe('setElementText', () => {
    const makePage = () => ({
        id: 'page-1',
        // A field this app does not know about — must survive editing.
        customPageField: 'keep-me',
        elements: [
            {
                id: 'el-1',
                text: 'old caption',
                image: 'data/a.jpg',
                top: 10,
                // Unknown per-element field that must be preserved.
                androidOnlyField: 42,
            },
            {
                id: 'el-2',
                text: 'other caption',
                video: 'data/b.mp4',
            },
        ],
    })

    it('changes only the targeted element text', () => {
        const result = setElementText(makePage(), 'el-1', 'new caption')
        expect(result.elements[0].text).toBe('new caption')
        expect(result.elements[1].text).toBe('other caption')
    })

    it('preserves all other element fields, including unknown ones', () => {
        const result = setElementText(makePage(), 'el-1', 'new caption')
        const edited = result.elements[0]
        expect(edited.image).toBe('data/a.jpg')
        expect(edited.top).toBe(10)
        expect(edited.androidOnlyField).toBe(42)
    })

    it('preserves unknown page-level fields and the full elements set', () => {
        const result = setElementText(makePage(), 'el-1', 'new caption')
        expect(result.id).toBe('page-1')
        expect(result.customPageField).toBe('keep-me')
        expect(result.elements).toHaveLength(2)
    })

    it('does not mutate the original page or its elements', () => {
        const page = makePage()
        setElementText(page, 'el-1', 'new caption')
        expect(page.elements[0].text).toBe('old caption')
    })

    it('is a no-op on text when the element id is not found', () => {
        const result = setElementText(makePage(), 'missing', 'new caption')
        expect(result.elements.map(e => e.text)).toEqual(['old caption', 'other caption'])
    })

    it('tolerates a page without an elements array', () => {
        const result = setElementText({ id: 'p' }, 'el-1', 'x')
        expect(result.elements).toEqual([])
    })
})
