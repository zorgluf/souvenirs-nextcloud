/**
 * Reads of the album from the server and classification of request
 * failures, for the offline feature (issue #22).
 *
 * A failed request is one of:
 *   network   the server could not be reached (or a gateway in front of it
 *             gave up): the edit is kept locally and synced later
 *   auth      the session is gone: same, after logging in again
 *   notfound  the album (or page) does not exist on the server
 *   server    anything else: reported to the user as before
 */

import { generateUrl } from '@nextcloud/router'
import { normalizePath } from './mediaKeys.js'

export class RemoteError extends Error {
    /**
     * @param {'network'|'auth'|'notfound'|'server'} kind
     * @param {number} [status] - the HTTP status, when there is one
     */
    constructor(kind, status) {
        super('Souvenirs request failed (' + kind + (status ? ' ' + status : '') + ')')
        this.name = 'RemoteError'
        this.kind = kind
        this.status = status
    }
}

/**
 * Kind of a failure thrown by fetch(), albumApi.js (errors carrying the
 * HTTP `status`) or this module.
 *
 * @param {Error} error
 * @returns {'network'|'auth'|'notfound'|'server'}
 */
export function errorKind(error) {
    if (error instanceof RemoteError) {
        return error.kind
    }
    if (error == null) {
        return 'server'
    }
    if (error.status === undefined) {
        // fetch() rejects with a TypeError when the network fails
        return (error instanceof TypeError || error.name === 'TypeError') ? 'network' : 'server'
    }
    if (error.status === 401) {
        return 'auth'
    }
    if (error.status === 404) {
        return 'notfound'
    }
    if (error.status === 502 || error.status === 503 || error.status === 504) {
        return 'network'
    }
    return 'server'
}

/** Whether a failed write should be kept locally instead of reported. */
export function isDeferrable(error) {
    const kind = errorKind(error)
    return kind === 'network' || kind === 'auth'
}

async function getJson(url) {
    let response
    try {
        response = await fetch(url, {
            headers: { 'requesttoken': OC.requestToken, 'Accept': 'application/json' },
            credentials: 'same-origin',
        })
    } catch (error) {
        throw new RemoteError('network')
    }
    // a session that expired answers 401, or redirects to the login page
    if (response.status === 401 || response.redirected) {
        throw new RemoteError('auth', response.status)
    }
    if (!response.ok) {
        throw new RemoteError(errorKind({ status: response.status }), response.status)
    }
    try {
        return await response.json()
    } catch (error) {
        throw new RemoteError('server', response.status)
    }
}

/**
 * The full album stored in a folder (Api2Controller::getAlbumFull), with
 * its `path`.
 *
 * @param {string} path - album folder relative to the user's files
 * @returns {Promise<object>}
 */
export function fetchAlbumByPath(path) {
    return getJson(generateUrl('/apps/souvenirs/apiv2/album/unknown/full')
        + '?apath=' + encodeURIComponent('/' + normalizePath(path)))
}

/**
 * The album's summary by id (Api2Controller::getAlbum): tells where the
 * album lives now, should its folder have been renamed.
 *
 * @param {string} id
 * @returns {Promise<object>}
 */
export function fetchAlbumSummary(id) {
    return getJson(generateUrl('/apps/souvenirs/apiv2/album/') + encodeURIComponent(id))
}

/**
 * The full album of a record: by its folder, or, when the folder is gone,
 * wherever the server's index says the album now is.
 *
 * @param {{id: string, path: string}} record
 * @returns {Promise<object>} the full album, `path` included
 * @throws {RemoteError} kind `notfound` when the album no longer exists
 */
export async function fetchAlbumOfRecord(record) {
    try {
        return await fetchAlbumByPath(record.path)
    } catch (error) {
        if (errorKind(error) !== 'notfound' || !record.id) {
            throw error
        }
    }
    const summary = await fetchAlbumSummary(record.id)
    if (!summary.path || normalizePath(summary.path) === normalizePath(record.path)) {
        throw new RemoteError('notfound', 404)
    }
    return fetchAlbumByPath(summary.path)
}
