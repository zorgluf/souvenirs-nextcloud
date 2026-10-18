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

## Performance tips (slow storage, remote database)

Edit mode makes one API call per user action (page saves, asset checks) plus
a periodic asset cleanup. On instances where files live on slow storage (NAS,
object storage) or the database is remote, the following `config.php` entries
remove the biggest avoidable costs (see issue #50):

- Point Nextcloud at a real transactional file locking backend, e.g. Redis
  (with the matching `redis` host settings), so file locking does not fall
  back to scanning the data directory:

      'memcache.locking' => '\OC\Memcache\Redis',

- Enable a local memory cache (shared hosting can use APCu) so config and
  small lookups do not hit the remote database on every request:

      'memcache.local' => '\OC\Memcache\APCu',

- If you do not rely on file versions, disabling them spares one extra
  storage write per asset upload:

      'versions' => false,

## Found it useful ?

If you found this project valuable, and want to encourage the author, you can donate at :
[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TRY8KXAN39KJL&source=url)
