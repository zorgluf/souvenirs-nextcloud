/**
 * Centralized client for the album write (edit) endpoints.
 *
 * All editing HTTP calls go through here so there is a single place that knows
 * the apiv2 URL shape, attaches the Nextcloud request token, and handles the
 * response. Mirrors the existing fetch() pattern used elsewhere in the app
 * (see album-item.vue), so it stays consistent with the read calls.
 *
 * Adding a new editable field later means adding one function here.
 */

/**
 * Build the common request headers, including the Nextcloud CSRF token.
 * @returns {object} headers for a JSON POST request
 */
function jsonHeaders() {
    return {
        'requesttoken': OC.requestToken,
        'Content-Type': 'application/json',
    }
}

/**
 * Throw if the HTTP response is not successful, so callers can .catch() it.
 * @param {Response} response
 * @returns {Response}
 */
function ensureOk(response) {
    if (!response.ok) {
        throw new Error('Souvenirs API request failed with status ' + response.status)
    }
    return response
}

/**
 * Persist a single page of an album.
 *
 * The backend (Api2Controller::postPage) merges the posted fields into the
 * existing page and replaces the `elements` array wholesale, so we send the
 * FULL elements array. Because the caller round-trips the original element
 * objects (only mutating the changed field), all unknown element fields are
 * preserved on disk.
 *
 * @param {string} albumId - the album id
 * @param {object} page - the full page object, including `id` and `elements`
 * @returns {Promise<Response>}
 */
export function updatePage(albumId, page) {
    return fetch('apiv2/album/' + encodeURIComponent(albumId) + '/page/' + encodeURIComponent(page.id), {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ elements: page.elements }),
    }).then(ensureOk)
}

/**
 * Patch album-level fields (e.g. name). Only the provided fields are sent; the
 * backend merges them and preserves all other album.json fields.
 *
 * Currently unused by the UI (album title editing is future work) but provided
 * so the editing surface can grow without touching call sites.
 *
 * @param {string} albumId - the album id
 * @param {object} fields - a map of field name -> new value
 * @returns {Promise<Response>}
 */
export function updateAlbum(albumId, fields) {
    return fetch('apiv2/album/' + encodeURIComponent(albumId), {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(fields),
    }).then(ensureOk)
}

/**
 * Create a new, blank album with the given id (Api2Controller::createAlbum). The
 * backend names the album folder after the current timestamp; `name`/`date` are
 * set afterwards with updateAlbum. Rejects (409) if the id already exists.
 *
 * @param {string} albumId - the new album's id (a generated uuid)
 * @returns {Promise<Response>}
 */
export function createAlbum(albumId) {
    return fetch('apiv2/album/' + encodeURIComponent(albumId), {
        method: 'PUT',
        headers: { 'requesttoken': OC.requestToken },
    }).then(ensureOk)
}

/**
 * Create a new page in an album at a given position (Api2Controller::createPage).
 * The backend inserts the page at `pos` (0 = start, pages.length = append) and
 * stamps its lastEditDate.
 *
 * @param {string} albumId - the album id
 * @param {number} pos - the insert index
 * @param {object} page - the new page, e.g. `{ id, elements: [] }`
 * @returns {Promise<Response>}
 */
export function createPage(albumId, pos, page) {
    return fetch('apiv2/album/' + encodeURIComponent(albumId) + '/page/' + encodeURIComponent(pos), {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify(page),
    }).then(ensureOk)
}

/**
 * Move a page to a new position (Api2Controller::movePage). The backend's
 * Album::movePage removes the page first, then re-inserts it, so the `pos` to
 * pass is not the final index: to move the page at index `i`, pass `i - 1` to
 * move it left and `i + 2` to move it right.
 *
 * @param {string} albumId - the album id
 * @param {string} pageId - the page id
 * @param {number} pos - the backend position argument (see above)
 * @returns {Promise<Response>}
 */
export function movePage(albumId, pageId, pos) {
    return fetch('apiv2/album/' + encodeURIComponent(albumId) + '/page/' + encodeURIComponent(pageId) + '/pos/' + encodeURIComponent(pos), {
        method: 'POST',
        headers: { 'requesttoken': OC.requestToken },
    }).then(ensureOk)
}

/**
 * Delete a page from an album (Api2Controller::DeletePage).
 *
 * @param {string} albumId - the album id
 * @param {string} pageId - the page id
 * @returns {Promise<Response>}
 */
export function deletePage(albumId, pageId) {
    return fetch('apiv2/album/' + encodeURIComponent(albumId) + '/page/' + encodeURIComponent(pageId), {
        method: 'DELETE',
        headers: { 'requesttoken': OC.requestToken },
    }).then(ensureOk)
}

/**
 * Ask the backend to link an existing Nextcloud file into the album as an asset
 * (Api2Controller::assetSearch). The server searches the user's files for one
 * matching `name` and `size`, and on a match writes a `<asset>.lnk` pointer in
 * the album's data folder (no copy/upload). The element's `image` can then point
 * at `asset` and the preview endpoint resolves it through that link.
 *
 * Caveats inherited from the backend: matching is by name+size (not exact path),
 * and files located inside the Souvenirs albums root are skipped.
 *
 * @param {string} albumId - the album id
 * @param {string} asset - the in-album asset path to create, e.g. "data/<uuid>.jpg"
 * @param {string} name - the original file name to search for
 * @param {number} size - the original file size in bytes (must match)
 * @returns {Promise<object>} the parsed JSON, `{ status: "found" | "notfound" }`
 */
export function searchAsset(albumId, asset, name, size) {
    const params = new URLSearchParams({
        asset: asset,
        asset_name: name,
        asset_size: String(size),
    })
    return fetch('apiv2/album/' + encodeURIComponent(albumId) + '/assetsearch?' + params.toString(), {
        headers: { 'requesttoken': OC.requestToken },
    }).then(ensureOk).then(response => response.json())
}

/**
 * Ask the backend to garbage-collect unused assets of an album
 * (Api2Controller::cleanAssets): data files no longer referenced by any element
 * are deleted, and remaining ones are de-duplicated against the user's files.
 * Used after removing an element so its orphaned asset does not linger on disk.
 *
 * @param {string} albumId - the album id
 * @returns {Promise<Response>}
 */
export function cleanAssets(albumId) {
    return fetch('apiv2/album/' + encodeURIComponent(albumId) + '/clean', {
        headers: { 'requesttoken': OC.requestToken },
    }).then(ensureOk)
}
