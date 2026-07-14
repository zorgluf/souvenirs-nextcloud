/**
 * Minimal WebDAV client for browsing the user's files from the image chooser.
 *
 * Deliberately hand-rolled on plain fetch() + OC.requestToken +
 * generateRemoteUrl('webdav'), like the rest of the API layer (albumApi.js),
 * rather than @nextcloud/files' getClient(): the latter pulls its auth and
 * files root from @nextcloud/auth DOM attributes that neither the SPA nor the
 * test setup provide, and the legacy /remote.php/webdav endpoint needs no uid
 * in the URL.
 */

import { generateRemoteUrl, generateUrl } from '@nextcloud/router'

/**
 * The image mimetypes an album element can display. Shared by the chooser's
 * grid filter and its upload input's `accept` attribute (formerly the file
 * picker's mimetype filter in album.vue).
 */
export const IMAGE_MIMES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'image/svg+xml',
]

/**
 * Encode a user-files-relative path for use in a WebDAV URL: per-segment
 * percent-encoding, empty segments dropped so the URL never contains a double
 * slash (same rules as albumApi.js uploadAsset).
 * @param {string} path
 * @returns {string}
 */
function encodePath(path) {
    return path.split('/')
        .filter(segment => segment !== '')
        .map(encodeURIComponent)
        .join('/')
}

/**
 * The element's XML name with any namespace prefix stripped, lowercased.
 * Browsers already strip the prefix from localName when parsing XML;
 * happy-dom keeps it ("d:response"), so both spellings are normalized here.
 * @param {Element} el
 * @returns {string}
 */
function davName(el) {
    return (el.localName || '').toLowerCase().split(':').pop()
}

/**
 * Read the text of the first descendant of `parent` with the given DAV local
 * name, or '' when absent.
 * @param {Element} parent
 * @param {string} localName - e.g. "getcontenttype"
 * @returns {string}
 */
function davText(parent, localName) {
    for (const el of parent.getElementsByTagName('*')) {
        if (davName(el) === localName) {
            return el.textContent
        }
    }
    return ''
}

/**
 * Whether the propstat element declares the entry a folder
 * (<d:resourcetype><d:collection/></d:resourcetype>).
 * @param {Element} parent
 * @returns {boolean}
 */
function davIsCollection(parent) {
    for (const el of parent.getElementsByTagName('*')) {
        if (davName(el) === 'collection') {
            return true
        }
    }
    return false
}

/**
 * List a folder of the user's files over WebDAV (PROPFIND Depth: 1).
 *
 * Returns the raw entries — no image filtering or sorting, that is the
 * caller's presentation concern. Each entry is
 * `{ basename, path, isFolder, mime, size, mtime, fileid }` with `path`
 * relative to the user's files root and `mtime` in epoch milliseconds.
 *
 * @param {string} path - folder path relative to the user's files root, '' = root
 * @returns {Promise<Array<object>>}
 */
export function listFolder(path) {
    const encodedPath = encodePath(path)
    const url = generateRemoteUrl('webdav') + (encodedPath ? '/' + encodedPath : '')
    return fetch(url, {
        method: 'PROPFIND',
        headers: {
            'requesttoken': OC.requestToken,
            'Depth': '1',
            'Content-Type': 'application/xml',
        },
        body: '<?xml version="1.0"?>\n'
            + '<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">\n'
            + '  <d:prop>\n'
            + '    <d:resourcetype/><d:getcontenttype/><d:getcontentlength/>\n'
            + '    <d:getlastmodified/><oc:fileid/>\n'
            + '  </d:prop>\n'
            + '</d:propfind>',
    }).then(response => {
        if (!response.ok) {
            throw new Error('WebDAV PROPFIND failed with status ' + response.status)
        }
        return response.text()
    }).then(xml => parseMultistatus(xml, path))
}

/**
 * Parse a WebDAV 207 multistatus document into folder entries.
 * @param {string} xml - the response body
 * @param {string} requestedPath - the listed folder, to skip its self entry
 * @returns {Array<object>}
 */
function parseMultistatus(xml, requestedPath) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const normalizedRequested = requestedPath.split('/').filter(s => s !== '').join('/')
    const entries = []
    for (const response of doc.getElementsByTagName('*')) {
        if (davName(response) !== 'response') {
            continue
        }
        const href = davText(response, 'href')
        // The href is the absolute server path; the part after the WebDAV
        // endpoint is the user-files-relative path (percent-encoded).
        const match = href.match(/\/remote\.php\/webdav(\/.*)?$/)
        if (match == null) {
            continue
        }
        const relPath = (match[1] || '')
            .split('/')
            .filter(segment => segment !== '')
            .map(decodeURIComponent)
            .join('/')
        // The collection lists itself first: not an entry of the folder.
        if (relPath === normalizedRequested) {
            continue
        }
        // Only the 200-status propstat holds real values; a 404 propstat lists
        // the props the entry lacks. davText over the whole response would mix
        // them up, so scope reads to the successful propstat.
        let okProps = null
        for (const el of response.getElementsByTagName('*')) {
            if (davName(el) === 'propstat' && davText(el, 'status').includes('200')) {
                okProps = el
                break
            }
        }
        if (okProps == null) {
            continue
        }
        const mtimeText = davText(okProps, 'getlastmodified')
        const mtime = mtimeText ? Date.parse(mtimeText) : 0
        entries.push({
            basename: relPath.split('/').pop(),
            path: relPath,
            isFolder: davIsCollection(okProps),
            mime: davText(okProps, 'getcontenttype'),
            size: Number(davText(okProps, 'getcontentlength')) || 0,
            mtime: Number.isNaN(mtime) ? 0 : mtime,
            fileid: davText(okProps, 'fileid'),
        })
    }
    return entries
}

/**
 * Thumbnail URL for an arbitrary user file, via Nextcloud's core preview
 * endpoint (the app's own preview route only serves in-album assets).
 * `a=1` keeps the aspect ratio; the chooser tile crops with object-fit.
 *
 * @param {string} fileid - the file's oc:fileid as returned by listFolder
 * @param {number} size - requested bounding box in pixels
 * @returns {string}
 */
export function getPreviewUrl(fileid, size = 256) {
    return generateUrl('/core/preview')
        + '?fileId=' + encodeURIComponent(fileid)
        + '&x=' + size + '&y=' + size + '&a=1'
}
