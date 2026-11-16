<?php
namespace OCA\Souvenirs\Controller;

use OCP\IRequest;
use OCP\IConfig;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\NotFoundResponse;
use OCP\AppFramework\Controller;
use OCP\Files\IRootFolder;
use OCP\IL10N;

use OCA\Souvenirs\Controller\Utils;
use OCA\Souvenirs\Model\Album;


class PageController extends Controller {
	private $userId;
	private $userFolder;
	private $il10n;
	private $config;


	public function __construct($AppName, IRequest $request, $UserId, IRootFolder $rootFolder, IL10N $il10n,
								IConfig $config) {
		parent::__construct($AppName, $request);
		$this->userId = $UserId;
		$this->userFolder = $rootFolder->getUserFolder($UserId);
		$this->il10n = $il10n;
		$this->config = $config;
	}

	/**
	 *
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function index() {
		$isDev = $this->config->getSystemValue("debug");
		try { 
			$albumsDir = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
			if($albumsDir instanceof \OCP\Files\Folder) {
				$response = new TemplateResponse('souvenirs','index', array("isDev" => $isDev));
				// The video poster capture (issue #32) plays the picked video
				// from an object URL, which the default CSP media-src blocks.
				$csp = new ContentSecurityPolicy();
				$csp->addAllowedMediaDomain("blob:");
				// The service worker of the offline mode (issue #22) is served
				// by this app (see serviceWorker): the default policy has no
				// worker-src, which falls back to the nonce-only script-src.
				$csp->addAllowedWorkerSrcDomain("'self'");
				$response->setContentSecurityPolicy($csp);
				return $response;
			} else {
				return new TemplateResponse('souvenirs','error',array('msg' => 'Wrong album path {$albumsDir->getPath()}'));
			}
		} catch(\OCP\Files\NotFoundException $e) {
			return new TemplateResponse('souvenirs','error',array('msg' => '{$albumsDir->getPath()} does not exist'));
		}
	}

	/**
	 * The album view of the SPA (/show?apath=...): same host page as the
	 * album list, the router reads the location. Without this route a
	 * reload of an open album - or an installed web app restarting on its
	 * last page - got a 404 (issue #22).
	 *
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function show() {
		return $this->index();
	}

	/**
	 * The service worker of the offline mode (issue #22). Served from the
	 * app's URL space rather than as a static file: a worker only controls
	 * the pages below its own URL, and static files live elsewhere
	 * (apps/, custom_apps/...).
	 *
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function serviceWorker() {
		$path = $this->serviceWorkerPath();
		if (!is_readable($path)) {
			//not built (development checkout): the app works, online only
			return new NotFoundResponse();
		}
		$response = new DataDisplayResponse(file_get_contents($path), \OCP\AppFramework\Http::STATUS_OK, array(
			'Content-Type' => 'application/javascript; charset=utf-8',
		));
		//the browser must see a new worker as soon as the app is updated
		$response->cacheFor(0);
		//The policy sent with the script is the worker's own: every request
		//it forwards to the server is checked against it. Without one, a
		//data response gets "default-src 'none'" and the worker could not
		//fetch anything - the app would not even load.
		//The standard policy allows same-origin connections, which is all
		//the worker makes.
		$csp = new ContentSecurityPolicy();
		$csp->addAllowedWorkerSrcDomain("'self'");
		$response->setContentSecurityPolicy($csp);
		return $response;
	}

	/**
	 * where the build puts the worker (vite.sw.config.js)
	 */
	protected function serviceWorkerPath(): string {
		return dirname(__DIR__, 2) . '/js/vite/souvenirs-sw.js';
	}

}
