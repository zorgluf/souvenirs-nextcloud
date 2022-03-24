# Souvenirs on Nextcloud

View and share albums made by the [Souvenirs android application](https://github.com/zorgluf/souvenirs-android)

## Changelog

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
