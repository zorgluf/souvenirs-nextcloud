<?php

namespace OCA\Souvenirs\Tests\Unit\Model;

use OCA\Souvenirs\Model\Album;
use OCA\Souvenirs\Tests\Unit\FakeFs;
use PHPUnit\Framework\TestCase;

/**
 * Album::applyPageOperations, behind the batch pages endpoint (issue #50):
 * several page changes applied as one album.json write, with the same
 * semantics as the single-page endpoints.
 */
class PageOperationsTest extends TestCase {

	private const ALBUM = '/alice/files/Souvenirs/a';

	private FakeFs $fs;

	protected function setUp(): void {
		$this->fs = new FakeFs($this);
	}

	private function album(): Album {
		$this->fs->addFile(self::ALBUM . '/album.json', json_encode([
			'id' => 'album-1',
			'pages' => [
				['id' => 'p1', 'custom' => 'keep', 'elements' => [['id' => 'e1', 'text' => 'one']]],
				['id' => 'p2', 'elements' => [['id' => 'e2', 'text' => 'two']]],
				['id' => 'p3', 'elements' => []],
			],
		]));
		return Album::tryLoad($this->fs->folder(self::ALBUM));
	}

	private function ids(Album $album): array {
		return array_map(fn ($p) => $p->getId(), $album->getPages());
	}

	public function testCrossPageMoveIsOneChange(): void {
		$album = $this->album();

		$applied = $album->applyPageOperations([
			['op' => 'update', 'page' => ['id' => 'p2', 'elements' => [['id' => 'e2'], ['id' => 'e1', 'text' => 'one']]]],
			['op' => 'delete', 'id' => 'p1'],
		]);

		$this->assertSame(['p2', 'p3'], $this->ids($album));
		$this->assertCount(2, $album->getPage('p2')->getContent('elements'));
		$this->assertCount(2, $applied['results']);
		$this->assertArrayHasKey('lastEditDate', $applied['results'][0]);
		$this->assertNotNull($applied['pageLastEditDate']);
	}

	public function testUpdateMergesFieldsLikePostPage(): void {
		$album = $this->album();

		$applied = $album->applyPageOperations([
			['op' => 'update', 'page' => ['id' => 'p1', 'elements' => [['id' => 'e1', 'text' => 'new']]]],
		]);

		$page = $album->getPage('p1');
		$this->assertSame('keep', $page->getContent('custom'));
		$this->assertSame('new', $page->getContent('elements')[0]['text']);
		$this->assertNotNull($page->getContent('lastEditDate'));
		// page edits alone do not touch the page list date
		$this->assertNull($applied['pageLastEditDate']);
	}

	public function testCreatesPagesInOrderAtTheirPositions(): void {
		$album = $this->album();

		$album->applyPageOperations([
			['op' => 'update', 'page' => ['id' => 'p1', 'elements' => [['id' => 'e1'], ['id' => 'n0']]]],
			['op' => 'create', 'pos' => 1, 'page' => ['id' => 'n1', 'elements' => [['id' => 'x1']]]],
			['op' => 'create', 'pos' => '2', 'page' => ['id' => 'n2', 'elements' => [['id' => 'x2']]]],
		]);

		$this->assertSame(['p1', 'n1', 'n2', 'p2', 'p3'], $this->ids($album));
	}

	public function testMoveUsesTheSinglePageEndpointConvention(): void {
		$album = $this->album();

		// same position argument as movePage: index + 2 moves one step right
		$album->applyPageOperations([['op' => 'move', 'id' => 'p1', 'pos' => 2]]);

		$this->assertSame(['p2', 'p1', 'p3'], $this->ids($album));
	}

	public function testUnknownPageFailsWithoutAnyChange(): void {
		$album = $this->album();

		try {
			$album->applyPageOperations([
				['op' => 'delete', 'id' => 'p1'],
				['op' => 'update', 'page' => ['id' => 'nope', 'elements' => []]],
			]);
			$this->fail('expected an OutOfBoundsException');
		} catch (\OutOfBoundsException $e) {
		}
		// the controller saves only on success; nothing was written
		$this->assertSame(0, $this->fs->count('putContent'));
	}

	/**
	 * @dataProvider malformedOperations
	 */
	public function testMalformedOperationsAreRejected(array $operation): void {
		$this->expectException(\InvalidArgumentException::class);
		$this->album()->applyPageOperations([$operation]);
	}

	public static function malformedOperations(): array {
		return [
			'unknown op' => [['op' => 'explode', 'id' => 'p1']],
			'not an array' => [['op' => 'update', 'page' => 'p1']],
			'missing page id' => [['op' => 'update', 'page' => ['elements' => []]]],
			'create without position' => [['op' => 'create', 'page' => ['id' => 'n']]],
			'create with negative-looking position' => [['op' => 'create', 'pos' => '-1', 'page' => ['id' => 'n']]],
			'create of an existing page' => [['op' => 'create', 'pos' => 0, 'page' => ['id' => 'p1']]],
			'delete without id' => [['op' => 'delete']],
		];
	}
}
