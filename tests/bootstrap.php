<?php
/**
 * PHPUnit bootstrap for standalone unit tests.
 *
 * These tests exercise the plain model classes (OCA\Souvenirs\Model\*) in
 * isolation, mocking the OCP\Files interfaces provided by the dev-only
 * nextcloud/ocp package, so a full Nextcloud runtime is not required.
 */

require_once __DIR__ . '/../vendor/autoload.php';

// The nextcloud/ocp package ships the public OCP (and NCU) API as files but
// declares no Composer autoload mapping (in production these are provided by
// Nextcloud's own classloader). Register a PSR-4 autoloader for them so the
// model type-hints resolve and the interfaces can be mocked. Guarded by
// is_file so it stays inert if a future ocp version autoloads itself.
spl_autoload_register(function ($class) {
    foreach (['OCP\\', 'NCU\\'] as $prefix) {
        if (strncmp($class, $prefix, strlen($prefix)) === 0) {
            $relative = substr($class, strlen($prefix));
            $path = __DIR__ . '/../vendor/nextcloud/ocp/' . rtrim($prefix, '\\')
                . '/' . str_replace('\\', '/', $relative) . '.php';
            if (is_file($path)) {
                require_once $path;
            }
            return;
        }
    }
});
