import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { captureVideoPoster } from '../videoPoster.js'

// happy-dom does not decode media, so only the failure paths are testable
// here: the capture must resolve null (never reject) and release its object
// URL. The happy path is covered by the e2e verification against a browser.
describe('captureVideoPoster', () => {
    let createdVideo

    beforeEach(() => {
        URL.createObjectURL = vi.fn(() => 'blob:video')
        URL.revokeObjectURL = vi.fn()
        const realCreate = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation(tag => {
            const el = realCreate(tag)
            if (tag === 'video') {
                createdVideo = el
            }
            return el
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('resolves null when the video errors (undecodable codec)', async () => {
        const promise = captureVideoPoster(new Blob(['not-a-video']))
        createdVideo.dispatchEvent(new Event('error'))
        await expect(promise).resolves.toBeNull()
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video')
    })

    it('resolves null after the timeout when nothing loads', async () => {
        await expect(captureVideoPoster(new Blob(['x']), 20)).resolves.toBeNull()
        expect(URL.revokeObjectURL).toHaveBeenCalled()
    })

    it('resolves null when no frame size is available after load', async () => {
        const promise = captureVideoPoster(new Blob(['x']))
        // happy-dom leaves videoWidth/videoHeight at 0 and duration NaN, so
        // loadeddata goes straight to draw(), which must give up cleanly.
        createdVideo.dispatchEvent(new Event('loadeddata'))
        await expect(promise).resolves.toBeNull()
    })
})
