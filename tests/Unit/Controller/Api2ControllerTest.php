<?php

namespace OCA\Souvenirs\Tests\Unit\Controller;

use OCA\Souvenirs\Controller\Api2Controller;
use OCA\Souvenirs\Db\Album as AlbumEntity;
use OCA\Souvenirs\Db\AlbumMapper;
use OCA\Souvenirs\Db\Share;
use OCA\Souvenirs\Db\ShareMapper;
use OCA\Souvenirs\Tests\Unit\Support\FakeFilesystem;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\IRootFolder;
use OCP\IConfig;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IURLGenerator;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * IRequest with the public $params property the real Nextcloud Request
 * exposes (and the controller reads), so the mock can carry it.
 */
abstract class RequestWithParams implements IRequest {
    public array $params = [];
}

/**
 * Pins the /apiv2 contract shared by the web SPA and the Android client.
 *
 * The controller runs against the real model classes on top of an in-memory
 * filesystem (FakeFilesystem); only the DB mappers, config and URL generator
 * are mocked. The DB index is $albumIndex (album id => folder path) and the
 * shares table is $shareTokens (album id => token).
 */
class Api2ControllerTest extends TestCase {
    use FakeFilesystem;

    private const USER = 'alice';
    private const USER_ROOT = '/alice/files';
    private const ALBUMS = '/alice/files/Souvenirs';

    /** @var array<string,string> album id => absolute folder path */
    private array $albumIndex = [];
    /** @var array<string,string> album id => share token */
    private array $shareTokens = [];

    /** @var AlbumMapper&MockObject */
    private $albumMapper;
    /** @var ShareMapper&MockObject */
    private $shareMapper;
    /** @var IURLGenerator&MockObject */
    private $urlGen;

    protected function setUp(): void {
        $this->addFolder(self::ALBUMS);

        $this->albumMapper = $this->createMock(AlbumMapper::class);
        $this->albumMapper->method('findByAlbumId')->willReturnCallback(
            fn ($user, $id) => isset($this->albumIndex[$id]) ? $this->albumEntity($id) : null);
        $this->albumMapper->method('findAllByUser')->willReturnCallback(
            fn () => array_map(fn ($id) => $this->albumEntity($id), array_keys($this->albumIndex)));

        $this->shareMapper = $this->createMock(ShareMapper::class);
        $this->shareMapper->method('findByAlbumId')->willReturnCallback(
            fn ($user, $id) => isset($this->shareTokens[$id]) ? $this->share($id, $this->shareTokens[$id]) : null);

        $this->urlGen = $this->createMock(IURLGenerator::class);
    }

    private function albumEntity(string $id): AlbumEntity {
        $entity = new AlbumEntity();
        $entity->setAlbumId($id);
        $entity->setPath($this->albumIndex[$id]);
        $entity->setUser(self::USER);
        return $entity;
    }

    private function share(string $albumId, string $token): Share {
        $share = new Share();
        $share->setAlbumId($albumId);
        $share->setToken($token);
        $share->setUser(self::USER);
        return $share;
    }

    /**
     * @param array $params what IRequest::$params holds: route + body parameters
     */
    private function controller(array $params = []): Api2Controller {
        $request = $this->createMock(RequestWithParams::class);
        $request->params = $params;

        $rootFolder = $this->createMock(IRootFolder::class);
        $rootFolder->method('getUserFolder')->willReturnCallback(fn () => $this->folderNode(self::USER_ROOT));
        $rootFolder->method('get')->willReturnCallback(fn ($path) => $this->node($path));

        $config = $this->createMock(IConfig::class);
        $config->method('getUserValue')->willReturnCallback(fn ($u, $app, $key, $default) => $default);

        return new Api2Controller('souvenirs', $request, self::USER, $rootFolder,
            $this->createMock(IL10N::class), $this->shareMapper, $this->urlGen, $config, $this->albumMapper);
    }

