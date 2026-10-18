<?php

namespace OCA\Souvenirs\Tests\Unit\Model;

use OCA\Souvenirs\Model\Album;
use OCA\Souvenirs\Tests\Unit\FakeFs;
use PHPUnit\Framework\TestCase;

/**
 * Album::cleanAssets (issue #50, phase 2): orphan removal, duplicate linking,
 * and the storage cost of a run - in particular that assets already checked
 * are not searched again on every edit.
 */
class CleanAssetsTest extends TestCase {

	private const USER_ROOT = '/alice/files';
	private const ALBUMS = '/alice/files/Souvenirs';
	private const ALBUM = '/alice/files/Souvenirs/2026-10-18';
	private const CHECKS = self::ALBUM . '/.souvenirs-assets-checked.json';

	private FakeFs $fs;

	protected function setUp(): void {
		$this->fs = new FakeFs($this);
		$this->fs->addFolder(self::ALBUM . '/data');
	}

	private function image(string $asset, ?string $name = null, ?int $size = null): array {
		return ['id' => uniqid(), 'class' => 'ImageElement', 'image' => $asset, 'name' => $name, 'size' => $size];
	}

	private function album(array $elements, array $extra = []): Album {
		$this->fs->addFile(self::ALBUM . '/album.json', json_encode($extra + [
			'id' => 'album-1',
			'pages' => [['id' => 'p1', 'elements' => $elements]],
		]));
		return Album::tryLoad($this->fs->folder(self::ALBUM));
	}

	private function clean(Album $album): void {
		$this->fs->resetCalls();
		$this->assertTrue($album->cleanAssets($this->fs->folder(self::USER_ROOT)));
	}

	// --- orphans -----------------------------------------------------------------------

	public function testDeletesOnlyUnreferencedDataFiles(): void {
		$this->fs->addFile(self::ALBUM . '/data/used.jpg', 'a');
		$this->fs->addFile(self::ALBUM . '/data/linked.jpg.lnk', '{}');
		$this->fs->addFile(self::ALBUM . '/data/cover.jpg', 'c');
		$this->fs->addFile(self::ALBUM . '/data/orphan.jpg', 'o');
		$this->fs->addFile(self::ALBUM . '/data/orphan.png.lnk', '{}');
		$album = $this->album([$this->image('data/used.jpg'), $this->image('data/linked.jpg')], ['albumImage' => 'data/cover.jpg']);

		$this->clean($album);

		$this->assertTrue($this->fs->exists(self::ALBUM . '/data/used.jpg'));
		$this->assertTrue($this->fs->exists(self::ALBUM . '/data/linked.jpg.lnk'));
		$this->assertTrue($this->fs->exists(self::ALBUM . '/data/cover.jpg'));
		$this->assertFalse($this->fs->exists(self::ALBUM . '/data/orphan.jpg'));
		$this->assertFalse($this->fs->exists(self::ALBUM . '/data/orphan.png.lnk'));
	}

	public function testKeepsRecentOrphansSoInFlightUploadsSurvive(): void {
		// uploaded (or linked by assetsearch) a moment ago, page not saved yet
		$this->fs->addFile(self::ALBUM . '/data/just-uploaded.jpg', 'u', null, 5);
		$this->fs->addFile(self::ALBUM . '/data/just-linked.jpg.lnk', '{}', null, 5);
		$album = $this->album([]);

		$this->clean($album);

		$this->assertTrue($this->fs->exists(self::ALBUM . '/data/just-uploaded.jpg'));
		$this->assertTrue($this->fs->exists(self::ALBUM . '/data/just-linked.jpg.lnk'));
	}

	public function testListsTheDataFolderOnceInsteadOfOneLookupPerAsset(): void {
		$elements = [];
		for ($i = 0; $i < 20; $i++) {
			$this->fs->addFile(self::ALBUM . "/data/$i.jpg", 'x');
			$elements[] = $this->image("data/$i.jpg");
		}
		$album = $this->album($elements);

		$this->clean($album);

		$this->assertSame(1, $this->fs->count('getDirectoryListing'));
		$this->assertSame(0, $this->fs->count('nodeExists'));
	}

