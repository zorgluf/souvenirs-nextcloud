import { describe, it, expect, vi } from 'vitest'
import { penStart, penMove, penEnd, drawPenSegment, erase, hasInk, TOUCH_TOLERANCE, PEN_WIDTH, ERASER_RADIUS } from '../paintBrush.js'

// A minimal CanvasRenderingContext2D stand-in recording the calls we care about.
function fakeContext() {
    return {
        globalCompositeOperation: 'source-over',
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        lineCap: '',
        lineJoin: '',
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
    }
}

describe('pen stroke state machine (Android PaintElementView port)', () => {
    it('starts the path and the control point at the press position', () => {
        const s = penStart(10, 20)
        expect(s).toEqual({ pathX: 10, pathY: 20, lastX: 10, lastY: 20 })
    })

    it('ignores moves within the touch tolerance', () => {
        const s = penStart(10, 10)
        const { state, segment } = penMove(s, 10 + TOUCH_TOLERANCE - 1, 10 + TOUCH_TOLERANCE - 1)
        expect(segment).toBeNull()
        expect(state).toBe(s)
    })

    it('produces a quadratic segment to the midpoint on an accepted move', () => {
        const s = penStart(0, 0)
        const { state, segment } = penMove(s, 10, 0)
        // curve from the start point, controlled by the previous raw point (0,0),
        // ending at the midpoint of (0,0)-(10,0)
        expect(segment).toEqual({ fromX: 0, fromY: 0, controlX: 0, controlY: 0, toX: 5, toY: 0 })
        expect(state).toEqual({ pathX: 5, pathY: 0, lastX: 10, lastY: 0 })
    })

    it('chains segments: each curve starts at the previous midpoint with the raw point as control', () => {
        let s = penStart(0, 0)
        s = penMove(s, 10, 0).state
        const { segment } = penMove(s, 10, 10)
        expect(segment).toEqual({ fromX: 5, fromY: 0, controlX: 10, controlY: 0, toX: 10, toY: 5 })
    })

    it('accepts a move when only one axis exceeds the tolerance', () => {
        const { segment } = penMove(penStart(0, 0), 0, TOUCH_TOLERANCE)
        expect(segment).not.toBeNull()
    })

    it('penEnd closes with a straight segment from the path position to the last raw point', () => {
        let s = penStart(0, 0)
        s = penMove(s, 10, 0).state
        expect(penEnd(s)).toEqual({ fromX: 5, fromY: 0, toX: 10, toY: 0 })
    })

    it('penEnd of a stationary tap is a zero-length segment at the press position', () => {
        expect(penEnd(penStart(7, 8))).toEqual({ fromX: 7, fromY: 8, toX: 7, toY: 8 })
    })
})

describe('drawPenSegment', () => {
    it('strokes a quadratic curve with round caps and the scaled pen width', () => {
        const ctx = fakeContext()
        drawPenSegment(ctx, { fromX: 0, fromY: 0, controlX: 2, controlY: 2, toX: 4, toY: 0 }, '#ff0000', 2)
        expect(ctx.moveTo).toHaveBeenCalledWith(0, 0)
        expect(ctx.quadraticCurveTo).toHaveBeenCalledWith(2, 2, 4, 0)
        expect(ctx.stroke).toHaveBeenCalled()
        expect(ctx.strokeStyle).toBe('#ff0000')
        expect(ctx.lineWidth).toBe(PEN_WIDTH * 2)
        expect(ctx.lineCap).toBe('round')
        expect(ctx.globalCompositeOperation).toBe('source-over')
    })

    it('strokes a straight line for a control-less (closing) segment', () => {
        const ctx = fakeContext()
        drawPenSegment(ctx, { fromX: 1, fromY: 1, toX: 5, toY: 5 }, '#000000', 1)
        expect(ctx.lineTo).toHaveBeenCalledWith(5, 5)
        expect(ctx.quadraticCurveTo).not.toHaveBeenCalled()
        expect(ctx.stroke).toHaveBeenCalled()
    })

    it('renders a zero-length segment (a tap) as a filled dot of half the pen width', () => {
        const ctx = fakeContext()
        drawPenSegment(ctx, { fromX: 3, fromY: 3, toX: 3, toY: 3 }, '#00ff00', 2)
        expect(ctx.arc).toHaveBeenCalledWith(3, 3, PEN_WIDTH, 0, 2 * Math.PI)
        expect(ctx.fill).toHaveBeenCalled()
        expect(ctx.stroke).not.toHaveBeenCalled()
        expect(ctx.fillStyle).toBe('#00ff00')
    })
})

describe('hasInk', () => {
    // getImageData stub over a 2x2 canvas (RGBA byte per channel).
    const ctxWithPixels = pixels => ({ getImageData: () => ({ data: Uint8ClampedArray.from(pixels) }) })

    it('is false for a fully transparent canvas', () => {
        const ctx = ctxWithPixels([0, 0, 0, 0, 255, 128, 0, 0, 0, 0, 0, 0, 9, 9, 9, 0])
        expect(hasInk(ctx, 2, 2)).toBe(false)
    })

    it('is true as soon as any pixel has a non-zero alpha', () => {
        const ctx = ctxWithPixels([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0])
        expect(hasInk(ctx, 2, 2)).toBe(true)
    })
})

describe('erase', () => {
    it('punches a transparent circle with destination-out at the scaled radius', () => {
        const ctx = fakeContext()
        erase(ctx, 10, 20, 2)
        expect(ctx.globalCompositeOperation).toBe('destination-out')
        expect(ctx.arc).toHaveBeenCalledWith(10, 20, ERASER_RADIUS * 2, 0, 2 * Math.PI)
        expect(ctx.fill).toHaveBeenCalled()
    })
})
