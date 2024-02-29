# Souvenirs on Nextcloud

View and share albums made by the [Souvenirs android application](https://github.com/zorgluf/souvenirs-android)

This application is just a viewer. Edition features are not implemented right now on the nextcloud interface.

## Changelog

v1.9.6:
* bug fixes on video format, downloading album, support nc28

v1.9.4:
* bug fix on album containing multiples videos

v1.9.1:
* bug fixes in scrolling and dark mode

v1.9.0:
* Enhanced display mode for smartphones
* UI enhancements
* Technical refactoring webpack -> vite.js (as SPA)

v1.7.0:
* Photosphere preview inside album
* Blured background to fill tile on small image 
* Bug fix:
  * Loading icon broken link

v1.6.0:
* Enable asset (image, video) reuse on nextcloud server, preventing unecessary uploads
* Enable the user to download full album in a zip file
* Bug fix:
  * Broken link on image loading icon
  * Album list incomplete on large screen

v1.5.0:
* Add audio support
* Add video support

v1.4.0:
* Do not duplicate images in album when image already exists on nextcloud storage in user context. Works only on new albums or albums modified by Android client version 2.5.0+.
* Introduce a new settings, allowing to change the root directory storing the albums files. Default directory set to "Souvenirs" on a fresh install, otherwise old "album" directory used.
* Major udpates on npm dependencies.
* bug fix:
  * Albums list pagination/scrolling not working on mobile devices.

v1.3.0:
* Photosphere support
* Pagination on album list
* bug fix:
  * issues with share status sync with android client

v1.2.0:
* Enable animated gif
* bug fix :
  * Images in old album format

v1.1.0:
*  Removed old v1 api
*  Added pagination on album list
* bug fix :
  *  Display of album without album image

v1.0.0:
*  app_id change (souvenir to souvenirs) : disruptive, need android application v2+
*  Improved GUI on share actions and link display
*  Rewrite of album list page to integrate api call on front
*  bug fix :
  *  Fix app svg on firefox


## Building the app

The app can be built by using the provided Makefile by running:

    make

## Manual install of the app

Build the tarball :

    make && make dist

Untar the archive located in build/artifacts/appstore into the apps folder on nextcloud server.

## Found it useful ?

If you found this project valuable, and want to encourage the author, you can donate at :
[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TRY8KXAN39KJL&source=url)
