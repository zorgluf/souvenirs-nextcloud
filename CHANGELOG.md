## Unreleased
### Changed
- Faster edit mode on slow storage or a remote database [#50](https://github.com/zorgluf/souvenirs-nextcloud/issues/50): text, resize, pan & zoom and layout edits are saved in the background (no more blocking overlay), adding media and moving an element to another page take one request instead of one per page, uploads no longer probe the server, and the asset cleanup runs in the background and no longer searches the whole user tree on every edit
- Posters of videos picked from Nextcloud are captured while streaming the video (or taken from the server preview) instead of downloading the whole file

### Added
- API endpoints `POST apiv2/album/{id}/pages` (several page operations in one album write) and `POST apiv2/album/{id}/assetsearch` (link several files at once); existing endpoints keep their contract (the album load of the web editor, with `apath`, also returns the album path)
- `Server-Timing` header on API and preview responses, and `tools/bench-apiv2.mjs` to measure the edit-mode API of an instance
- Database index on the albums table (user, album id)

### Fixed
- Concurrent edits of the same album (two tabs, web and Android) could overwrite each other
- Asset cleanup could delete a file uploaded moments before the page referencing it was saved
- Linking existing media matched files whose name merely contained the searched one
- Preview revalidations (304) regenerated the preview every time
- Asset and preview endpoints only serve files of the album owner, whatever a link file points to

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
