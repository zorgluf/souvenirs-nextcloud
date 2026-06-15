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