    /**
     * Put an album folder (album.json + data/) on the fake filesystem and,
     * unless $indexed is false, register it in the DB index.
     */
    private function addAlbum(string $id, array $content = [], bool $indexed = true): string {
        $dir = self::ALBUMS . '/A-' . $id;
        $this->addFile($dir . '/album.json', json_encode(['id' => $id] + $content));
        $this->addFolder($dir . '/data');
        if ($indexed) {
            $this->albumIndex[$id] = $dir;
        }
        return $dir;
    }

    private function savedAlbum(string $dir): array {
        return json_decode($this->files[$dir . '/album.json'], true);
    }

    private function pageIds(string $dir): array {
        return array_column($this->savedAlbum($dir)['pages'], 'id');
    }

    private function threePages(): array {
        return ['pages' => [
            ['id' => 'p1', 'elements' => []],
            ['id' => 'p2', 'elements' => []],
            ['id' => 'p3', 'elements' => []],
        ]];
    }

    private function assertStatus(int $expected, JSONResponse $response): void {
        $this->assertSame($expected, $response->getStatus());
    }

    // ---- album listing / reading ------------------------------------------

    public function testListAlbumsPaginatesIdsByTen(): void {
        foreach (range(0, 11) as $i) {
            $this->albumIndex['id' . $i] = '/unused';
        }
        $controller = $this->controller();

        $this->assertSame(array_map(fn ($i) => 'id' . $i, range(0, 9)), $controller->listAlbums(1)->getData());
        $this->assertSame(['id10', 'id11'], $controller->listAlbums(2)->getData());
        $this->assertSame([], $controller->listAlbums(3)->getData());
    }

    public function testListAlbumsDetailsSkipsUnresolvableAlbums(): void {
        $this->addAlbum('good', ['name' => 'Good']);
        $this->albumIndex['stale'] = self::ALBUMS . '/deleted-folder';
        $this->shareTokens['good'] = 'tok-good';

        $data = $this->controller()->listAlbumsDetails()->getData();

        $this->assertCount(1, $data);
        $this->assertSame('good', $data[0]['id']);
        $this->assertSame('/Souvenirs/A-good', $data[0]['path']);
        $this->assertTrue($data[0]['isShared']);
        $this->assertSame('tok-good', $data[0]['shareToken']);
    }

    public function testGetAlbumReturnsMetadataWithoutPages(): void {
        $this->addAlbum('a1', ['name' => 'Trip', 'customField' => 'keep'] + $this->threePages());

        $response = $this->controller()->getAlbum('a1', null);

        $this->assertStatus(Http::STATUS_OK, $response);
        $data = $response->getData();
        $this->assertSame('Trip', $data['name']);
        $this->assertSame('keep', $data['customField']);
        $this->assertSame('/Souvenirs/A-a1', $data['path']);
        $this->assertArrayNotHasKey('pages', $data);
        $this->assertArrayNotHasKey('isShared', $data);
    }

    public function testGetAlbumAddsLiveShareFromDb(): void {
        $this->addAlbum('a1');
        $this->shareTokens['a1'] = 'tok-1';

        $data = $this->controller()->getAlbum('a1', null)->getData();

        $this->assertTrue($data['isShared']);
        $this->assertSame('tok-1', $data['shareToken']);
    }

    public function testGetAlbumByPathDoesNotUseDbIndex(): void {
        $this->addAlbum('a1', ['name' => 'Trip'], false);
        $this->albumMapper->expects($this->never())->method('findByAlbumId');

        $response = $this->controller()->getAlbum('a1', '/Souvenirs/A-a1');

        $this->assertStatus(Http::STATUS_OK, $response);
        $this->assertSame('Trip', $response->getData()['name']);
    }

