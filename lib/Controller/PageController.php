<?php
namespace OCA\Souvenirs\Controller;

use OCP\IRequest;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Controller;
use OCP\Files\IRootFolder;
use OCP\IL10N;

define("ALBUM_CONF_FILENAME","album.json");
define("ALBUM_DIR","/album");

class PageController extends Controller {
	private $userId;
	private $userFolder;
	private $il10n;


	public function __construct($AppName, IRequest $request, $UserId, IRootFolder $rootFolder, IL10N $il10n){
		parent::__construct($AppName, $request);
		$this->userId = $UserId;
		$this->userFolder = $rootFolder->getUserFolder($UserId);
		$this->il10n = $il10n;
	}

	/**
	 *
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function index() {
		try {
			$file = $this->userFolder->get(ALBUM_DIR);
			if($file instanceof \OCP\Files\Folder) {
				return new TemplateResponse('souvenirs','index');
			} else {
				return new TemplateResponse('souvenirs','error',array('msg' => 'Wrong album path {ALBUM_DIR}'));
			}
		} catch(\OCP\Files\NotFoundException $e) {
			$this->userFolder->newFolder(ALBUM_DIR);
			if ($this->userFolder->get(ALBUM_DIR) instanceof \OCP\Files\Folder) {
				return new TemplateResponse('souvenirs','index');
			} else {
				return new TemplateResponse('souvenirs','error',array('msg' => '{ALBUM_DIR} does not exist'));
			}
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
			$file = $this->userFolder->get($apath."/".ALBUM_CONF_FILENAME);
			if($file instanceof \OCP\Files\File) {
				return new TemplateResponse('souvenirs','show',array('apath' => $apath));
			} else {
				return new TemplateResponse('souvenirs','error',array('msg' => 'Can not read album file'));
			}
		} catch(\OCP\Files\NotFoundException $e) {
			return new TemplateResponse('souvenirs','error',array('msg' => 'Album file does not exist'));
		}
	}

}
