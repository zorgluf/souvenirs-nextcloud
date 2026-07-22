import { describe, it, expect, vi } from 'vitest'
import album from '../album.vue'

// Tests the album keyboard shortcut handler directly (mounting album.vue would
// require stubbing the router, API and a dozen child components). onKeydown is
// self-contained: it only reads event.target/event.key and calls navigation
// methods on `this`.

function makeContext() {
    return {
        diaporamaMode: false,
        showPrev: vi.fn(),
        showNext: vi.fn(),
        diaporama: vi.fn(),
    }
}

function keyEvent(key, target = {}) {
    return {
        key,
        target,
        preventDefault: vi.fn(),
    }
}

const onKeydown = album.methods.onKeydown

describe('album onKeydown', () => {
    it('space toggles the slideshow when not typing', () => {
        const ctx = makeContext()
        const e = keyEvent(' ')
        onKeydown.call(ctx, e)
        expect(ctx.diaporama).toHaveBeenCalledWith(true)
        expect(e.preventDefault).toHaveBeenCalled()
    })

    it('arrows navigate pages when not typing', () => {
        const ctx = makeContext()
        onKeydown.call(ctx, keyEvent('ArrowLeft'))
        onKeydown.call(ctx, keyEvent('ArrowUp'))
        expect(ctx.showPrev).toHaveBeenCalledTimes(2)
        onKeydown.call(ctx, keyEvent('ArrowRight'))
        onKeydown.call(ctx, keyEvent('ArrowDown'))
        expect(ctx.showNext).toHaveBeenCalledTimes(2)
    })

    it('ignores space while typing in a contenteditable caption', () => {
        const ctx = makeContext()
        const e = keyEvent(' ', { isContentEditable: true })
        onKeydown.call(ctx, e)
        expect(ctx.diaporama).not.toHaveBeenCalled()
        // The space character must still be inserted in the caption.
        expect(e.preventDefault).not.toHaveBeenCalled()
    })

    it('ignores arrows while typing in a contenteditable caption', () => {
        const ctx = makeContext()
        onKeydown.call(ctx, keyEvent('ArrowLeft', { isContentEditable: true }))
        onKeydown.call(ctx, keyEvent('ArrowRight', { isContentEditable: true }))
        expect(ctx.showPrev).not.toHaveBeenCalled()
        expect(ctx.showNext).not.toHaveBeenCalled()
    })

    it('ignores shortcuts in form fields (e.g. slideshow speed input)', () => {
        const ctx = makeContext()
        onKeydown.call(ctx, keyEvent(' ', { tagName: 'INPUT' }))
        onKeydown.call(ctx, keyEvent(' ', { tagName: 'TEXTAREA' }))
        expect(ctx.diaporama).not.toHaveBeenCalled()
    })

    it('leaves unrelated keys alone', () => {
        const ctx = makeContext()
        const e = keyEvent('a')
        onKeydown.call(ctx, e)
        expect(e.preventDefault).not.toHaveBeenCalled()
        expect(ctx.showPrev).not.toHaveBeenCalled()
        expect(ctx.showNext).not.toHaveBeenCalled()
        expect(ctx.diaporama).not.toHaveBeenCalled()
    })
})