    public function testGetAlbumNotFoundWhenNotIndexed(): void {
        $this->addAlbum('a1', [], false);

        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->getAlbum('a1', null));
    }

    public function testGetAlbumNotFoundWhenIndexedPathIsStale(): void {
        $this->albumIndex['a1'] = self::ALBUMS . '/gone';

        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->getAlbum('a1', null));
    }

    public function testGetAlbumNotFoundWhenFolderHasNoAlbumJson(): void {
        $this->addFolder(self::ALBUMS . '/plain');
        $this->albumIndex['a1'] = self::ALBUMS . '/plain';

        $controller = $this->controller();
        $this->assertStatus(Http::STATUS_NOT_FOUND, $controller->getAlbum('a1', null));
        $this->assertStatus(Http::STATUS_NOT_FOUND, $controller->getAlbum('a1', '/Souvenirs/plain'));
    }

    public function testGetAlbumNotFoundWhenPathIsAFile(): void {
        $this->addFile(self::ALBUMS . '/notes.txt', 'x');

        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->getAlbum('a1', '/Souvenirs/notes.txt'));
    }

    public function testGetAlbumFullIncludesPagesAndReplacesStaleShareFields(): void {
        $this->addAlbum('a1', ['isShared' => true, 'shareToken' => 'stale', 'nullField' => null]
            + $this->threePages());

        $data = $this->controller()->getAlbumFull('a1', null)->getData();

        $this->assertSame(['p1', 'p2', 'p3'], array_column($data['pages'], 'id'));
        $this->assertArrayNotHasKey('isShared', $data);
        $this->assertArrayNotHasKey('shareToken', $data);
        $this->assertArrayNotHasKey('nullField', $data);

        $this->shareTokens['a1'] = 'live';
        $data = $this->controller()->getAlbumFull('a1', null)->getData();
        $this->assertTrue($data['isShared']);
        $this->assertSame('live', $data['shareToken']);
    }

    public function testGetAlbumFullByPathOmitsShare(): void {
        $this->addAlbum('a1');
        $this->shareTokens['a1'] = 'live';

        $data = $this->controller()->getAlbumFull('a1', '/Souvenirs/A-a1')->getData();

        $this->assertArrayNotHasKey('isShared', $data);
        $this->assertArrayNotHasKey('shareToken', $data);
    }

    public function testGetAlbumFullNotFound(): void {
        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->getAlbumFull('nope', null));
    }

    public function testGetAlbumAssetsListsEveryElementAsset(): void {
        $this->addAlbum('a1', ['pages' => [
            ['id' => 'p1', 'elements' => [
                ['image' => 'data/a.jpg', 'audio' => 'data/a.mp3'],
                ['text' => 'caption only'],
            ]],
            ['id' => 'p2', 'elements' => [['class' => 'VideoElement', 'image' => 'data/v.jpg', 'video' => 'data/v.mp4']]],
        ]]);

        $data = $this->controller()->getAlbumAssets('a1', null)->getData();

        $this->assertSame(['data/a.jpg', 'data/a.mp3', 'data/v.jpg', 'data/v.mp4'], array_column($data, 'assetPath'));
    }

    public function testGetAlbumAssetsNotFound(): void {
        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->getAlbumAssets('nope', null));
    }

    // ---- album create / update / delete -----------------------------------

    public function testCreateAlbumWritesFolderAndIndexesIt(): void {
        $this->albumMapper->expects($this->once())->method('createAlbum')
            ->with(self::USER, 'new-id', $this->stringStartsWith(self::ALBUMS . '/'), 'Just created');

        $response = $this->controller()->createAlbum('new-id');

        $this->assertStatus(Http::STATUS_OK, $response);
        $this->assertSame('new-id', $response->getData()['id']);
        $configs = array_values(array_filter(array_keys($this->files),
            fn ($p) => str_ends_with($p, '/album.json')));
        $this->assertCount(1, $configs);
        $dir = dirname($configs[0]);
        $saved = $this->savedAlbum($dir);
        $this->assertSame('new-id', $saved['id']);
        $this->assertMatchesRegularExpression('/^\d{14}$/', $saved['lastEditDate']);
        $this->assertMatchesRegularExpression('/^\d{14}$/', $saved['pageLastEditDate']);
        $this->assertTrue($this->pathExists($dir . '/data'));
    }

    public function testCreateAlbumIgnoresNonAlbumFolders(): void {
        $this->addFolder(self::ALBUMS . '/holiday-photos');

        $this->assertStatus(Http::STATUS_OK, $this->controller()->createAlbum('new-id'));
    }

    public function testCreateAlbumConflictsOnExistingId(): void {
        $this->addAlbum('a1');
        $this->albumMapper->expects($this->never())->method('createAlbum');

        $this->assertStatus(Http::STATUS_CONFLICT, $this->controller()->createAlbum('a1'));
    }

    public function testPostAlbumPatchesFieldsAndKeepsTheRest(): void {
        $dir = $this->addAlbum('a1', ['name' => 'Old', 'customField' => 'keep'] + $this->threePages());

        $response = $this->controller([
            'id' => 'a1',                // route parameter, also merged into params
            'name' => 'New',
            'isShared' => true,          // share state lives in the DB, never in album.json
            'shareToken' => 'injected',
            'pages' => [],               // structural: only editable through page endpoints
            '_route' => 'souvenirs.api2.post_album',
        ])->postAlbum('a1');

        $this->assertStatus(Http::STATUS_OK, $response);
        $saved = $this->savedAlbum($dir);
        $this->assertSame('New', $saved['name']);
        $this->assertSame('keep', $saved['customField']);
        $this->assertSame('a1', $saved['id']);
        $this->assertSame(['p1', 'p2', 'p3'], array_column($saved['pages'], 'id'));
        $this->assertArrayNotHasKey('isShared', $saved);
        $this->assertArrayNotHasKey('shareToken', $saved);
        $this->assertArrayNotHasKey('_route', $saved);
        $this->assertSame(['lastEditDate' => $saved['lastEditDate']], $response->getData());
    }

    public function testPostAlbumNotFound(): void {
        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller(['name' => 'x'])->postAlbum('nope'));
    }

    public function testDeleteAlbumRemovesFolderAndIndexRow(): void {
        $dir = $this->addAlbum('a1');
        $this->addFile($dir . '/data/a.jpg', 'img');
        $this->albumMapper->expects($this->once())->method('deleteAlbum')->with(self::USER, 'a1');

        $response = $this->controller()->deleteAlbum('a1');

        $this->assertSame('OK', $response->getData());
        $this->assertFalse($this->pathExists($dir));
        $this->assertFalse($this->pathExists($dir . '/data/a.jpg'));
    }

    public function testDeleteAlbumNotFound(): void {
        $this->albumMapper->expects($this->never())->method('deleteAlbum');

        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->deleteAlbum('nope'));
    }

    // ---- pages ------------------------------------------------------------

    public function testCreatePageInsertsAtPosition(): void {
        $dir = $this->addAlbum('a1', $this->threePages());

        // route parameters arrive as strings and are merged into params
        $response = $this->controller([
            'album_id' => 'a1',
            'page_pos' => '1',
            'id' => 'new',
            'elements' => [['id' => 'e1', 'text' => 'hi']],
        ])->createPage('a1', '1');

        $this->assertStatus(Http::STATUS_OK, $response);
        $this->assertSame(['p1', 'new', 'p2', 'p3'], $this->pageIds($dir));
        $saved = $this->savedAlbum($dir);
        $page = $saved['pages'][1];
        $this->assertArrayNotHasKey('album_id', $page);
        $this->assertArrayNotHasKey('page_pos', $page);
        $this->assertSame('hi', $page['elements'][0]['text']);
        $this->assertSame([
            'lastEditDate' => $page['lastEditDate'],
            'pageLastEditDate' => $saved['pageLastEditDate'],
        ], $response->getData());
    }

    public function testCreatePageNotFound(): void {
        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller(['id' => 'new'])->createPage('nope', '0'));
    }

    public function testPostPageUpdatesOnlyThatPage(): void {
        $dir = $this->addAlbum('a1', ['pages' => [
            ['id' => 'p1', 'layout' => 'grid', 'elements' => [['id' => 'e1']]],
            ['id' => 'p2', 'elements' => [['id' => 'e2']]],
        ]]);

        $response = $this->controller([
            'album_id' => 'a1',
            'page_id' => 'p1',
            'elements' => [['id' => 'e1', 'text' => 'edited']],
        ])->postPage('a1', 'p1');

        $this->assertStatus(Http::STATUS_OK, $response);
        $pages = $this->savedAlbum($dir)['pages'];
        $this->assertSame('grid', $pages[0]['layout']);
        $this->assertSame('edited', $pages[0]['elements'][0]['text']);
        $this->assertArrayNotHasKey('album_id', $pages[0]);
        $this->assertArrayNotHasKey('page_id', $pages[0]);
        $this->assertSame([['id' => 'e2']], $pages[1]['elements']);
        $this->assertSame(['lastEditDate' => $pages[0]['lastEditDate']], $response->getData());
    }

    public function testPostPageNotFound(): void {
        $this->addAlbum('a1', $this->threePages());
        $controller = $this->controller(['elements' => []]);

        $this->assertStatus(Http::STATUS_NOT_FOUND, $controller->postPage('a1', 'nope'));
        $this->assertStatus(Http::STATUS_NOT_FOUND, $controller->postPage('nope', 'p1'));
    }

    public function testDeletePageRemovesIt(): void {
        $dir = $this->addAlbum('a1', $this->threePages());

        $response = $this->controller()->DeletePage('a1', 'p2');

        $this->assertStatus(Http::STATUS_OK, $response);
        $this->assertSame(['p1', 'p3'], $this->pageIds($dir));
        $this->assertSame(['pageLastEditDate' => $this->savedAlbum($dir)['pageLastEditDate']], $response->getData());
    }

    public function testDeleteUnknownPageNotFound(): void {
        $dir = $this->addAlbum('a1', $this->threePages());

        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->DeletePage('a1', 'nope'));
        $this->assertSame(['p1', 'p2', 'p3'], $this->pageIds($dir));
    }

    public function testDeletePageAlbumNotFound(): void {
        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->DeletePage('nope', 'p1'));
    }

    /**
     * page_pos is the position in the list *before* the move, i.e. the page is
     * dropped in front of the page currently at that index.
     */
    public function testMovePage(): void {
        $dir = $this->addAlbum('a1', $this->threePages());
        $controller = $this->controller();

        $response = $controller->movePage('a1', 'p1', '2');
        $this->assertStatus(Http::STATUS_OK, $response);
        $this->assertSame(['p2', 'p1', 'p3'], $this->pageIds($dir));
        $this->assertSame(['pageLastEditDate' => $this->savedAlbum($dir)['pageLastEditDate']], $response->getData());

        $controller->movePage('a1', 'p3', '0');
        $this->assertSame(['p3', 'p2', 'p1'], $this->pageIds($dir));

        $controller->movePage('a1', 'p3', '3');
        $this->assertSame(['p2', 'p1', 'p3'], $this->pageIds($dir));
    }

    public function testMovePageNotFound(): void {
        $this->addAlbum('a1', $this->threePages());
        $controller = $this->controller();

        $this->assertStatus(Http::STATUS_NOT_FOUND, $controller->movePage('a1', 'nope', '0'));
        $this->assertStatus(Http::STATUS_NOT_FOUND, $controller->movePage('nope', 'p1', '0'));
    }

    // ---- shares -----------------------------------------------------------

    public function testGetShareByUserListsShares(): void {
        $this->shareMapper->method('findAllByUser')->with(self::USER)
            ->willReturn([$this->share('a1', 't1'), $this->share('a2', 't2')]);

        $data = $this->controller()->getShareByUser()->getData();

        $this->assertSame(['t1', 't2'], array_column($data, 'token'));
        $this->assertSame(['a1', 'a2'], array_column($data, 'albumId'));
    }

    public function testCreateShareReturnsPublicUrl(): void {
        $this->addAlbum('a1');
        $this->shareMapper->expects($this->once())->method('createShare')
            ->with(self::USER, 'a1', null)
            ->willReturn(['share' => ['token' => 'tok']]);
        $this->urlGen->method('linkToRouteAbsolute')
            ->with('souvenirs.public.show', ['token' => 'tok'])
            ->willReturn('https://cloud.example/apps/souvenirs/public/tok');

        $response = $this->controller()->createShare('a1');

        $this->assertSame('https://cloud.example/apps/souvenirs/public/tok', $response->getData());
    }

    public function testCreateShareWithEmptyValidUntilUsesMapperDefault(): void {
        $this->addAlbum('a1');
        $this->shareMapper->expects($this->once())->method('createShare')
            ->with(self::USER, 'a1', null)
            ->willReturn(['share' => ['token' => 'tok']]);

        $this->controller()->createShare('a1', '');
    }

    public function testCreateShareValidUntilCoversTheWholeDay(): void {
        $this->addAlbum('a1');
        $this->shareMapper->expects($this->once())->method('createShare')
            ->with(self::USER, 'a1', $this->callback(
                fn ($d) => $d instanceof \DateTime && $d->format('Y-m-d H:i:s') === '2026-12-31 23:59:59'))
            ->willReturn(['share' => ['token' => 'tok']]);

        $this->controller()->createShare('a1', '2026-12-31');
    }

    public function testCreateShareRejectsMalformedDate(): void {
        $this->addAlbum('a1');
        $this->shareMapper->expects($this->never())->method('createShare');

        $this->assertStatus(Http::STATUS_BAD_REQUEST, $this->controller()->createShare('a1', '31/12/2026'));
    }

    public function testCreateShareUnknownAlbum(): void {
        $this->shareMapper->expects($this->never())->method('createShare');

        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->createShare('nope'));
    }

    public function testDeleteShare(): void {
        $this->shareMapper->method('findByToken')->with('tok')->willReturn($this->share('a1', 'tok'));
        $this->shareMapper->expects($this->once())->method('deleteShare')
            ->with(self::USER, 'a1')->willReturn(['action' => 'success']);

        $this->assertSame('OK', $this->controller()->deleteShare('tok')->getData());
    }

    public function testDeleteShareUnknownToken(): void {
        $this->shareMapper->method('findByToken')->willReturn(null);
        $this->shareMapper->expects($this->never())->method('deleteShare');

        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->deleteShare('nope'));
    }

    public function testDeleteShareMapperFailureIsServerError(): void {
        $this->shareMapper->method('findByToken')->willReturn($this->share('a1', 'tok'));
        $this->shareMapper->method('deleteShare')->willReturn(['action' => 'failure']);

        $this->assertStatus(Http::STATUS_INTERNAL_SERVER_ERROR, $this->controller()->deleteShare('tok'));
    }

    // ---- assetprobe -------------------------------------------------------

    public function testAssetProbeFindsLocalAsset(): void {
        $dir = $this->addAlbum('a1');
        $this->addFile($dir . '/data/a.jpg', '12345');

        $data = $this->controller()->assetExistsInAlbum('a1', 'data/a.jpg')->getData();

        $this->assertSame(['status' => 'ok', 'path' => '/Souvenirs/A-a1/data/a.jpg', 'size' => 5], $data);
    }

    public function testAssetProbeFollowsAssetLink(): void {
        $dir = $this->addAlbum('a1');
        $this->addFile(self::USER_ROOT . '/Photos/a.jpg', '1234567');
        $this->addFile($dir . '/data/a.jpg.lnk',
            json_encode(['assetPath' => self::USER_ROOT . '/Photos/a.jpg', 'assetSize' => 7]));

        $data = $this->controller()->assetExistsInAlbum('a1', 'data/a.jpg')->getData();

        $this->assertSame(['status' => 'ok', 'path' => '/Photos/a.jpg', 'size' => 7], $data);
    }

    public function testAssetProbeReportsBrokenLinkAsMissing(): void {
        $dir = $this->addAlbum('a1');
        $this->addFile($dir . '/data/a.jpg.lnk',
            json_encode(['assetPath' => self::USER_ROOT . '/Photos/deleted.jpg', 'assetSize' => 7]));

        $data = $this->controller()->assetExistsInAlbum('a1', 'data/a.jpg')->getData();

        $this->assertSame(['path' => '/Souvenirs/A-a1/data/a.jpg', 'status' => 'missing'], $data);
    }

    public function testAssetProbeReportsMissingAsset(): void {
        $this->addAlbum('a1');

        $data = $this->controller()->assetExistsInAlbum('a1', 'data/a.jpg')->getData();

        $this->assertSame(['path' => '/Souvenirs/A-a1/data/a.jpg', 'status' => 'missing'], $data);
    }

    public function testAssetProbeAlbumNotFound(): void {
        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->assetExistsInAlbum('nope', 'data/a.jpg'));
    }

    // ---- assetsearch ------------------------------------------------------

    public function testAssetSearchLinksSameNameAndSizeFileAndDropsUpload(): void {
        $dir = $this->addAlbum('a1');
        $this->addFile($dir . '/data/a.jpg', '12345');
        $this->addFile(self::USER_ROOT . '/Photos/a.jpg', '12345');

        $data = $this->controller()->assetSearch('a1', 'data/a.jpg', 'a.jpg', '5')->getData();

        $this->assertSame(['linkCreated' => 'OK', 'status' => 'found'], $data);
        $this->assertFalse($this->pathExists($dir . '/data/a.jpg'));
        $this->assertSame(['assetPath' => self::USER_ROOT . '/Photos/a.jpg', 'assetSize' => 5],
            json_decode($this->files[$dir . '/data/a.jpg.lnk'], true));
    }

    public function testAssetSearchCreatesLinkWhenAssetNotUploaded(): void {
        $dir = $this->addAlbum('a1');
        $this->addFile(self::USER_ROOT . '/Photos/a.jpg', '12345');

        $data = $this->controller()->assetSearch('a1', 'data/a.jpg', 'a.jpg', '5')->getData();

        $this->assertSame('found', $data['status']);
        $this->assertTrue($this->pathExists($dir . '/data/a.jpg.lnk'));
    }

    public function testAssetSearchIgnoresSizeMismatch(): void {
        $dir = $this->addAlbum('a1');
        $this->addFile(self::USER_ROOT . '/Photos/a.jpg', '12345');

        $data = $this->controller()->assetSearch('a1', 'data/a.jpg', 'a.jpg', '6')->getData();

        $this->assertSame(['status' => 'notfound'], $data);
        $this->assertFalse($this->pathExists($dir . '/data/a.jpg.lnk'));
    }

    public function testAssetSearchNeverLinksToAnotherAlbum(): void {
        $dir = $this->addAlbum('a1');
        $other = $this->addAlbum('a2');
        $this->addFile($other . '/data/a.jpg', '12345');

        $data = $this->controller()->assetSearch('a1', 'data/a.jpg', 'a.jpg', '5')->getData();

        $this->assertSame(['status' => 'notfound'], $data);
        $this->assertFalse($this->pathExists($dir . '/data/a.jpg.lnk'));
    }

    public function testAssetSearchNeedsNameAndSize(): void {
        $this->addAlbum('a1');
        $this->addFile(self::USER_ROOT . '/Photos/a.jpg', '12345');
        $controller = $this->controller();

        $this->assertSame(['status' => 'notfound'], $controller->assetSearch('a1', 'data/a.jpg', '', '5')->getData());
        $this->assertSame(['status' => 'notfound'], $controller->assetSearch('a1', 'data/a.jpg', 'a.jpg', '0')->getData());
    }

    public function testAssetSearchShortCircuitsOnValidLink(): void {
        $dir = $this->addAlbum('a1');
        $this->addFile(self::USER_ROOT . '/Photos/a.jpg', '12345');
        $link = json_encode(['assetPath' => self::USER_ROOT . '/Photos/a.jpg', 'assetSize' => 5]);
        $this->addFile($dir . '/data/a.jpg.lnk', $link);

        // name and size would not match anything: the existing link is enough
        $data = $this->controller()->assetSearch('a1', 'data/a.jpg', 'other.jpg', '1')->getData();

        $this->assertSame('found', $data['status']);
        $this->assertSame($link, $this->files[$dir . '/data/a.jpg.lnk']);
    }

    public function testAssetSearchAlbumNotFound(): void {
        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->assetSearch('nope', 'data/a.jpg', 'a.jpg', '5'));
    }

    // ---- clean ------------------------------------------------------------

    public function testCleanDeletesUnreferencedAssetsAndLinksDuplicates(): void {
        $dir = $this->addAlbum('a1', [
            'albumImage' => 'data/cover.jpg',
            'pages' => [['id' => 'p1', 'elements' => [
                ['image' => 'data/kept.jpg', 'name' => 'kept.jpg', 'size' => 4],
                ['image' => 'data/dup.jpg', 'name' => 'dup.jpg', 'size' => 3],
                ['class' => 'VideoElement', 'image' => 'data/v.jpg', 'video' => 'data/v.mp4',
                    'name' => 'v.mp4', 'size' => 2],
            ]]],
        ]);
        $this->addFile($dir . '/data/kept.jpg', 'keep');
        $this->addFile($dir . '/data/kept.jpg_thumb', 'thumb');   // name-prefixed derivative: kept
        $this->addFile($dir . '/data/cover.jpg', 'cover');
        $this->addFile($dir . '/data/dup.jpg', 'dup');
        $this->addFile($dir . '/data/v.jpg', 'vv');
        $this->addFile($dir . '/data/v.mp4', 'vv');
        $this->addFile($dir . '/data/orphan.jpg', 'orphan');
        $this->addFile(self::USER_ROOT . '/Photos/dup.jpg', 'dup');
        $this->addFile(self::USER_ROOT . '/Videos/v.mp4', 'vv');
        $this->addFile(self::USER_ROOT . '/Videos/v.jpg', 'vv');

        $response = $this->controller()->cleanAssets('a1');

        $this->assertSame('OK', $response->getData());
        $this->assertFalse($this->pathExists($dir . '/data/orphan.jpg'));
        $this->assertTrue($this->pathExists($dir . '/data/kept.jpg'));
        $this->assertTrue($this->pathExists($dir . '/data/kept.jpg_thumb'));
        $this->assertTrue($this->pathExists($dir . '/data/cover.jpg'));
        // duplicate found elsewhere in the user's files: replaced by a link
        $this->assertFalse($this->pathExists($dir . '/data/dup.jpg'));
        $this->assertSame(self::USER_ROOT . '/Photos/dup.jpg',
            json_decode($this->files[$dir . '/data/dup.jpg.lnk'], true)['assetPath']);
        // video: only the video file is linked, the generated preview image stays
        $this->assertFalse($this->pathExists($dir . '/data/v.mp4'));
        $this->assertTrue($this->pathExists($dir . '/data/v.mp4.lnk'));
        $this->assertTrue($this->pathExists($dir . '/data/v.jpg'));
        $this->assertFalse($this->pathExists($dir . '/data/v.jpg.lnk'));
    }

    public function testCleanAlbumNotFound(): void {
        $this->assertStatus(Http::STATUS_NOT_FOUND, $this->controller()->cleanAssets('nope'));
    }
}
