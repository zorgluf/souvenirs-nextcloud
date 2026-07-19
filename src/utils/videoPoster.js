/**
 * Poster-frame capture for video elements (issue #32).
 *
 * The Android app stores a generated thumbnail as the VideoElement's `image`
 * asset (ThumbnailUtils.createVideoThumbnail); the web equivalent is decoding
 * a frame with an off-DOM `<video>` and drawing it on a canvas. This is
 * best-effort by design: the returned promise NEVER rejects — a codec the
 * browser cannot decode, a canvas failure or a timeout all resolve to null,
 * and the caller saves the element without a poster.
 */

// A frame at t=0 is often black; aim ~1s in (or the middle of shorter clips).
const POSTER_TIME_S = 1
const POSTER_JPEG_QUALITY = 0.9

/**
 * Capture a poster frame of a video as a JPEG blob.
 *
 * @param {Blob} blob - the video bytes
 * @param {number} timeoutMs - give up (resolve null) after this long
 * @returns {Promise<Blob|null>} the JPEG poster, or null when capture failed
 */
export function captureVideoPoster(blob, timeoutMs = 30000) {
    return new Promise(resolve => {
        if (typeof URL.createObjectURL !== 'function') {
            resolve(null)
            return
        }
        const url = URL.createObjectURL(blob)
        const video = document.createElement('video')
        let done = false
        const finish = poster => {
            if (done) {
                return
            }
            done = true
            clearTimeout(timer)
            // Detach the media before revoking its URL, so the decoder does
            // not keep streaming from a dead object URL.
            video.removeAttribute('src')
            try {
                video.load()
            } catch (error) { /* already torn down */ }
            URL.revokeObjectURL(url)
            resolve(poster)
        }
        const timer = setTimeout(() => finish(null), timeoutMs)
        const draw = () => {
            const width = video.videoWidth
            const height = video.videoHeight
            const canvas = document.createElement('canvas')
            const context = width > 0 && height > 0 ? canvas.getContext('2d') : null
            if (context == null || typeof canvas.toBlob !== 'function') {
                finish(null)
                return
            }
            canvas.width = width
            canvas.height = height
            try {
                context.drawImage(video, 0, 0, width, height)
            } catch (error) {
                finish(null)
                return
            }
            canvas.toBlob(result => finish(result || null), 'image/jpeg', POSTER_JPEG_QUALITY)
        }
        video.muted = true
        video.playsInline = true
        video.preload = 'auto'
        video.addEventListener('error', () => finish(null))
        video.addEventListener('loadeddata', () => {
            const target = Number.isFinite(video.duration)
                ? Math.min(POSTER_TIME_S, video.duration / 2) : 0
            if (target > video.currentTime) {
                video.addEventListener('seeked', draw, { once: true })
                try {
                    video.currentTime = target
                } catch (error) {
                    draw()
                }
            } else {
                draw()
            }
        }, { once: true })
        video.src = url
    })
}
