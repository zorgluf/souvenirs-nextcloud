import { describe, it, expect, vi } from 'vitest'
import { createOverlayHistory } from '../overlayHistory.js'

// Minimal window: a history stack and popstate listeners. back() pops
// synchronously and dispatches popstate (browsers do it asynchronously, the
// order of events is the same).
function makeWindow() {
    const listeners = []
    const stack = [{ position: 3, current: '/show?apath=a' }]
    const win = {
        history: {
            get state() { return stack[stack.length - 1] },
            get length() { return stack.length },
            pushState(state) { stack.push(state) },
            back() {
                stack.pop()
                listeners.forEach((l) => l({ state: win.history.state }))
            },
        },
        addEventListener(type, l) { if (type === 'popstate') listeners.push(l) },
        removeEventListener(type, l) {
            const i = listeners.indexOf(l)
            if (i !== -1) listeners.splice(i, 1)
        },
        listeners,
        stack,
    }
    return win
}

describe('createOverlayHistory', () => {
    it('open pushes one entry keeping the router state', () => {
        const win = makeWindow()
        const h = createOverlayHistory(vi.fn(), win)
        h.open()
        h.open()
        expect(win.stack.length).toBe(2)
        expect(win.history.state).toEqual({ position: 3, current: '/show?apath=a', souvenirsOverlay: true })
        expect(h.isOpen).toBe(true)
    })

    it('"back" closes the overlay', () => {
        const win = makeWindow()
        const onClose = vi.fn()
        const h = createOverlayHistory(onClose, win)
        h.open()
        win.history.back()
        expect(onClose).toHaveBeenCalledTimes(1)
        expect(win.stack.length).toBe(1)
        expect(h.isOpen).toBe(false)
    })

    it('closing from the app removes the entry without calling onClose', () => {
        const win = makeWindow()
        const onClose = vi.fn()
        const h = createOverlayHistory(onClose, win)
        h.open()
        h.close()
        expect(win.stack.length).toBe(1)
        expect(onClose).not.toHaveBeenCalled()
        // a later "back" is a real back, not an overlay close
        h.close()
        expect(win.stack.length).toBe(1)
    })

    it('can be opened again after a close', () => {
        const win = makeWindow()
        const onClose = vi.fn()
        const h = createOverlayHistory(onClose, win)
        h.open()
        h.close()
        h.open()
        win.history.back()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('ignores popstate when no overlay is open', () => {
        const win = makeWindow()
        const onClose = vi.fn()
        createOverlayHistory(onClose, win)
        win.listeners.forEach((l) => l({}))
        expect(onClose).not.toHaveBeenCalled()
    })

    it('destroy stops listening', () => {
        const win = makeWindow()
        const h = createOverlayHistory(vi.fn(), win)
        h.destroy()
        expect(win.listeners.length).toBe(0)
    })
})
