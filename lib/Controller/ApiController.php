<?php
namespace OCA\Souvenirs\Controller;

use OCP\IRequest;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Controller;
use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCA\Souvenirs\Db\ShareMapper;
use OCA\Souvenirs\Model\AlbumList;
use OCA\Souvenirs\Model\Page;


class ApiController extends Controller {
	private $userId;
	private $userFolder;
	private $il10n;
	private $shareMapper;
	private $urlGen;


	public function __construct($AppName, IRequest $request, $UserId, IRootFolder $rootFolder, IL10N $il10n, ShareMapper $shareMapper, IURLGenerator $urlGen){
		parent::__construct($AppName, $request);
		$this->userId = $UserId;
		$this->userFolder = $rootFolder->getUserFolder($UserId);
		$this->il10n = $il10n;
		$this->shareMapper = $shareMapper;
		$this->urlGen = $urlGen;
		}

	/**
	* list album of current user
	* @NoAdminRequired
	* @NoCSRFRequired
	*/
	public function listAlbums() {
		$albumList = AlbumList::getInstance($this->userFolder);
		$arrayAlbum = $albumList->getList();
		if (is_null($arrayAlbum)) {
			return new JSONResponse(array("error" => "Impossible to get album list, check album path."));
		}
		return new JSONResponse(array("result" => $arrayAlbum));
	}

	/**
	 * create blank album
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function createAlbum($id) {
		$albumList = AlbumList::getInstance($this->userFolder);
		$album = $albumList->createAlbum($id);
		if (!is_null($album)) {
			return new JSONResponse(array("result" => $album->toArray()));
		} else {
			//album exists, return info
			return new JSONResponse(array("error" => "Album already exists."));
		}
	}

	/**
	 * get album
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function getAlbum($id) {
		$albumList = AlbumList::getInstance($this->userFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array("error" => "Impossible to get album with id {id}."));
		}
		$albumArray = $album->toArray();
		//add share 
		$share = $this->shareMapper->findByAlbumId($this->userId,$id);
		if (!is_null($share)) {
			$albumArray["isShared"] = true;
			$albumArray["shareToken"] = $share->getToken();
		}
		return new JSONResponse(array("result" => $albumArray));
	}

	/**
	 * get album full
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function getAlbumFull($id) {
		$albumList = AlbumList::getInstance($this->userFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array("error" => "Impossible to get album with id {id}."));
		}
		$albumArray = $album->toArrayFull();
		foreach ($albumArray as $key => $value) {
			if (is_null($value)) {
				unset($albumArray[$key]);
			}
		}
		return new JSONResponse(array("result" => $albumArray));
	}

	/**
	 * post album infos
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function postAlbum($id,$infos) {
		$albumList = AlbumList::getInstance($this->userFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array("error" => "Impossible to get album with id {id}."));
		}
		$album->setValues($infos);
		$album->save();
		$albumArray = $album->toArray();
		return new JSONResponse(array("result" => $albumArray));
	}

	/**
	 * get asset status infos
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function assetExistsInAlbum($id,$asset_path) {
		$albumList = AlbumList::getInstance($this->userFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array("error" => "Impossible to get album with id {id}."));
		}
		if ($album->hasAsset($asset_path)) {
			return new JSONResponse(array("result" => array("status" => "ok",
										"fullpath" => $this->userFolder->getRelativePath($album->buildFullAssetPath($asset_path)))));
		} else {
			return new JSONResponse(array("result" => 
				array("suggested_path" => $this->userFolder->getRelativePath($album->buildFullAssetPath($asset_path)),
				"status" => "missing")));
		}
	}

	/**
	 * clean assets
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function cleanAssets($id) {
		$albumList = AlbumList::getInstance($this->userFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array("error" => "Impossible to get album with id {id}."));
		}
		if ($album->cleanAssets()) {
			return new JSONResponse(array("result" => array("status" => "ok")));
		} else {
			return new JSONResponse(array("error" => ""));
		}
	}

	/**
	 * create page
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function createPage($id,$page_pos,$infos) {
		$albumList = AlbumList::getInstance($this->userFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array("error" => "Impossible to get album with id {id}."));
		}
		$page = new Page($infos);
		$res = $album->insertPage($page,$page_pos);
		if ($res) {
			$album->save();
			return new JSONResponse(array("result" => $page->toArray()));
		} else {
			return new JSONResponse(array("error" => "Page not created in album."));
		}
	}

	/**
	 * delete page
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function DeletePage($id,$page_id) {
		$albumList = AlbumList::getInstance($this->userFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array("error" => "Impossible to get album with id {id}."));
		}
		if ($album->deletePage($page_id)) {
			$album->save();
			return new JSONResponse(array("result" => $album->toArray()));
		} else {
			return new JSONResponse(array("error" => "Page not deleted in album."));
		}
	}

	/**
	 * post page
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function postPage($id,$page_id,$infos) {
		$albumList = AlbumList::getInstance($this->userFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array("error" => "Impossible to get album with id {id}."));
		}
		$page = $album->getPage($page_id);
		if (!is_null($page)) {
			$page->setValues($infos);
			//$page->setValues(json_decode($infos, true));
			$album->updatePage($page);
			$album->save();
			return new JSONResponse(array("result" => $page->toArray()));
		}
		return new JSONResponse(array("error" => "Page not found in album."));
	}

	/**
	 * move page
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function movePage($id,$page_id,$page_pos) {
		$albumList = AlbumList::getInstance($this->userFolder);
		$album = $albumList->getAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array("error" => "Impossible to get album with id {id}."));
		}
		$page = $album->getPage($page_id);
		if (!is_null($page)) {
			if ($album->movePage($page,$page_pos)) {
				$album->save();
				return new JSONResponse(array("result" => "success"));
			} else {
				return new JSONResponse(array("error" => "Page not found in album."));
			}
		}
		return new JSONResponse(array("error" => "Page not found in album."));
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
		//add shareUrl
		$results['shareUrl'] = $this->urlGen->linkToRouteAbsolute('souvenir.public.show',array('token' => $results['share']['token']));

		return new JSONResponse($results);
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
			return new JSONResponse(array('action' => 'failure', 'error' => 'Share not found.'));
		}
		$albumId = $share->getAlbumId();
		if (is_null($albumId)) {
			return new JSONResponse(array('action' => 'failure', 'error' => 'Share malformed.'));
		}
		$results = $this->shareMapper->deleteShare($this->userId,$albumId);

		return new JSONResponse($results);
	}

}
