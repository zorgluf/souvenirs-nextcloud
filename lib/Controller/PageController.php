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
				$nodes = $file->getDirectoryListing();
				$albumArray = array();
				foreach ($nodes as $node) {
					if($node instanceof \OCP\Files\Folder) {
						if ($node->nodeExists(ALBUM_CONF_FILENAME)) {
							//get album conf
							$jsonAlbum = $node->get(ALBUM_CONF_FILENAME)->getContent();
							$albumJson = json_decode($jsonAlbum);
							//get album image
							$albumImage = basename($albumJson->albumImage);
							//if none, get last image
							if ($albumImage=="") {
								foreach ($albumJson->pages as $page) {
									foreach ($page->elements as $element) {
										if (array_key_exists("image",$element)) {
											$albumImage = basename($element->image);
											break;
										}
									}
								}
							}
							setlocale(LC_TIME,$this->il10n->getLocaleCode().".UTF8");
							$albumDate = $albumJson->date;
							$albumArray[] = array("name" => $albumJson->name, "path" => ALBUM_DIR."/".basename($node->getPath()), 
								"date" => $albumDate, "image" => $albumImage, "id" => $albumJson->id);
						}
					}
				}
				return new TemplateResponse('souvenirs','index',array("albumArray" => $albumArray));
			} else {
				return new TemplateResponse('souvenirs','error',array('msg' => 'Wrong album path {ALBUM_DIR}'));
			}
		} catch(\OCP\Files\NotFoundException $e) {
			$this->userFolder->newFolder(ALBUM_DIR);
			if ($this->userFolder->get(ALBUM_DIR) instanceof \OCP\Files\Folder) {
				return new TemplateResponse('souvenirs','index',array("albumArray" => null));
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
				$jsonAlbum = $file->getContent();
				return new TemplateResponse('souvenirs','show',array('album_json' => json_decode($jsonAlbum), 'apath' => $apath));
			} else {
				return new TemplateResponse('souvenirs','error',array('msg' => 'Can not read file'));
			}
		} catch(\OCP\Files\NotFoundException $e) {
			return new TemplateResponse('souvenirs','error',array('msg' => 'File does not exist'));
		}
	}

}
