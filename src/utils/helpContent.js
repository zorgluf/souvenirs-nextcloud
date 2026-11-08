/**
 * Content of the in-app user guide (issue #47), kept as plain data so the
 * dialog stays a thin renderer and the content can be unit-tested.
 *
 * Everything user-facing goes through t(): the functions build their result
 * at call time, so the strings resolve with the translations loaded.
 */

import { IMAGE_MIMES, VIDEO_MIMES, AUDIO_MIMES } from '../api/davApi.js'

/** The mimetype the Android app writes for 360° photos (see selement.vue). */
export const PANORAMA_MIME = 'application/vnd.google.panorama360+jpg'

/**
 * Human-readable name of every mimetype an album accepts. The tests check it
 * against the davApi lists, so a newly supported type cannot silently be
 * missing from the guide. Several mimetypes may share a label (de-duplicated
 * by formatLabels).
 */
export const MIME_LABELS = {
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'image/bmp': 'BMP',
    'image/tiff': 'TIFF',
    'image/svg+xml': 'SVG',
    'video/mp4': 'MP4',
    'video/webm': 'WebM',
    'video/ogg': 'Ogg',
    'video/quicktime': 'MOV',
    'video/x-matroska': 'MKV',
    'audio/mpeg': 'MP3',
    'audio/mp4': 'M4A',
    'audio/x-m4a': 'M4A',
    'audio/aac': 'AAC',
    'audio/ogg': 'Ogg',
    'audio/opus': 'Opus',
    'audio/wav': 'WAV',
    'audio/x-wav': 'WAV',
    'audio/flac': 'FLAC',
    'audio/webm': 'WebM',
}

/**
 * @param {Array<string>} mimes
 * @returns {Array<string>} the distinct labels, in list order; an unlabeled
 *   mimetype falls back to its subtype in upper case (e.g. "HEIC").
 */
