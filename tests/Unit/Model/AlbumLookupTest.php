<?php

namespace OCA\Souvenirs\Tests\Unit\Model;

use OCA\Souvenirs\Model\Album;
use OCA\Souvenirs\Tests\Unit\Support\FakeFs;
use PHPUnit\Framework\TestCase;

/**
 * Storage round trips of the album/asset lookups (issue #50, phase 1): on a
 * slow data folder or a remote database every lookup is a network round trip,
 * so these tests pin how many each operation costs.
 */
class AlbumLookupTest extends TestCase {

	private const USER_ROOT = '/alice/files';
	private const ALBUM = '/alice/files/Souvenirs/2026-10-18';

	private FakeFs $fs;

	protected function setUp(): void {
		$this->fs = new FakeFs($this);
	}

	private function makeAlbum(array $content = []): void {
		$this->fs->addFile(self::ALBUM . '/album.json', json_encode($content + ['id' => 'album-1', 'pages' => []]));
		$this->fs->addFolder(self::ALBUM . '/data');
	}

	public function testTryLoadReturnsNullWithASingleLookupWhenNoAlbumJson(): void {
		$folder = $this->fs->addFolder(self::USER_ROOT . '/Photos');
		$this->fs->resetCalls();

		$this->assertNull(Album::tryLoad($folder));
		$this->assertSame(1, $this->fs->count('get'));
		$this->assertSame(0, $this->fs->count('nodeExists'));
	}

	public function testLoadThenSaveCostsOneLookupOneReadOneWrite(): void {
		$this->makeAlbum(['name' => 'Summer']);
		$folder = $this->fs->folder(self::ALBUM);
		$this->fs->resetCalls();

		$album = Album::tryLoad($folder);
		$album->setValues(['name' => 'Winter']);
		$album->save();

		$this->assertSame(1, $this->fs->count('get'));
		$this->assertSame(0, $this->fs->count('nodeExists'));
		$this->assertSame(1, $this->fs->count('getContent'));
		$this->assertSame(1, $this->fs->count('putContent'));
		$this->assertSame('Winter', json_decode($this->fs->content(self::ALBUM . '/album.json'), true)['name']);
	}

	public function testResolveAssetPathFindsTheDataFileWithoutReadingAlbumJson(): void {
		$this->makeAlbum();
		$this->fs->addFile(self::ALBUM . '/data/a.jpg', 'jpeg');
		$this->fs->resetCalls();

		$path = Album::resolveAssetPath($this->fs->folder(self::ALBUM), 'data/a.jpg');

		$this->assertSame(self::ALBUM . '/data/a.jpg', $path);
		$this->assertSame(1, $this->fs->count('get'));
		$this->assertSame(0, $this->fs->count('getContent'));
	}

	public function testResolveAssetPathFollowsTheLinkFileReadOnce(): void {
		$this->makeAlbum();
		$this->fs->addFile(self::USER_ROOT . '/Photos/beach.jpg', 'jpeg');
		$this->fs->addFile(self::ALBUM . '/data/b.jpg.lnk',
			json_encode(['assetPath' => self::USER_ROOT . '/Photos/beach.jpg', 'assetSize' => 4]));
		$this->fs->resetCalls();

		$path = Album::resolveAssetPath($this->fs->folder(self::ALBUM), 'data/b.jpg');

		$this->assertSame(self::USER_ROOT . '/Photos/beach.jpg', $path);
		$this->assertSame(1, $this->fs->count('getContent'));
	}

	public function testResolveAssetPathReportsUnknownAssets(): void {
		$this->makeAlbum();

		$this->assertSame('unknown', Album::resolveAssetPath($this->fs->folder(self::ALBUM), 'data/missing.jpg'));
	}

	public function testGetAssetRealPathMatchesResolveAssetPath(): void {
		$this->makeAlbum();
		$this->fs->addFile(self::ALBUM . '/data/a.jpg', 'jpeg');
		$album = Album::tryLoad($this->fs->folder(self::ALBUM));

		$this->assertSame(self::ALBUM . '/data/a.jpg', $album->getAssetRealPath('data/a.jpg'));
		$this->assertSame('unknown', $album->getAssetRealPath('data/none.jpg'));
	}

