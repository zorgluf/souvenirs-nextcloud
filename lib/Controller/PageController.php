<?php
namespace OCA\Souvenirs\Controller;

use OCP\IRequest;
use OCP\IConfig;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\DataResponse;
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
		try { 
			$albumsDir = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
			if($albumsDir instanceof \OCP\Files\Folder) {
				return new TemplateResponse('souvenirs','index');
			} else {
				return new TemplateResponse('souvenirs','error',array('msg' => 'Wrong album path {$albumsDir->getPath()}'));
			}
		} catch(\OCP\Files\NotFoundException $e) {
			return new TemplateResponse('souvenirs','error',array('msg' => '{$albumsDir->getPath()} does not exist'));
		}
	}

	/**
	 * Controler to show album
	 * TODO : disbale CSRF ?
	 * @NoCSRFRequired
	 * @NoAdminRequired
	 */
	public function show($apath) {
		// check if file album conf file exists and read from it if possible
		try {
			if(Album::isAlbum($this->userFolder->get($apath))) {
				return new TemplateResponse('souvenirs','show',array('apath' => $apath));
			} else {
				return new TemplateResponse('souvenirs','error',array('msg' => 'Can not read album file'));
			}
		} catch(\OCP\Files\NotFoundException $e) {
			return new TemplateResponse('souvenirs','error',array('msg' => 'Album file does not exist'));
		}
	}

}
