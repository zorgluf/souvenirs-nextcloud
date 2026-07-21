<?php

namespace OCA\Souvenirs\Tests\Unit\Db;

use OCA\Souvenirs\Db\Share;
use PHPUnit\Framework\TestCase;

/**
 * Pins the JSON shape of a share as consumed by the web SPA and the Android
 * client: validUntil must serialize as an ISO-8601 string, and NULL (legacy
 * never-expiring shares) must pass through unchanged.
 */
class ShareTest extends TestCase {

    public function testToArrayFormatsValidUntil(): void {
        $share = new Share();
        $share->setToken('tok123');
        $share->setUser('alice');
        $share->setAlbumId('album-1');
        $share->setValidUntil(new \DateTime('2026-10-21 23:59:59', new \DateTimeZone('UTC')));

        $array = $share->toArray();
        $this->assertSame('tok123', $array['token']);
        $this->assertSame('alice', $array['user']);
        $this->assertSame('album-1', $array['albumId']);
        $this->assertSame('2026-10-21T23:59:59+00:00', $array['validUntil']);
    }

    public function testToArrayKeepsNullValidUntil(): void {
        $share = new Share();
        $share->setToken('tok123');
        $share->setUser('alice');
        $share->setAlbumId('album-1');

        $this->assertNull($share->toArray()['validUntil']);
    }

    public function testSetterAcceptsDateStringViaDeclaredType(): void {
        // Entity converts strings to \DateTime for Types::DATETIME fields —
        // this is what hydration from the DB row relies on.
        $share = new Share();
        $share->setValidUntil('2026-10-21 12:00:00');
        $this->assertInstanceOf(\DateTime::class, $share->getValidUntil());
    }
}
