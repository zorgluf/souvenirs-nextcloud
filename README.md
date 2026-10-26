# Souvenirs on Nextcloud

Create, Display and Share "old school" albums for your photos, videos and panoramics.

Better on device album edition with the [Souvenirs android application](https://github.com/zorgluf/souvenirs-android)


## Building the app

The app can be built by using the provided Makefile by running:

    make

## Manual install of the app

Build the tarball :

    make && make dist

Untar the archive located in build/artifacts/appstore into the apps folder on nextcloud server.

## Performance on slow storage or a remote database

Every album change rewrites the album's `album.json`, and every request goes
through Nextcloud's own bootstrap and file layer. When the data folder is on
slow storage (NFS, object storage) or the database is on another host, these
settings remove the biggest costs that are outside the app:

- **File locking in Redis** instead of the database. Without
  `memcache.locking`, Nextcloud keeps its file locks in the database, so every
  file write costs extra database round trips:

      'memcache.locking' => '\OC\Memcache\Redis',
      'redis' => [ 'host' => 'localhost', 'port' => 6379 ],

- **A local memory cache**, so configuration and small lookups do not reach
  the database on every request:

      'memcache.local' => '\OC\Memcache\APCu',

- **Video posters**: when the server has a video preview provider enabled
  (`OC\Preview\Movie` in `enabledPreviewProviders`, which needs `ffmpeg`), the
  web editor uses the server's preview as the poster of a picked video;
  otherwise the browser streams the beginning of the video to capture a frame.

To see where the time goes, every `apiv2` and preview response carries a
`Server-Timing` header (album resolution, `album.json` load/save, searches,
lock wait), visible in the browser's developer tools.

## Found it useful ?

If you found this project valuable, and want to encourage the author, you can donate at :
[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TRY8KXAN39KJL&source=url)
