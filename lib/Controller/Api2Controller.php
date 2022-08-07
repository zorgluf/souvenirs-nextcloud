<?php
namespace OCA\Souvenirs\Controller;

use OCP\IRequest;
use OCP\IConfig;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Controller;
use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCP\AppFramework\Http;
use OCP\IURLGenerator;
use OCA\Souvenirs\Db\ShareMapper;
use OCA\Souvenirs\Model\AlbumList;
use OCA\Souvenirs\Model\Album;
use OCA\Souvenirs\Model\Page;
use OCA\Souvenirs\Controller\Utils;

define("ALBUM_LIST_PAGE_SIZE",10);


class Api2Controller extends Controller {
	private $userId;
	private $userFolder;
	private $il10n;
	private $shareMapper;
	private $urlGen;
	private $config;

	public function __construct($AppName, IRequest $request, $UserId, IRootFolder $rootFolder, IL10N $il10n, 
								ShareMapper $shareMapper, IURLGenerator $urlGen, IConfig $config) {
		parent::__construct($AppName, $request);
		$this->userId = $UserId;
		$this->userFolder = $rootFolder->getUserFolder($UserId);
		$this->il10n = $il10n;
		$this->shareMapper = $shareMapper;
		$this->urlGen = $urlGen;
		$this->config = $config;
	}

