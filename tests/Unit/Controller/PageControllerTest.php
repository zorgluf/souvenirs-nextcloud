<?php

namespace OCA\Souvenirs\Tests\Unit\Controller;

use OCA\Souvenirs\Controller\PageController;
use OCA\Souvenirs\Tests\Unit\Support\FakeFs;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Files\IRootFolder;
use OCP\IConfig;
use OCP\IL10N;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

/**
 * PageController with the service worker file under the test's control
 * (the real one only exists once the frontend is built).
 */
class PageControllerWithWorker extends PageController {
    public string $workerPath = '';

    protected function serviceWorkerPath(): string {
        return $this->workerPath;
    }
}

/**
 * The host page of the SPA and the service worker of the offline mode
 * (issue #22).
 */
class PageControllerTest extends TestCase {
    private const USER = 'alice';
    private const USER_ROOT = '/alice/files';

    private FakeFs $fs;
    /** @var string[] temp files to remove */
    private array $tempFiles = [];

    protected function setUp(): void {
        $this->fs = new FakeFs($this);
        $this->fs->addFolder(self::USER_ROOT . '/Souvenirs');
    }

    protected function tearDown(): void {
        foreach ($this->tempFiles as $file) {
            @unlink($file);
        }
    }

    private function controller(): PageControllerWithWorker {
        $rootFolder = $this->createMock(IRootFolder::class);
        $rootFolder->method('getUserFolder')->willReturnCallback(fn () => $this->fs->folder(self::USER_ROOT));

        $config = $this->createMock(IConfig::class);
        $config->method('getUserValue')->willReturnCallback(fn ($u, $app, $key, $default) => $default);
        $config->method('getSystemValue')->willReturn(false);

        return new PageControllerWithWorker('souvenirs', $this->createMock(IRequest::class), self::USER,
            $rootFolder, $this->createMock(IL10N::class), $config);
    }

    public function testIndexAllowsTheServiceWorker(): void {
        $response = $this->controller()->index();

        $this->assertInstanceOf(TemplateResponse::class, $response);
        $this->assertSame('index', $response->getTemplateName());
        $policy = $response->getContentSecurityPolicy()->buildPolicy();
        //without it the worker registration falls back to the nonce-only script-src
        $this->assertStringContainsString("worker-src 'self'", $policy);
        //the video poster capture (issue #32) still needs blob: media
        $this->assertMatchesRegularExpression('/media-src [^;]*blob:/', $policy);
    }

    public function testShowServesTheSameHostPageAsTheAlbumList(): void {
        //the album view is a route of the SPA: a reload must get the app, not a 404
        $response = $this->controller()->show();

        $this->assertInstanceOf(TemplateResponse::class, $response);
        $this->assertSame('index', $response->getTemplateName());
        $this->assertStringContainsString("worker-src 'self'", $response->getContentSecurityPolicy()->buildPolicy());
    }

    public function testServiceWorkerIsServedAsUncachedJavascript(): void {
        $file = tempnam(sys_get_temp_dir(), 'souvenirs-sw');
        $this->tempFiles[] = $file;
        file_put_contents($file, 'self.addEventListener("fetch", () => {})');
        $controller = $this->controller();
        $controller->workerPath = $file;

        $response = $controller->serviceWorker();

        $this->assertInstanceOf(DataDisplayResponse::class, $response);
        $this->assertSame(Http::STATUS_OK, $response->getStatus());
        $this->assertSame('self.addEventListener("fetch", () => {})', $response->render());
        //the headers the controller set (getHeaders() adds the runtime's own,
        //which needs a running Nextcloud)
        $property = new \ReflectionProperty(\OCP\AppFramework\Http\Response::class, 'headers');
        $property->setAccessible(true);
        $headers = $property->getValue($response);
        $this->assertStringStartsWith('application/javascript', $headers['Content-Type']);
        //a new release of the worker must not hide behind the HTTP cache
        $this->assertStringContainsString('no-cache', $headers['Cache-Control']);
        //the policy sent with the script governs the worker's own requests:
        //the empty default ("default-src 'none'") would block every one
        $policy = $response->getContentSecurityPolicy()->buildPolicy();
        $this->assertMatchesRegularExpression("/connect-src [^;]*'self'/", $policy);
        $this->assertStringContainsString("worker-src 'self'", $policy);
    }

    public function testServiceWorkerIsNotFoundWhenTheFrontendIsNotBuilt(): void {
        $controller = $this->controller();
        $controller->workerPath = sys_get_temp_dir() . '/souvenirs-sw-does-not-exist.js';

        $response = $controller->serviceWorker();

        $this->assertSame(Http::STATUS_NOT_FOUND, $response->getStatus());
    }

    public function testServiceWorkerPathPointsAtTheBuildOutput(): void {
        $controller = new class('souvenirs', $this->createMock(IRequest::class), self::USER,
            $this->rootFolder(), $this->createMock(IL10N::class), $this->createMock(IConfig::class)) extends PageController {
            public function path(): string {
                return $this->serviceWorkerPath();
            }
        };

        $this->assertSame(dirname(__DIR__, 3) . '/js/vite/souvenirs-sw.js', $controller->path());
    }

    private function rootFolder(): IRootFolder {
        $rootFolder = $this->createMock(IRootFolder::class);
        $rootFolder->method('getUserFolder')->willReturnCallback(fn () => $this->fs->folder(self::USER_ROOT));
        return $rootFolder;
    }
}
