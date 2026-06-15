<?php

namespace OCA\Souvenirs\Tests\Unit\Model;

use OCA\Souvenirs\Model\Page;
use PHPUnit\Framework\TestCase;

/**
 * Pins the page-level merge behaviour the web editing feature relies on. A
 * caption edit is persisted by posting the page's full elements array (the
 * backend replaces it wholesale), so the round-trip must preserve every other
 * page- and element-level field, including unknown ones.
 */
class PageTest extends TestCase {

    private function samplePage(): array {
        return [
            'id' => 'page-1',
            'pageCustomField' => 'page-keep',
            'elements' => [
                ['id' => 'el-1', 'text' => 'caption', 'image' => 'data/a.jpg', 'androidOnly' => 7],
                ['id' => 'el-2', 'text' => 'other', 'video' => 'data/b.mp4'],
            ],
        ];
    }

    /**
     * Simulate the elements array the client sends back: the same objects with
     * a single caption changed and all other fields untouched.
     */
    private function elementsWithEditedCaption(): array {
        $elements = $this->samplePage()['elements'];
        $elements[0]['text'] = 'edited caption';
        return $elements;
    }

    public function testSetValuesReplacesElementsButKeepsOtherPageFields(): void {
        $page = new Page($this->samplePage());

        $page->setValues(['elements' => $this->elementsWithEditedCaption()]);

        $this->assertSame('edited caption', $page->getContent('elements')[0]['text']);
        // Untouched page-level field survives.
        $this->assertSame('page-keep', $page->getContent('pageCustomField'));
        $this->assertSame('page-1', $page->getId());
    }

    public function testRoundTripPreservesUnknownElementFields(): void {
        $page = new Page($this->samplePage());

        $page->setValues(['elements' => $this->elementsWithEditedCaption()]);

        $elements = $page->getContent('elements');
        // The edited element keeps its non-text fields, including unknown ones.
        $this->assertSame('data/a.jpg', $elements[0]['image']);
        $this->assertSame(7, $elements[0]['androidOnly']);
        // The other element is untouched.
        $this->assertSame('other', $elements[1]['text']);
        $this->assertSame('data/b.mp4', $elements[1]['video']);
    }

    public function testToArrayDropsNullAndUnderscoreKeys(): void {
        $page = new Page([
            'id' => 'page-1',
            'text' => null,
            '_transient' => 'x',
            'keep' => 'yes',
        ]);

        $array = $page->toArray();

        $this->assertArrayNotHasKey('text', $array);
        $this->assertArrayNotHasKey('_transient', $array);
        $this->assertSame('yes', $array['keep']);
    }

    public function testGetElementsReturnsElementObjects(): void {
        $page = new Page($this->samplePage());

        $elements = $page->getElements();

        $this->assertCount(2, $elements);
        $this->assertSame('el-1', $elements[0]->getContent('id'));
    }
}