	public function testGetAssetLinkReturnsNullWhenThereIsNoLinkFile(): void {
		$this->makeAlbum();
		$album = Album::tryLoad($this->fs->folder(self::ALBUM));

		// used to throw: NotFoundException was caught without being imported
		$this->assertNull($album->getAssetLink('data/none.jpg'));
	}

	public function testHasAssetLinkChecksTheTargetFromTheUserRoot(): void {
		$this->makeAlbum();
		$this->fs->addFile(self::ALBUM . '/data/b.jpg.lnk',
			json_encode(['assetPath' => self::USER_ROOT . '/Photos/gone.jpg', 'assetSize' => 4]));
		$album = Album::tryLoad($this->fs->folder(self::ALBUM));
		$userFolder = $this->fs->folder(self::USER_ROOT);

		$this->assertFalse($album->hasAssetLink('data/b.jpg', $userFolder));

		$this->fs->addFile(self::USER_ROOT . '/Photos/gone.jpg', 'back');
		$this->fs->resetCalls();
		$this->assertTrue($album->hasAssetLink('data/b.jpg', $userFolder));
		// one read of the link file, one existence check, no walk up the parents
		$this->assertSame(1, $this->fs->count('getContent'));
		$this->assertSame(1, $this->fs->count('nodeExists'));
		$this->assertSame(0, $this->fs->count('getParent'));
	}

	// --- confinement of the asset endpoints --------------------------------------------

	public function testOpenInUserFolderServesTheOwnersFiles(): void {
		$this->makeAlbum();
		$this->fs->addFile(self::USER_ROOT . '/Photos/beach.jpg', 'jpeg');
		$this->fs->addFile(self::ALBUM . '/data/b.jpg.lnk',
			json_encode(['assetPath' => self::USER_ROOT . '/Photos/beach.jpg', 'assetSize' => 4]));
		$userFolder = $this->fs->folder(self::USER_ROOT);

		$path = Album::resolveAssetPath($this->fs->folder(self::ALBUM), 'data/b.jpg');
		$file = Album::openInUserFolder($userFolder, $path);

		$this->assertNotNull($file);
		$this->assertSame(self::USER_ROOT . '/Photos/beach.jpg', $file->getPath());
	}

	public function testOpenInUserFolderRefusesALinkToAnotherUsersFile(): void {
		// a link file is user content: it can be written by hand over WebDAV
		$this->makeAlbum();
		$this->fs->addFile('/bob/files/secret.jpg', 'private');
		$this->fs->addFile(self::ALBUM . '/data/x.jpg.lnk',
			json_encode(['assetPath' => '/bob/files/secret.jpg', 'assetSize' => 7]));

		$path = Album::resolveAssetPath($this->fs->folder(self::ALBUM), 'data/x.jpg');

		$this->assertSame('/bob/files/secret.jpg', $path);
		$this->assertNull(Album::openInUserFolder($this->fs->folder(self::USER_ROOT), $path));
		$this->assertNull(Album::openInUserFolder($this->fs->folder(self::USER_ROOT), '/alice/files_trashbin/x.jpg'));
	}

	public function testOpenInUserFolderHandlesMissingAndUnknownAssets(): void {
		$userFolder = $this->fs->addFolder(self::USER_ROOT);

		$this->assertNull(Album::openInUserFolder($userFolder, 'unknown'));
		$this->assertNull(Album::openInUserFolder($userFolder, self::USER_ROOT . '/none.jpg'));
		$this->assertNull(Album::openInUserFolder($userFolder, self::USER_ROOT . '/Photos'));
	}

	public function testOnlyPlainAssetNamesAreAccepted(): void {
		$this->assertTrue(Album::isPlainAssetName('3f2a-b1.jpg'));
		foreach (['', '.', '..', '../album.json', 'a/b.jpg', 'a\\b.jpg', "a\0.jpg", null, 12] as $bad) {
			$this->assertFalse(Album::isPlainAssetName($bad), var_export($bad, true));
		}
	}
}
