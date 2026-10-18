<?php

namespace OCA\Souvenirs\Tests\Unit\Service;

use OCA\Souvenirs\Service\AlbumLock;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use PHPUnit\Framework\TestCase;

class AlbumLockTest extends TestCase {

	public function testRunsUnderAnExclusiveAppLockAndReleasesIt(): void {
		$provider = $this->createMock(ILockingProvider::class);
		$key = AlbumLock::keyFor('/alice/files/Souvenirs/a');
		$provider->expects($this->once())->method('acquireLock')
			->with($key, ILockingProvider::LOCK_EXCLUSIVE);
		$provider->expects($this->once())->method('releaseLock')
			->with($key, ILockingProvider::LOCK_EXCLUSIVE);

		$result = (new AlbumLock($provider))->run('/alice/files/Souvenirs/a', fn () => 42);

		$this->assertSame(42, $result);
		// never the key of a real file lock
		$this->assertStringStartsWith('souvenirs/album/', $key);
	}

	public function testWaitsForABusyAlbum(): void {
		$provider = $this->createMock(ILockingProvider::class);
		$attempts = 0;
		$provider->method('acquireLock')->willReturnCallback(function () use (&$attempts) {
			if (++$attempts < 3) {
				throw new LockedException('busy');
			}
		});

		$this->assertSame('done', (new AlbumLock($provider))->run('/a', fn () => 'done'));
		$this->assertSame(3, $attempts);
	}

	public function testReleasesTheLockWhenTheWriteFails(): void {
		$provider = $this->createMock(ILockingProvider::class);
		$provider->expects($this->once())->method('releaseLock');

		$this->expectException(\RuntimeException::class);
		(new AlbumLock($provider))->run('/a', function () {
			throw new \RuntimeException('write failed');
		});
	}
}
