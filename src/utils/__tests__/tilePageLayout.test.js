import { describe, it, expect } from 'vitest'
import {
    PAGE_STYLE_MAP,
    stylesForCount,
    defaultStyleIndex,
    applyStyle,
    canCycleLayout,
    cycleLayout,
} from '../tilePageLayout.js'

const img = id => ({ id, class: 'ImageElement', image: 'data/' + id + '.jpg', top: 1, left: 1, right: 1, bottom: 1 })
const txt = id => ({ id, class: 'TextElement', text: id, top: 1, left: 1, right: 1, bottom: 1 })
const rect = e => [e.left, e.top, e.right, e.bottom]

describe('PAGE_STYLE_MAP', () => {
    it('matches the Android grouping by slot count', () => {
        // 1x1, 5x2, 4x3, 1x4
        const counts = PAGE_STYLE_MAP.map(s => s.length)
        expect(counts).toEqual([1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4])
    })

    it('exposes the available styles per element count', () => {
        expect(stylesForCount(1)).toEqual([0])
        expect(stylesForCount(2)).toEqual([1, 2, 3, 4, 5])
        expect(stylesForCount(3)).toEqual([6, 7, 8, 9])
        expect(stylesForCount(4)).toEqual([10])
        expect(stylesForCount(5)).toEqual([])
    })
})

describe('defaultStyleIndex', () => {
    it('is full-page for one element', () => {
        expect(defaultStyleIndex([img('a')])).toBe(0)
    })
    it('is the title style for image + text', () => {
        expect(defaultStyleIndex([img('a'), txt('t')])).toBe(1)
    })
    it('is "2 V" for two images', () => {
        expect(defaultStyleIndex([img('a'), img('b')])).toBe(2)
    })
    it('is the first 3- and 4-element styles', () => {
        expect(defaultStyleIndex([img('a'), img('b'), img('c')])).toBe(6)
        expect(defaultStyleIndex([img('a'), img('b'), img('c'), img('d')])).toBe(10)
    })
    it('is -1 when no style fits (0 or >4)', () => {
        expect(defaultStyleIndex([])).toBe(-1)
        expect(defaultStyleIndex([img('a'), img('b'), img('c'), img('d'), img('e')])).toBe(-1)
    })
})

describe('applyStyle', () => {
    it('lays out image-like elements first, then text', () => {
        // title style (idx 1): big top, small bottom
        const out = applyStyle([txt('t'), img('a')], 1)
        const image = out.find(e => e.id === 'a')
        const text = out.find(e => e.id === 't')
        expect(rect(image)).toEqual([0, 0, 100, 80]) // image gets first rect
        expect(rect(text)).toEqual([0, 80, 100, 100]) // text gets the second
    })

    it('resets image-like elements to cover-fit', () => {
        const out = applyStyle([{ ...img('a'), transformType: 0, zoom: 40, offsetX: 9, offsetY: 9 }], 0)
        expect(out[0]).toMatchObject({ transformType: 2, zoom: 100, offsetX: 0, offsetY: 0 })
    })

    it('leaves paint and audio untouched', () => {
        const paint = { id: 'p', class: 'PaintElement', top: 3, left: 3, right: 3, bottom: 3 }
        const audio = { id: 'au', class: 'AudioElement' }
        const out = applyStyle([img('a'), paint, audio], 0)
        expect(out.find(e => e.id === 'p')).toMatchObject({ top: 3, left: 3, right: 3, bottom: 3 })
        expect(out.find(e => e.id === 'au')).toEqual(audio)
    })

    it('returns clones (no mutation) and preserves unknown fields', () => {
        const input = [{ ...img('a'), weird: 7 }]
        const out = applyStyle(input, 0)
        expect(out[0].weird).toBe(7)
        expect(input[0].right).toBe(1)
    })
})

describe('canCycleLayout', () => {
    it('is true only when the count has more than one style (2 or 3 elements)', () => {
        expect(canCycleLayout([img('a')])).toBe(false)
        expect(canCycleLayout([img('a'), img('b')])).toBe(true)
        expect(canCycleLayout([img('a'), img('b'), img('c')])).toBe(true)
        expect(canCycleLayout([img('a'), img('b'), img('c'), img('d')])).toBe(false)
        expect(canCycleLayout([img('a'), img('b'), img('c'), img('d'), img('e')])).toBe(false)
    })
})

describe('cycleLayout', () => {
    it('advances to the next style for the element count and wraps around', () => {
        let els = applyStyle([img('a'), img('b')], 1) // start on style 1
        // styles for 2 elements: [1,2,3,4,5]
        const seen = []
        for (let i = 0; i < 5; i++) {
            els = cycleLayout(els)
            // record which style index the current geometry matches
            const idx = PAGE_STYLE_MAP.findIndex(s =>
                s.length === 2 && rect(els[0]).every((v, k) => v === s[0][k]) && rect(els[1]).every((v, k) => v === s[1][k]))
            seen.push(idx)
        }
        // from 1 -> 2,3,4,5, then wrap to 1
        expect(seen).toEqual([2, 3, 4, 5, 1])
    })

    it('starts at the first style when the current layout matches none', () => {
        const els = [img('a'), img('b')] // arbitrary geometry, matches no style
        const out = cycleLayout(els)
        expect([rect(out[0]), rect(out[1])]).toEqual([PAGE_STYLE_MAP[1][0], PAGE_STYLE_MAP[1][1]])
    })

    it('is a no-op for counts with a single style (1 or 4 elements)', () => {
        const one = [{ ...img('a'), left: 0, top: 0, right: 100, bottom: 100 }]
        expect(cycleLayout(one).map(rect)).toEqual([[0, 0, 100, 100]])
    })
})
