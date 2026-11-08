import { describe, it, expect } from 'vitest'
import { IMAGE_MIMES, VIDEO_MIMES, AUDIO_MIMES } from '../../api/davApi.js'
import { MIME_LABELS, formatLabels, getMediaKinds, getShortcutGroups, SECTION_IDS } from '../helpContent.js'

describe('help content: formats', () => {
    it('labels every mimetype an album accepts', () => {
        // Adding a mimetype to davApi without a label here would leave the
        // guide incomplete (the fallback label is a raw subtype).
        for (const mime of [...IMAGE_MIMES, ...VIDEO_MIMES, ...AUDIO_MIMES]) {
            expect(MIME_LABELS, mime).toHaveProperty(mime)
        }
    })

    it('de-duplicates labels shared by several mimetypes', () => {
        expect(formatLabels(['audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'])).toEqual(['WAV', 'M4A'])
    })

    it('falls back to the upper-case subtype for an unknown mimetype', () => {
        expect(formatLabels(['image/heic', 'video/x-msvideo'])).toEqual(['HEIC', 'MSVIDEO'])
    })
})

describe('help content: media kinds', () => {
    it('lists each kind with its formats', () => {
        const kinds = getMediaKinds({ canEdit: true })
        const byId = Object.fromEntries(kinds.map(k => [k.id, k]))
        expect(Object.keys(byId)).toEqual(['photo', 'panorama', 'video', 'audio', 'text', 'paint'])
        expect(byId.photo.formats).toContain('JPEG')
        expect(byId.video.formats).toContain('MP4')
        expect(byId.audio.formats).toContain('MP3')
        // Text and drawings are made in the app, they have no file format.
        expect(byId.text.formats).toEqual([])
        expect(byId.paint.formats).toEqual([])
    })

    it('does not tell a public viewer how to edit', () => {
        const text = getMediaKinds({ canEdit: false }).map(k => k.text).join(' ')
        expect(text).not.toMatch(/edit mode/i)
    })
})

describe('help content: shortcuts', () => {
    it('has the guide sections in display order', () => {
        expect(SECTION_IDS).toEqual(['structure', 'modes', 'media', 'shortcuts'])
    })

    it('shows editing shortcuts to the owner only', () => {
        const owner = getShortcutGroups({ canEdit: true, isTouchDevice: false })
        const viewer = getShortcutGroups({ canEdit: false, isTouchDevice: false })
        expect(owner.map(g => g.id)).toEqual(['navigation', 'display', 'panorama', 'editing', 'captions'])
        expect(viewer.map(g => g.id)).toEqual(['navigation', 'display', 'panorama'])
        const viewerKeys = viewer.flatMap(g => g.items).flatMap(i => i.keys || []).flat()
        expect(viewerKeys).not.toContain('E')
        const ownerKeys = owner.flatMap(g => g.items).flatMap(i => i.keys || []).flat()
        expect(ownerKeys).toContain('E')
    })

    it('documents the shortcuts the album actually handles', () => {
        const items = getShortcutGroups({ canEdit: true, isTouchDevice: false }).flatMap(g => g.items)
        const byId = Object.fromEntries(items.map(i => [i.id, i]))
        expect(byId.prev.keys).toEqual([['←'], ['↑']])
        expect(byId.next.keys).toEqual([['→'], ['↓']])
        expect(byId.slideshow.keys).toEqual([['Space']])
        expect(byId.help.keys).toEqual([['?']])
        expect(byId.newline.keys).toEqual([['Shift', 'Enter']])
    })

    it('talks about swipes on touch devices and arrows otherwise', () => {
        const touch = getShortcutGroups({ canEdit: false, isTouchDevice: true }).flatMap(g => g.items)
        const mouse = getShortcutGroups({ canEdit: false, isTouchDevice: false }).flatMap(g => g.items)
        expect(touch.some(i => i.id === 'swipe')).toBe(true)
        expect(touch.some(i => i.id === 'click-arrows')).toBe(false)
        expect(mouse.some(i => i.id === 'click-arrows')).toBe(true)
        expect(mouse.some(i => i.id === 'swipe')).toBe(false)
    })

    it('every item has a label and either keys or a gesture', () => {
        const items = getShortcutGroups({ canEdit: true, isTouchDevice: true }).flatMap(g => g.items)
        for (const item of items) {
            expect(item.label, item.id).toBeTruthy()
            expect(Boolean(item.keys || item.gesture), item.id).toBe(true)
        }
    })
})