export function formatLabels(mimes) {
    const labels = []
    for (const mime of mimes) {
        const label = MIME_LABELS[mime] || mime.replace(/^[^/]*\//, '').replace(/^x-/, '').toUpperCase()
        if (!labels.includes(label)) {
            labels.push(label)
        }
    }
    return labels
}

/** Ids of the guide sections, in display order. */
export const SECTION_IDS = ['structure', 'modes', 'media', 'shortcuts']

/**
 * The media kinds an album can hold, with their accepted formats.
 *
 * @param {{canEdit: boolean}} options
 */
export function getMediaKinds({ canEdit }) {
    const kinds = [
        {
            id: 'photo',
            title: t('souvenirs', 'Photos'),
            formats: formatLabels(IMAGE_MIMES),
            text: t('souvenirs', 'Shown framed in their tile. Click a photo to see it full size.'),
        },
        {
            id: 'panorama',
            title: t('souvenirs', '360° panoramas'),
            formats: [t('souvenirs', 'JPEG with Photo Sphere metadata')],
            text: t('souvenirs', 'Panoramas added from the Android app are recognized automatically: they slowly turn by themselves, you can drag inside to look around, and a click opens the interactive viewer.'),
        },
        {
            id: 'video',
            title: t('souvenirs', 'Videos'),
            formats: formatLabels(VIDEO_MIMES),
            text: t('souvenirs', 'Videos play in a loop in their tile while the page is displayed. Click one to open it in a large player with sound and controls.'),
        },
        {
            id: 'audio',
            title: t('souvenirs', 'Audio'),
            formats: formatLabels(AUDIO_MIMES),
            text: t('souvenirs', 'A soundtrack for a page, one track per page: it starts when the page is displayed and keeps playing on the following pages until another track takes over.'),
        },
        {
            id: 'text',
            title: t('souvenirs', 'Text'),
            formats: [],
            text: canEdit
                ? t('souvenirs', 'Free text tiles, edited in place in edit mode. The text size adapts to the tile.')
                : t('souvenirs', 'Free text tiles. The text size adapts to the tile.'),
        },
        {
            id: 'paint',
            title: t('souvenirs', 'Drawings'),
            formats: [],
            text: canEdit
                ? t('souvenirs', 'Freehand drawing over a whole page, with a pen, an eraser and colors. The drawing stays on top of the tiles and is never moved or resized.')
                : t('souvenirs', 'Freehand drawing over a whole page, on top of the tiles.'),
        },
    ]
    return kinds
}

/**
 * Keyboard shortcuts and pointer gestures, grouped for display.
 *
 * Each item: `{ id, keys, label }` where `keys` is a list of alternatives,
 * each alternative a list of keys pressed together:
 * `[['ArrowLeft'], ['ArrowUp']]` reads "← or ↑", `[['Shift', 'Enter']]` reads
 * "Shift + Enter". Gesture items have `gesture` text instead of `keys`.
 *
 * @param {{canEdit: boolean, isTouchDevice: boolean}} options
 */
export function getShortcutGroups({ canEdit, isTouchDevice }) {
    const groups = []

    groups.push({
        id: 'navigation',
        title: t('souvenirs', 'Turning pages'),
        items: [
            { id: 'prev', keys: [['←'], ['↑']], label: t('souvenirs', 'Previous page') },
            { id: 'next', keys: [['→'], ['↓']], label: t('souvenirs', 'Next page') },
            isTouchDevice
                ? { id: 'swipe', gesture: t('souvenirs', 'Swipe'), label: t('souvenirs', 'Turn the page') }
                : { id: 'click-arrows', gesture: t('souvenirs', 'Side arrows, page dots'), label: t('souvenirs', 'Turn the page, jump to a page') },
        ],
    })

    groups.push({
        id: 'display',
        title: t('souvenirs', 'Slideshow and display'),
        items: [
            { id: 'slideshow', keys: [['Space']], label: t('souvenirs', 'Start or stop the slideshow') },
            { id: 'close-video', keys: [['Esc']], label: t('souvenirs', 'Close the video player, leave fullscreen') },
            { id: 'help', keys: [['?']], label: t('souvenirs', 'Open this guide') },
        ],
    })

    groups.push({
        id: 'panorama',
        title: t('souvenirs', '360° panoramas'),
        items: [
            { id: 'pano-look', gesture: t('souvenirs', 'Drag'), label: t('souvenirs', 'Look around') },
            { id: 'pano-zoom', keys: [['Ctrl', t('souvenirs', 'wheel')]], gesture: t('souvenirs', 'Pinch'), label: t('souvenirs', 'Zoom in the full-size viewer') },
        ],
    })

    if (canEdit) {
        groups.push({
            id: 'editing',
            title: t('souvenirs', 'Editing'),
            items: [
                { id: 'edit', keys: [['E']], label: t('souvenirs', 'Enter or leave edit mode') },
                { id: 'select', gesture: t('souvenirs', 'Click a tile'), label: t('souvenirs', 'Select it: shows its resize corners and framing button') },
                { id: 'move', gesture: t('souvenirs', 'Drag the move handle'), label: t('souvenirs', 'Move the tile to another slot or page; dropping it on another tile swaps them') },
                { id: 'edge', gesture: t('souvenirs', 'Hold a dragged tile near the edge'), label: t('souvenirs', 'Turn the page while dragging') },
                { id: 'resize', gesture: t('souvenirs', 'Drag a corner'), label: t('souvenirs', 'Resize the tile') },
                { id: 'pan', gesture: t('souvenirs', 'Drag inside a selected photo'), label: t('souvenirs', 'Reframe the photo in its tile') },
                { id: 'zoom', keys: [[t('souvenirs', 'wheel')]], gesture: t('souvenirs', 'Pinch'), label: t('souvenirs', 'Zoom the photo in its tile') },
            ],
        })
        groups.push({
            id: 'captions',
            title: t('souvenirs', 'Text editing'),
            items: [
                { id: 'save-text', keys: [['Enter']], label: t('souvenirs', 'Save the text') },
                { id: 'newline', keys: [['Shift', 'Enter']], label: t('souvenirs', 'New line') },
            ],
        })
    }

    return groups
}
