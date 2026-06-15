<?php

namespace OCA\Souvenirs\Tests\Unit\Model;

use OCA\Souvenirs\Model\Album;
use OCP\Files\File;
use OCP\Files\Folder;
use PHPUnit\Framework\TestCase;

/**
 * Pins the unknown-field-preservation behaviour the web editing feature relies
 * on: editing one field must patch only that field and rewrite album.json with
 * every other (possibly unknown) field intact.
 */
class AlbumTest extends TestCase {

    /** @var string|null captures what save() writes to disk */
    private $written;

    /**
     * Build an Album backed by a mocked album folder containing the given JSON.
     * The same mocked file captures whatever save() writes.
     */
    private function albumFrom(array $content): Album {
        $this->written = null;

        $file = $this->createMock(File::class);
        $file->method('getContent')->willReturn(json_encode($content));
        $file->method('putContent')->willReturnCallback(function ($data) {
            $this->written = $data;
        });

        $folder = $this->createMock(Folder::class);
        $folder->method('nodeExists')->willReturn(true);
        $folder->method('get')->willReturn($file);

        return Album::withFolder($folder);
    }

    private function sampleContent(): array {
        return [
            'id' => 'album-1',
            'name' => 'Original name',
            'albumImage' => 'data/cover.jpg',
            // Field this app does not know about — must survive editing.
            'customAlbumField' => 'keep-me',
            'pages' => [
                [
                    'id' => 'page-1',
                    'pageCustomField' => 'page-keep',
                    'elements' => [
                        ['id' => 'el-1', 'text' => 'caption', 'image' => 'data/a.jpg', 'androidOnly' => 7],
                    ],
                ],
            ],
        ];
    }

    public function testSetValuesPatchesOnlyTheGivenField(): void {
        $album = $this->albumFrom($this->sampleContent());

        $album->setValues(['name' => 'New name']);

        $this->assertSame('New name', $album->getName());
        $this->assertSame('album-1', $album->getId());
        $this->assertSame('data/cover.jpg', $album->getAlbumImage());
    }

    public function testSaveRewritesEveryFieldIncludingUnknownOnes(): void {
        $album = $this->albumFrom($this->sampleContent());

        $album->setValues(['name' => 'New name']);
        $album->save();

        $this->assertNotNull($this->written);
        $saved = json_decode($this->written, true);

        $this->assertSame('New name', $saved['name']);
        // Unknown album-, page- and element-level fields are preserved.
        $this->assertSame('keep-me', $saved['customAlbumField']);
        $this->assertSame('page-keep', $saved['pages'][0]['pageCustomField']);
        $this->assertSame(7, $saved['pages'][0]['elements'][0]['androidOnly']);
        $this->assertSame('caption', $saved['pages'][0]['elements'][0]['text']);
    }

    public function testSetValuesIgnoresUnderscorePrefixedAndNullKeys(): void {
        $album = $this->albumFrom($this->sampleContent());

        $album->setValues(['_internal' => 'nope', 'name' => null]);

        $this->assertNull($album->getContent('_internal'));
        // name untouched because a null value is skipped
        $this->assertSame('Original name', $album->getName());
    }

    public function testToArrayFullKeepsPagesAndUnknownFields(): void {
        $album = $this->albumFrom($this->sampleContent());

        $full = $album->toArrayFull();

        $this->assertArrayHasKey('pages', $full);
        $this->assertSame('keep-me', $full['customAlbumField']);
    }
}
