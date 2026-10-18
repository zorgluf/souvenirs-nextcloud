<?php

declare(strict_types=1);

namespace OCA\Souvenirs\Service;

use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;

/**
 * Serializes the read-modify-write cycles on one album.json (issue #50).
 *
 * Every write endpoint loads album.json, changes it and writes it back. Two
 * writes on the same album running at the same time (two browser tabs, the
 * web editor and the Android app) would otherwise both start from the same
 * version and the last one would silently drop the other's change.
 *
 * Uses Nextcloud's locking provider (Redis when memcache.locking is set, the
 * database otherwise) with an app-specific key, so it never interferes with
 * the file locks Nextcloud takes on album.json itself.
 */
class AlbumLock {

	/** total time to wait for a busy album before giving up */
	public const WAIT_MS = 5000;
	private const RETRY_MS = 50;

	public function __construct(
		private ILockingProvider $lockingProvider,
	) {
	}

	public static function keyFor(string $albumPath): string {
		return 'souvenirs/album/' . md5($albumPath);
	}

	/**
	 * Run $fn while holding the exclusive lock of the album at $albumPath.
	 *
	 * @template T
	 * @param callable(): T $fn
	 * @return T
	 * @throws LockedException when the album stays locked for WAIT_MS
	 */
	public function run(string $albumPath, callable $fn) {
		$key = self::keyFor($albumPath);
		Profiler::measure('lock', function () use ($key, $albumPath) {
			$deadline = hrtime(true) + self::WAIT_MS * 1_000_000;
			while (true) {
				try {
					$this->lockingProvider->acquireLock($key, ILockingProvider::LOCK_EXCLUSIVE, $albumPath);
					return;
				} catch (LockedException $e) {
					if (hrtime(true) >= $deadline) {
						throw $e;
					}
					usleep(self::RETRY_MS * 1000);
				}
			}
		});
		try {
			return $fn();
		} finally {
			$this->lockingProvider->releaseLock($key, ILockingProvider::LOCK_EXCLUSIVE);
		}
	}
}