	/**
	* list album of current user
	* @NoAdminRequired
	* @NoCSRFRequired
	*/
	public function listAlbums($page = 1) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$arrayAlbum = $albumList->getList();
		if (is_null($arrayAlbum)) {
			return new JSONResponse(array(), Http::STATUS_INTERNAL_SERVER_ERROR);
		}
		//return only ids
		$ret_list = array();
		for ($i = (ALBUM_LIST_PAGE_SIZE*($page-1)); $i < min(ALBUM_LIST_PAGE_SIZE*$page,count($arrayAlbum)) ; $i++) {
			$ret_list[] = $arrayAlbum[$i]["id"];
		}
		return new JSONResponse($ret_list);
	}

	/**
	 * create blank album
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function createAlbum($id) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->createAlbum($id);
		if (!is_null($album)) {
			return new JSONResponse($album->toArray());
		} else {
			//album exists
			return new JSONResponse(array(), Http::STATUS_CONFLICT);
		}
	}

	/**
	 * get album
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function getAlbum($id,$apath) {
		if ($apath !== null) {
			$album = Album::withFolder($this->userFolder->get($apath));
		} else {
			$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
			$albumList = AlbumList::getInstance($albumsFolder);
			$album = $albumList->getAlbum($id);
		}
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		$albumArray = $album->toArray();
		//add path of album
		$albumArray["path"] = $this->userFolder->getRelativePath($album->getPath());
		//add share
		$share = $this->shareMapper->findByAlbumId($this->userId,$id);
		if (!is_null($share)) {
			$albumArray["isShared"] = true;
			$albumArray["shareToken"] = $share->getToken();
		}
		return new JSONResponse($albumArray);
	}

	/**
	 * get album full
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function getAlbumFull($id,$apath) {
		if ($apath !== null) {
			$album = Album::withFolder($this->userFolder->get($apath));
		} else {
			$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
			$albumList = AlbumList::getInstance($albumsFolder);
			$album = $albumList->getAlbum($id);
		}
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		$albumArray = $album->toArrayFull();
		foreach ($albumArray as $key => $value) {
			if (is_null($value)) {
				unset($albumArray[$key]);
			}
		}
		if ($apath === null) {
			//add share
			$share = $this->shareMapper->findByAlbumId($this->userId,$id);
			if (!is_null($share)) {
				$albumArray["isShared"] = true;
				$albumArray["shareToken"] = $share->getToken();
			}
		}
		return new JSONResponse($albumArray);
	}

		/**
	 * get album assets
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function getAlbumAssets($id,$apath) {
		if ($apath !== null) {
			$album = Album::withFolder($this->userFolder->get($apath));
		} else {
			$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
			$albumList = AlbumList::getInstance($albumsFolder);
			$album = $albumList->getAlbum($id);
		}
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		$assetsArray = $album->getAssets();
		return new JSONResponse($assetsArray);
	}

	/**
	 * post album infos
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function postAlbum($id) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		$albumValues = $this->request->params;
		//remove conflicting values
		unset($albumValues["isShared"]);
		unset($albumValues["shareToken"]);
		//set values to model
		$album->setValues($albumValues);
		$album->save();
		$albumArray = $album->toArray();
		return new JSONResponse("OK");
	}

	/**
	 * delete album
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function deleteAlbum($id) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		if ($album->delete()) {
			return new JSONResponse("OK");
		} else {
			return new JSONResponse(array(),Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * get asset status infos
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function assetExistsInAlbum($id,$asset_path) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		//search locally
		if ($album->hasAsset($asset_path)) {
			$asset_relative_path = $this->userFolder->getRelativePath($album->buildFullAssetPath($asset_path));
			return new JSONResponse(array("status" => "ok",
										"path" => $asset_relative_path,
									"size" => $this->userFolder->get($asset_relative_path)->getSize() ));
		}
		//search local link
		if ($album->hasAssetLink($asset_path)) {
			$asset_link = $album->getAssetLink($asset_path);
			$asset_relative_path = $this->userFolder->getRelativePath($asset_link->getAssetPath());
			return new JSONResponse(array("status" => "ok",
										"path" => $asset_relative_path,
									"size" => $asset_link->getAssetSize()));
		}
		return new JSONResponse(array("path" => $this->userFolder->getRelativePath($album->buildFullAssetPath($asset_path)),
				"status" => "missing"));
	}

	/**
	 * search for same asset in all nextcloud user files
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function assetSearch($id,$asset,$asset_name,$asset_size) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		if ($album->searchAssetAndLink($this->userFolder,$asset,$asset_name,(int)$asset_size)) {
			return new JSONResponse(array("linkCreated" => "OK",
				"status" => "found"));
		} else {
			return new JSONResponse(array("status" => "notfound"));
		}
	}

	/**
	 * clean assets
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function cleanAssets($id) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		if ($album->cleanAssets($this->userFolder)) {
			return new JSONResponse("OK");
		} else {
			return new JSONResponse(array(), Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * create page
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function createPage($album_id,$page_pos) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->getAlbum($album_id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		$pageArray = $this->request->params;
		unset($pageArray["album_id"]);
		unset($pageArray["page_pos"]);
		$page = new Page($pageArray);
		$res = $album->insertPage($page,$page_pos);
		if ($res) {
			$album->save();
			return new JSONResponse("OK");
		} else {
			return new JSONResponse(array(), Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * delete page
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function DeletePage($album_id,$page_id) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->getAlbum($album_id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		if ($album->deletePage($page_id)) {
			$album->save();
			return new JSONResponse("OK");
		} else {
			return new JSONResponse(array(), Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * post page
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function postPage($album_id,$page_id) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->getAlbum($album_id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		$page = $album->getPage($page_id);
		if (!is_null($page)) {
			$pageArray = $this->request->params;
			unset($pageArray["album_id"]);
			unset($pageArray["page_id"]);
			$page->setValues($pageArray);
			$album->updatePage($page);
			$album->save();
			return new JSONResponse("OK");
		}
		return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
	}

	/**
	 * move page
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function movePage($album_id,$page_id,$page_pos) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->getAlbum($album_id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		$page = $album->getPage($page_id);
		if (!is_null($page)) {
			if ($album->movePage($page,$page_pos)) {
				$album->save();
				return new JSONResponse("OK");
			} else {
				return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
			}
		}
		return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
	}
		
	/**
	 * list users shares
	 * @NoAdminRequired
	 */
	public function getShareByUser() {
		
		$shares = $this->shareMapper->findAllByUser($this->userId);
		$results = array();
        foreach ($shares as $share) {
            $results[] = $share->toArray();
        }
		return new JSONResponse($results);
	}

	/**
	 * create share
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function createShare($albumId) {
		
		$results = $this->shareMapper->createShare($this->userId,$albumId);
		//get shareUrl
		$shareUrl = $this->urlGen->linkToRouteAbsolute('souvenirs.public.show',array('token' => $results['share']['token']));

		return new JSONResponse($shareUrl);
	}

	/**
	 * delete share
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 * @param string $token
	 */
	public function deleteShare($token) {
		
		$share = $this->shareMapper->findByToken($token);
		if (is_null($share)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		$albumId = $share->getAlbumId();
		if (is_null($albumId)) {
			return new JSONResponse(array(), Http::STATUS_INTERNAL_SERVER_ERROR);
		}
		$results = $this->shareMapper->deleteShare($this->userId,$albumId);
		
		if ($results["action"] === "success") {
			return new JSONResponse("OK");
		}
		return new JSONResponse(array(), Http::STATUS_INTERNAL_SERVER_ERROR);
	}

}
