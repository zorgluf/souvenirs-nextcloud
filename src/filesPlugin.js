/**
 * Souvenirs integration with the Files app.
 *
 * Registers the "Open Album" action for album.json files using the modern
 * @nextcloud/files registerFileAction API, replacing the legacy
 * OCA.Files.fileActions API that was removed from the server.
 *
 * This module is built by vite (see the "filesPlugin" entry in
 * vite.config.js) and loaded on Files pages by js/fileaction.js.
 */
import { registerFileAction } from '@nextcloud/files'
import { generateUrl } from '@nextcloud/router'

const ALBUM_FILE_MIME = 'application/json'

// The core "t" global is available on Files pages, fall back to the
// raw english string if it is not.
const translate = typeof t === 'function' ? t : (app, text) => text

registerFileAction({
	id: 'souvenirs-open-album',

	displayName: () => translate('souvenirs', 'Open Album'),

	iconSvgInline: () =>
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">'
		+ '<path fill="currentColor" d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-13Zm.5 10V5.914L4.586 7.5 6.5 5.586 8.414 7.5 9.5 6.414 12 8.914V12H2Zm12-4.586L11.5 5.5l-2 2L8.414 6.414 6.5 8.326 4.586 6.5 2 9.086V3.5a.5.5 0 0 1 .5-.5h12a.5.5 0 0 1 .5.5v3.914ZM4.5 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>'
		+ '</svg>',

	enabled: ({ nodes }) => nodes.length > 0 && nodes.every((node) => node.mime === ALBUM_FILE_MIME),

	async exec({ node }) {
		// The album is the folder containing the album.json file
		window.location.href = generateUrl('apps/souvenirs') + '/#/show?apath=' + encodeURIComponent(node.dirname)
		return null
	},
})
