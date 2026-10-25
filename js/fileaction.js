/**
 * Files app entry point, loaded on Files pages via the
 * LoadAdditionalScriptsEvent listener (see lib/AppInfo/Application.php).
 *
 * The legacy OCA.Files.fileActions API and the global jQuery it relied on
 * no longer exist in recent Nextcloud versions, so this file no longer
 * registers the action itself. It now only loads the built module
 * src/filesPlugin.js, which registers the "Open Album" action with the
 * @nextcloud/files registerFileAction API.
 *
 * This script is a plain (classic) script: it reads the vite manifest to
 * resolve the (possibly hashed) file name of the built plugin, then
 * dynamically imports it. Dynamic import() is allowed in classic scripts.
 */
;(function () {
	'use strict'

	if (typeof OC === 'undefined') {
		return
	}

	// no-cache: revalidate the manifest, a stale cached copy would point to
	// an outdated (or missing) build of the plugin.
	fetch(OC.linkTo('souvenirs', 'js/vite/.vite/manifest.json'), { cache: 'no-cache' })
		.then((response) => {
			if (!response.ok) {
				throw new Error('HTTP status ' + response.status)
			}
			return response.json()
		})
		.then((manifest) => {
			const entry = manifest['src/filesPlugin.js']
			if (!entry) {
				throw new Error('src/filesPlugin.js is missing from the vite manifest, run "make"')
			}
			return import(/* @vite-ignore */ OC.linkTo('souvenirs', 'js/vite/' + entry.file))
		})
		.catch((error) => {
			console.error('Failed to load the Souvenirs files plugin', error)
		})
})()
