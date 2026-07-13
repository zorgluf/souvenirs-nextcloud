/**
 * Freehand drawing logic for the paint dialog (issue #26), ported from the
 * Souvenirs Android app's `view/PaintElementView.java` so strokes look the same
 * on both clients:
 *
 * - Pen: round cap/join strokes of width 12, smoothed by replacing the raw
 *   pointer polyline with quadratic curves through the midpoints (each raw
 *   point becomes the control point of the curve joining the two neighboring
 *   midpoints), skipping pointer moves smaller than a 4px tolerance.
 * - Eraser: transparent circles of radius 40 punched at every pointer position
 *   (PorterDuff CLEAR on Android ≙ canvas `destination-out`).
 *
 * The stroke geometry is a pure state machine (testable without a canvas); the
 * `draw*` helpers apply the produced segments to a CanvasRenderingContext2D.
 * All coordinates and widths are in canvas (backing store) pixels — the caller
 * scales pointer positions and the `scale` option (canvas px per CSS px, so the
 * pen keeps the Android look at any resolution).
 */

export const TOUCH_TOLERANCE = 4
export const PEN_WIDTH = 12
export const ERASER_RADIUS = 40

/**
 * Start a pen stroke at the given point.
 *
 * @param {number} x
 * @param {number} y
 * @returns {object} stroke state: `path` position (last committed curve end)
 *   and `last` raw point (next curve's control point)
 */
export function penStart(x, y) {
    return { pathX: x, pathY: y, lastX: x, lastY: y }
}

/**
 * Feed a pointer move into the stroke. Moves within the tolerance are ignored
 * (returns a null segment and the unchanged state); an accepted move produces
 * the next quadratic segment: from the current path position to the midpoint
 * of (last, current), controlled by the last raw point.
 *
 * @param {object} state - the stroke state from penStart/penMove
 * @param {number} x
 * @param {number} y
 * @returns {{state: object, segment: object|null}}
 */
export function penMove(state, x, y) {
    if (Math.abs(x - state.lastX) < TOUCH_TOLERANCE && Math.abs(y - state.lastY) < TOUCH_TOLERANCE) {
        return { state, segment: null }
    }
    const midX = (x + state.lastX) / 2
    const midY = (y + state.lastY) / 2
    return {
        state: { pathX: midX, pathY: midY, lastX: x, lastY: y },
        segment: {
            fromX: state.pathX,
            fromY: state.pathY,
            controlX: state.lastX,
            controlY: state.lastY,
            toX: midX,
            toY: midY,
        },
    }
}

/**
 * Finish the stroke: the closing straight segment from the last committed
 * curve end to the last raw point. For a stationary tap the segment has zero
 * length — drawPenSegment still renders it as a round dot.
 *
 * @param {object} state - the stroke state from penStart/penMove
 * @returns {object} the closing segment (no control point)
 */
export function penEnd(state) {
    return { fromX: state.pathX, fromY: state.pathY, toX: state.lastX, toY: state.lastY }
}

/**
 * Stroke one pen segment onto the canvas. Segments produced by penMove carry a
 * control point (quadratic curve); the penEnd segment is a straight line. Round
 * caps make consecutive segments join seamlessly, and render a zero-length
 * segment (a tap) as a dot.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} segment
 * @param {string} color - CSS color of the pen
 * @param {number} scale - canvas pixels per CSS pixel
 */
export function drawPenSegment(ctx, segment, color, scale = 1) {
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = color
    ctx.lineWidth = PEN_WIDTH * scale
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(segment.fromX, segment.fromY)
    if (segment.controlX !== undefined) {
        ctx.quadraticCurveTo(segment.controlX, segment.controlY, segment.toX, segment.toY)
    } else if (segment.fromX === segment.toX && segment.fromY === segment.toY) {
        // Zero-length line: some canvas implementations draw nothing even with
        // round caps, so a tap is rendered as an explicit dot.
        ctx.fillStyle = color
        ctx.arc(segment.toX, segment.toY, (PEN_WIDTH * scale) / 2, 0, 2 * Math.PI)
        ctx.fill()
        ctx.restore()
        return
    } else {
        ctx.lineTo(segment.toX, segment.toY)
    }
    ctx.stroke()
    ctx.restore()
}

/**
 * Whether the canvas holds any visible drawing (any pixel with a non-zero
 * alpha). A drawing that was fully erased — or never started — is "no ink":
 * confirming it removes the page's paint element instead of saving an
 * all-transparent PNG.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width - canvas backing-store width in pixels
 * @param {number} height - canvas backing-store height in pixels
 * @returns {boolean}
 */
export function hasInk(ctx, width, height) {
    const data = ctx.getImageData(0, 0, width, height).data
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) {
            return true
        }
    }
    return false
}

/**
 * Punch a transparent eraser circle at the given point.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} scale - canvas pixels per CSS pixel
 */
export function erase(ctx, x, y, scale = 1) {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(x, y, ERASER_RADIUS * scale, 0, 2 * Math.PI)
    ctx.fill()
    ctx.restore()
}
