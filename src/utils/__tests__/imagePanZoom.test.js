import { describe, it, expect } from 'vitest'
import { initialPanZoom, panBy, zoomAt, roundPanZoom, ZOOM_MIN, ZOOM_MAX } from '../imagePanZoom.js'

// A square image in a square box: cover-fit fills the box exactly, which makes
// the expected values easy to derive by hand.
const BOX = { width: 1000, height: 1000 }
const IMG = { width: 2000, height: 2000 }

describe('initialPanZoom', () => {
    it('keeps the stored values of a zoom-offset element', () => {
        expect(initialPanZoom({ transformType: 2, zoom: 150, offsetX: 5, offsetY: -3 }, BOX, IMG))
            .toEqual({ zoom: 150, offsetX: 5, offsetY: -3 })
    })

    it('falls back to plain cover-fit on missing zoom-offset values', () => {
        expect(initialPanZoom({ transformType: 2, zoom: undefined, offsetX: undefined, offsetY: undefined }, BOX, IMG))
            .toEqual({ zoom: 100, offsetX: 0, offsetY: 0 })
    })

    it('maps center-crop to cover-fit (zoom 100, no offset)', () => {
        expect(initialPanZoom({ transformType: 1, zoom: 0, offsetX: 0, offsetY: 0 }, BOX, IMG))
            .toEqual({ zoom: 100, offsetX: 0, offsetY: 0 })
    })

    it('maps fill (contain) to the visually equivalent zoom', () => {
        // 2000x1000 image in a 1000x1000 box: contain scale 0.5, cover scale 1.
        expect(initialPanZoom({ transformType: 0, zoom: 0, offsetX: 0, offsetY: 0 }, BOX, { width: 2000, height: 1000 }))
            .toEqual({ zoom: 50, offsetX: 0, offsetY: 0 })
    })
})

describe('panBy', () => {
    it('converts a pointer delta to offset percents at zoom 100', () => {
        const state = panBy({ zoom: 100, offsetX: 0, offsetY: 0 }, { x: 100, y: -50 }, BOX, IMG)
        expect(state).toEqual({ zoom: 100, offsetX: 10, offsetY: -5 })
    })

    it('divides the delta by the zoom so the image follows the pointer 1:1', () => {
        const state = panBy({ zoom: 200, offsetX: 0, offsetY: 0 }, { x: 100, y: 100 }, BOX, IMG)
        expect(state).toEqual({ zoom: 200, offsetX: 5, offsetY: 5 })
    })

    it('clamps so the image cannot leave the box entirely', () => {
        // Square cover-fit at zoom 100: the image may shift at most one full box.
        const state = panBy({ zoom: 100, offsetX: 0, offsetY: 0 }, { x: 100000, y: -100000 }, BOX, IMG)
        expect(state).toEqual({ zoom: 100, offsetX: 100, offsetY: -100 })
    })

    it('allows a wider pan range for an image that overflows the box', () => {
        // 2000x1000 image cover-fitted in a 1000x1000 box overflows horizontally
        // by 500px on each side: the clamp accounts for that extra travel.
        const state = panBy({ zoom: 100, offsetX: 0, offsetY: 0 }, { x: 100000, y: 0 }, BOX, { width: 2000, height: 1000 })
        expect(state.offsetX).toBe(150)
    })
})

describe('zoomAt', () => {
    it('scales the zoom and keeps the anchor point fixed', () => {
        // Doubling the zoom about the box center: offsets compensate by
        // anchor * (1/2 - 1) = -250px = -25% of the box.
        const state = zoomAt({ zoom: 100, offsetX: 0, offsetY: 0 }, 2, { x: 500, y: 500 }, BOX, IMG)
        expect(state).toEqual({ zoom: 200, offsetX: -25, offsetY: -25 })
    })

    it('leaves the state unchanged for a top-left anchor', () => {
        // The rendered layout scales about the box origin, so that point is
        // naturally fixed: no offset compensation needed.
        const state = zoomAt({ zoom: 100, offsetX: 4, offsetY: 2 }, 2, { x: 0, y: 0 }, BOX, IMG)
        expect(state).toEqual({ zoom: 200, offsetX: 4, offsetY: 2 })
    })

    it('is reversible: zooming in then out restores the state', () => {
        const start = { zoom: 100, offsetX: 10, offsetY: -10 }
        const zoomed = zoomAt(start, 2, { x: 300, y: 700 }, BOX, IMG)
        const back = zoomAt(zoomed, 0.5, { x: 300, y: 700 }, BOX, IMG)
        expect(back.zoom).toBeCloseTo(start.zoom, 6)
        expect(back.offsetX).toBeCloseTo(start.offsetX, 6)
        expect(back.offsetY).toBeCloseTo(start.offsetY, 6)
    })

    it('clamps the zoom to the allowed range', () => {
        expect(zoomAt({ zoom: 100, offsetX: 0, offsetY: 0 }, 1000, { x: 0, y: 0 }, BOX, IMG).zoom).toBe(ZOOM_MAX)
        expect(zoomAt({ zoom: 100, offsetX: 0, offsetY: 0 }, 0.001, { x: 0, y: 0 }, BOX, IMG).zoom).toBe(ZOOM_MIN)
    })
})

describe('roundPanZoom', () => {
    it('rounds all values to 2 decimals', () => {
        expect(roundPanZoom({ zoom: 122.140275, offsetX: -9.06346, offsetY: 0.005 }))
            .toEqual({ zoom: 122.14, offsetX: -9.06, offsetY: 0.01 })
    })
})