	public function testAlbumWithoutDataFolderIsANoOp(): void {
		$this->fs = new FakeFs($this);
		$album = $this->album([$this->image('data/a.jpg', 'a.jpg', 3)]);

		$this->clean($album);

		$this->assertSame(0, $this->fs->count('search'));
	}

	// --- duplicates ----------------------------------------------------------------------

	public function testReplacesADataFileWithALinkToTheIdenticalUserFile(): void {
		$this->fs->addFile(self::USER_ROOT . '/Photos/beach.jpg', 'beach');
		$this->fs->addFile(self::ALBUM . '/data/a.jpg', 'beach');
		$album = $this->album([$this->image('data/a.jpg', 'beach.jpg', 5)]);

		$this->clean($album);

		$this->assertFalse($this->fs->exists(self::ALBUM . '/data/a.jpg'));
		$link = json_decode($this->fs->content(self::ALBUM . '/data/a.jpg.lnk'), true);
		$this->assertSame(self::USER_ROOT . '/Photos/beach.jpg', $link['assetPath']);
	}

	public function testNeverLinksToAFileOfAnotherAlbum(): void {
		$this->fs->addFile(self::ALBUMS . '/other/data/beach.jpg', 'beach');
		$this->fs->addFile(self::ALBUM . '/data/a.jpg', 'beach');
		$album = $this->album([$this->image('data/a.jpg', 'beach.jpg', 5)]);

		$this->clean($album);

		$this->assertTrue($this->fs->exists(self::ALBUM . '/data/a.jpg'));
		$this->assertFalse($this->fs->exists(self::ALBUM . '/data/a.jpg.lnk'));
	}

	public function testOnlyExactNameAndSizeMatchesAreLinked(): void {
		// "name contains" hits that must not be taken for the asset's source
		$this->fs->addFile(self::USER_ROOT . '/Photos/beach.jpg.bak', 'beach');
		$this->fs->addFile(self::USER_ROOT . '/Photos/old-beach.jpg', 'beach');
		$this->fs->addFile(self::USER_ROOT . '/Photos/beach.jpg', 'beach, bigger');
		$this->fs->addFile(self::ALBUM . '/data/a.jpg', 'beach');
		$album = $this->album([$this->image('data/a.jpg', 'beach.jpg', 5)]);

		$this->clean($album);

		$this->assertTrue($this->fs->exists(self::ALBUM . '/data/a.jpg'));
		$this->assertFalse($this->fs->exists(self::ALBUM . '/data/a.jpg.lnk'));
	}

	// --- memoization -----------------------------------------------------------------------

	public function testAssetsWithoutDuplicateAreNotSearchedAgain(): void {
		$this->fs->addFile(self::ALBUM . '/data/a.jpg', 'unique');
		$this->fs->addFile(self::ALBUM . '/data/b.jpg', 'unique too');
		$album = $this->album([$this->image('data/a.jpg', 'a.jpg', 6), $this->image('data/b.jpg', 'b.jpg', 10)]);

		$this->clean($album);
		$this->assertSame(2, $this->fs->count('search'));

		$this->clean($album);
		$this->assertSame(0, $this->fs->count('search'));
		$this->assertSame(0, $this->fs->count('putContent'));
	}

	public function testValidLinksAreVerifiedOnceThenSkipped(): void {
		$this->fs->addFile(self::USER_ROOT . '/Photos/beach.jpg', 'beach');
		$this->fs->addFile(self::ALBUM . '/data/a.jpg.lnk',
			json_encode(['assetPath' => self::USER_ROOT . '/Photos/beach.jpg', 'assetSize' => 5]));
		$album = $this->album([$this->image('data/a.jpg', 'beach.jpg', 5)]);

		$this->clean($album);
		$this->assertSame(0, $this->fs->count('search'));

		$this->clean($album);
		// steady state: one listing, one read of the checks file, nothing else
		$this->assertSame(1, $this->fs->count('getDirectoryListing'));
		$this->assertSame(1, $this->fs->count('getContent'));
		$this->assertSame(0, $this->fs->count('nodeExists'));
	}

