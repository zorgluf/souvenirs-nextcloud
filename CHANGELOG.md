## 2.7.0 - 2026-11-17
### Added
- Offline edition ([#22](https://github.com/zorgluf/souvenirs-nextcloud/issues/22), [#62](https://github.com/zorgluf/souvenirs-nextcloud/pull/62)): every album opened once is remembered by the browser and can be viewed and edited without the server; changes are sent when it is reachable again (when the album is opened, on reconnection and in the background from the album list)
- Conflicts are never resolved silently: when the same part of an album (album info, page structure, content of a page) was changed on the device and elsewhere, the album is read-only until you choose which version to keep, part by part or for everything [#62](https://github.com/zorgluf/souvenirs-nextcloud/pull/62)
- Offline copies of the media, album by album: the offline button of an album in the list keeps its photos, videos and sounds on the device (estimated size shown before the download, progress, cancel) and shows its sync status [#62](https://github.com/zorgluf/souvenirs-nextcloud/pull/62)
- "Offline" dialog in the album list: a switch to work offline by choice (slow or paid connection: no request leaves the device until it is switched off) and the storage used by the offline copies [#62](https://github.com/zorgluf/souvenirs-nextcloud/pull/62)
- The app starts without a connection (service worker, needs HTTPS) and can be installed from the browser menu [#62](https://github.com/zorgluf/souvenirs-nextcloud/pull/62)
- "Offline" section in the in-app user guide [#62](https://github.com/zorgluf/souvenirs-nextcloud/pull/62)

### Changed
- Creating, deleting and sharing albums, browsing Nextcloud files and the ZIP download need the server and are disabled while offline [#62](https://github.com/zorgluf/souvenirs-nextcloud/pull/62)
- The data kept on the device is cleared on logout and when another account opens the app, after a confirmation if some changes were not sent yet [#62](https://github.com/zorgluf/souvenirs-nextcloud/pull/62)

### Fixed
- Album list unusable on Nextcloud 35, which no longer provides the `moment` library: album and share expiry dates are now formatted by the browser [#62](https://github.com/zorgluf/souvenirs-nextcloud/pull/62)
- Reloading the page of an open album returned a 404 error [#62](https://github.com/zorgluf/souvenirs-nextcloud/pull/62)

## 2.6.1 - 2026-11-08
### Added
- In-app user guide, from the "Help (?)" entry of the album menu or the "?" key: how an album is built, the viewing / editing / slideshow / fullscreen modes, the supported media and the keyboard shortcuts ([#47](https://github.com/zorgluf/souvenirs-nextcloud/issues/47), [#61](https://github.com/zorgluf/souvenirs-nextcloud/pull/61))

### Fixed
- In edit mode, elements are selected by click or tap before they can be panned, zoomed or resized, so a touch drag on an image scrolls the album; pages get a dotted separator ([#56](https://github.com/zorgluf/souvenirs-nextcloud/issues/56), [#60](https://github.com/zorgluf/souvenirs-nextcloud/pull/60))
- New albums are created with the default element margin, so elements no longer touch each other ([#57](https://github.com/zorgluf/souvenirs-nextcloud/issues/57), [#59](https://github.com/zorgluf/souvenirs-nextcloud/pull/59))
- Reset/fit framing button on video elements in edit mode ([#55](https://github.com/zorgluf/souvenirs-nextcloud/issues/55), [#58](https://github.com/zorgluf/souvenirs-nextcloud/pull/58))

## 2.6.0 - 2026-10-27
### Added
- API endpoints `POST apiv2/album/{id}/pages` (several page operations in one album write) and `POST apiv2/album/{id}/assetsearch` (link several files at once); existing endpoints keep their contract (the album load of the web editor, with `apath`, also returns the album path) [#52](https://github.com/zorgluf/souvenirs-nextcloud/pull/52)
- `Server-Timing` header on API and preview responses, to measure the edit-mode API of an instance [#52](https://github.com/zorgluf/souvenirs-nextcloud/pull/52)
- Database index on the albums table (user, album id) [#52](https://github.com/zorgluf/souvenirs-nextcloud/pull/52)
- Support of Nextcloud 35 [#54](https://github.com/zorgluf/souvenirs-nextcloud/pull/54)

### Changed
- Faster edit mode on slow storage or a remote database ([#50](https://github.com/zorgluf/souvenirs-nextcloud/issues/50), [#52](https://github.com/zorgluf/souvenirs-nextcloud/pull/52)): text, resize, pan & zoom and layout edits are saved in the background (no more blocking overlay), adding media and moving an element to another page take one request instead of one per page, uploads no longer probe the server, and the asset cleanup runs in the background and no longer searches the whole user tree on every edit
- Posters of videos picked from Nextcloud are captured while streaming the video (or taken from the server preview) instead of downloading the whole file [#52](https://github.com/zorgluf/souvenirs-nextcloud/pull/52)
- Page toolbar buttons (add media, add text, paint, change layout) are icon-only, in a horizontal row

### Fixed
- Concurrent edits of the same album (two tabs, web and Android) could overwrite each other [#52](https://github.com/zorgluf/souvenirs-nextcloud/pull/52)
- Asset cleanup could delete a file uploaded moments before the page referencing it was saved [#52](https://github.com/zorgluf/souvenirs-nextcloud/pull/52)
- Linking existing media matched files whose name merely contained the searched one [#52](https://github.com/zorgluf/souvenirs-nextcloud/pull/52)
- Preview revalidations (304) regenerated the preview every time [#52](https://github.com/zorgluf/souvenirs-nextcloud/pull/52)
- Asset and preview endpoints only serve files of the album owner, whatever a link file points to [#52](https://github.com/zorgluf/souvenirs-nextcloud/pull/52)
- Selection frame missing on some chosen media in the media chooser [#49](https://github.com/zorgluf/souvenirs-nextcloud/issues/49)
- Deleting an unknown page returns 404 instead of a server error
- Album creation no longer uses the deprecated PHP `strftime` function
- Admin settings page no longer relies on the global jQuery library removed by the server [#54](https://github.com/zorgluf/souvenirs-nextcloud/pull/54)
- Register the "Open Album" file action with the modern @nextcloud/files API: the legacy OCA.Files.fileActions API was removed by the server [#54](https://github.com/zorgluf/souvenirs-nextcloud/pull/54)

## 2.5.0 - 2026-10-14
### Added
- API endpoint `GET apiv2/albums` listing all albums with their details in one call, so the Android app no longer fetches albums one by one ([souvenirs-android#37](https://github.com/zorgluf/souvenirs-android/issues/37))

## 2.4.1 - 2026-09-02
### Fixed
- Write integer geometry and zoom values into album.json so the Android app can parse albums edited on the web
- Return 404 instead of a server error when an album cannot be resolved by id or path

## 2.4.0 - 2026-07-24
### Added
- Add videos to albums from the web editor [#41](https://github.com/zorgluf/souvenirs-nextcloud/pull/41)
- Add audio to album pages from the web editor [#44](https://github.com/zorgluf/souvenirs-nextcloud/pull/44)
- Add multiple media at once from the web editor [#42](https://github.com/zorgluf/souvenirs-nextcloud/pull/42)
- Expiration date on public shares [#43](https://github.com/zorgluf/souvenirs-nextcloud/pull/43)

### Changed
- Reset button toggles between cover fit and whole-image fit [#46](https://github.com/zorgluf/souvenirs-nextcloud/pull/46)
- Blocking loading state during edit API calls [#40](https://github.com/zorgluf/souvenirs-nextcloud/pull/40)
- New appstore screenshots, one per feature [#38](https://github.com/zorgluf/souvenirs-nextcloud/pull/38)

### Fixed
- Keyboard shortcuts no longer trigger while editing a text element
- Fill the hidden-footer band on public share pages
- Keep upload button clear of the modal close button in media chooser

## 2.3.0 - 2026-07-14
### Added
- Mosaic image chooser dialog with direct upload [#37](https://github.com/zorgluf/souvenirs-nextcloud/pull/37)
- Paint mode on page in edit mode [#35](https://github.com/zorgluf/souvenirs-nextcloud/pull/35)
- Pan and zoom image elements in edit mode [#29](https://github.com/zorgluf/souvenirs-nextcloud/pull/29)
- Resize elements with corner drag handles in edit mode [#28](https://github.com/zorgluf/souvenirs-nextcloud/pull/28)
- Support of Nextcloud 34

### Changed
- Cleaner photosphere viewer in album view
- Center add page icon [#34](https://github.com/zorgluf/souvenirs-nextcloud/pull/34)
- Security hardening of share tokens, public endpoints, and input handling [#23](https://github.com/zorgluf/souvenirs-nextcloud/pull/23)

## 2.2.0 - 2026-07-05
### Added
- Drag and drop elements in edit mode [#18](https://github.com/zorgluf/souvenirs-nextcloud/pull/18)

### Changed
- Fix DE translation on app name [#16](https://github.com/zorgluf/souvenirs-nextcloud/issues/16)

## 2.1.1 - 2026-07-02
### Changed
- Better changelog handling and app description [#17](https://github.com/zorgluf/souvenirs-nextcloud/pull/17)

## 2.1.0 – 2026-06-30
### Added
- First full set of album edition features

## 2.0.1 – 2026-06-27
### Added
- Start editing features : only texts for the momemnt, more coming soon

### Changed
- New synchronisation mechanism : better support of conflicts. Need v3+ on android Souvenirs application if used from this application.

### Removed
- Old synchronisation API used by android Souvenirs application (v1 and v2 android version) - Breaking change for these versions

## 1.12.2 – 2026-01-07
### Fixed
- Fix display menu bug with photosphere