	public function testNewAndResizedAssetsAreSearched(): void {
		$this->fs->addFile(self::ALBUM . '/data/a.jpg', 'unique');
		$album = $this->album([$this->image('data/a.jpg', 'a.jpg', 6)]);
		$this->clean($album);

		$this->fs->addFile(self::ALBUM . '/data/b.jpg', 'second');
		$this->fs->addFile(self::ALBUM . '/data/a.jpg', 'unique, edited');
		$album = $this->album([$this->image('data/a.jpg', 'a.jpg', 14), $this->image('data/b.jpg', 'b.jpg', 6)]);
		$this->clean($album);

		$this->assertSame(2, $this->fs->count('search'));
	}

	public function testChecksExpireAndAreRetried(): void {
		$this->fs->addFile(self::ALBUM . '/data/a.jpg', 'unique');
		$album = $this->album([$this->image('data/a.jpg', 'a.jpg', 6)]);
		$this->clean($album);

		$checks = json_decode($this->fs->content(self::CHECKS), true);
		$checks['data/a.jpg']['at'] -= Album::DUPLICATE_CHECK_TTL_SECONDS + 1;
		$this->fs->addFile(self::CHECKS, json_encode($checks));
		$this->clean($album);

		$this->assertSame(1, $this->fs->count('search'));
	}

	public function testChecksOfRemovedAssetsAreForgotten(): void {
		$this->fs->addFile(self::ALBUM . '/data/a.jpg', 'unique');
		$this->fs->addFile(self::ALBUM . '/data/b.jpg', 'other');
		$this->clean($this->album([$this->image('data/a.jpg', 'a.jpg', 6), $this->image('data/b.jpg', 'b.jpg', 5)]));

		$this->clean($this->album([$this->image('data/a.jpg', 'a.jpg', 6)]));

		$checks = json_decode($this->fs->content(self::CHECKS), true);
		$this->assertSame(['data/a.jpg'], array_keys($checks));
	}

	public function testSteadyStateCostDoesNotGrowWithTheAlbum(): void {
		$elements = [];
		for ($i = 0; $i < 50; $i++) {
			$this->fs->addFile(self::ALBUM . "/data/$i.jpg", str_repeat('x', $i + 1));
			$elements[] = $this->image("data/$i.jpg", "$i.jpg", $i + 1);
		}
		$album = $this->album($elements);
		$this->clean($album);

		$this->clean($album);

		$this->assertSame(0, $this->fs->count('search'));
		$this->assertSame(0, $this->fs->count('get') - 2, 'only the data folder and the checks file are looked up');
		$this->assertSame(0, $this->fs->count('putContent'));
	}

	// --- assetsearch -------------------------------------------------------------------------

	public function testSearchAssetAndLinkCreatesTheLinkForAPickedFile(): void {
		$this->fs->addFile(self::USER_ROOT . '/Photos/beach.jpg', 'beach');
		$album = $this->album([]);

		$found = $album->searchAssetAndLink($this->fs->folder(self::USER_ROOT), 'data/new.jpg', 'beach.jpg', 5);

		$this->assertTrue($found);
		$link = json_decode($this->fs->content(self::ALBUM . '/data/new.jpg.lnk'), true);
		$this->assertSame(self::USER_ROOT . '/Photos/beach.jpg', $link['assetPath']);
	}

	public function testSearchAssetAndLinkRejectsPartialNameMatches(): void {
		$this->fs->addFile(self::USER_ROOT . '/Photos/beach.jpg.bak', 'beach');
		$album = $this->album([]);

		$this->assertFalse($album->searchAssetAndLink($this->fs->folder(self::USER_ROOT), 'data/new.jpg', 'beach.jpg', 5));
	}
}
