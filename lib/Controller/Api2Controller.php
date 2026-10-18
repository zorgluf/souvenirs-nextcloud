<?php
namespace OCA\Souvenirs\Controller;

use OCP\IRequest;
use OCP\IConfig;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\ApiController;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IL10N;
use OCP\AppFramework\Http;
use OCP\IURLGenerator;
use OCA\Souvenirs\Db\ShareMapper;
use OCA\Souvenirs\Db\AlbumMapper;
use OCA\Souvenirs\Model\AlbumList;
use OCA\Souvenirs\Model\Album;
use OCA\Souvenirs\Model\Page;
use OCA\Souvenirs\Controller\Utils;
use OCA\Souvenirs\Service\AlbumLock;
use OCA\Souvenirs\Service\Profiler;
use OCP\Lock\LockedException;

define("ALBUM_LIST_PAGE_SIZE",10);
//upper bound of operations/assets in one batch request (issue #50)
define("BATCH_MAX_ITEMS",500);


class Api2Controller extends ApiController {
	private $userId;
	private $userFolder;
	private $il10n;
	private $shareMapper;
	private $urlGen;
	private $config;
	private $rootFolder;
	private $albumMapper;
	private $albumLock;

	public function __construct($AppName, IRequest $request, $UserId, IRootFolder $rootFolder, IL10N $il10n, 
								ShareMapper $shareMapper, IURLGenerator $urlGen, IConfig $config, AlbumMapper $albumMapper,
								AlbumLock $albumLock) {
		parent::__construct($AppName, $request);
		$this->userId = $UserId;
		$this->userFolder = $rootFolder->getUserFolder($UserId);
		$this->rootFolder = $rootFolder;
		$this->il10n = $il10n;
		$this->shareMapper = $shareMapper;
		$this->albumMapper = $albumMapper;
		$this->urlGen = $urlGen;
		$this->config = $config;
		$this->albumLock = $albumLock;
	}

	/**
	 * Resolve an album from an explicit user-relative path (web SPA) or, failing that,
	 * from the id -> path DB index (API clients). Returns null when the album cannot be
	 * resolved: missing index row, stale/deleted path, folder without album.json, ...
	 */
	private function findAlbum($id, $apath = null) {
		$folder = $this->findAlbumFolder($id, $apath);
		//null when the folder holds no album.json (single lookup, issue #50)
		return is_null($folder) ? null : Album::tryLoad($folder);
	}

	/**
	 * Same resolution as findAlbum, without loading album.json yet: the folder
	 * an album should live in, or null.
	 */
	private function findAlbumFolder($id, $apath = null) {
		return Profiler::measure('resolve', fn () => $this->doFindAlbumFolder($id, $apath));
	}

	private function doFindAlbumFolder($id, $apath) {
		try {
			if ($apath !== null) {
				$folder = $this->userFolder->get($apath);
			} else {
				$album_db = $this->albumMapper->findByAlbumId($this->userId, $id);
				if (is_null($album_db) || is_null($album_db->getPath())) {
					return null;
				}
				$folder = $this->rootFolder->get($album_db->getPath());
			}
		} catch (NotFoundException $e) {
			return null;
		}
		return ($folder instanceof Folder) ? $folder : null;
	}

	/**
	 * Run a read-modify-write of album.json under the album lock (issue #50):
	 * the album is loaded once the lock is held, so concurrent writers (two
	 * tabs, web and Android) cannot overwrite each other's changes.
	 *
	 * @param callable(Album): JSONResponse $fn
	 */
	private function writeAlbum($id, callable $fn) {
		$folder = $this->findAlbumFolder($id);
		if (is_null($folder)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		try {
			return $this->albumLock->run($folder->getPath(), function () use ($folder, $fn) {
				$album = Album::tryLoad($folder);
				if (is_null($album)) {
					return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
				}
				return $fn($album);
			});
		} catch (LockedException $e) {
			//still busy after AlbumLock::WAIT_MS: the client may retry
			return new JSONResponse(array(), Http::STATUS_LOCKED);
		}
	}

	/**
	* list album of current user
	* @CORS
	* @NoAdminRequired
	* @NoCSRFRequired
	*/
	public function listAlbums($page = 1) {
		$albums = $this->albumMapper->findAllByUser($this->userId);
		//return only ids
		$ret_list = array();
		for ($i = (ALBUM_LIST_PAGE_SIZE*($page-1)); $i < min(ALBUM_LIST_PAGE_SIZE*$page,count($albums)) ; $i++) {
			$ret_list[] = $albums[$i]->getAlbumId();
		}
		return new JSONResponse($ret_list);
	}

	/**
	* list albums of current user with their details (same as get album), in one call
	* @CORS
	* @NoAdminRequired
	* @NoCSRFRequired
	*/
	public function listAlbumsDetails() {
		$ret_list = array();
		foreach ($this->albumMapper->findAllByUser($this->userId) as $album_db) {
			$album = $this->findAlbum($album_db->getAlbumId());
			//skip unresolvable albums, as get album returns 404 for them
			if (!is_null($album)) {
				$ret_list[] = $this->albumToApiArray($album, $album_db->getAlbumId());
			}
		}
		return new JSONResponse($ret_list);
	}

	/**
	 * create blank album
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function createAlbum($id) {
		$albumsFolder = Utils::getAlbumsNode($this->config, $this->userId, $this->appName, $this->userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);
		$album = $albumList->createAlbum($id);
		if (is_null($album)) {
			//album already exists
			return new JSONResponse(array(), Http::STATUS_CONFLICT);
		}
		$this->albumMapper->createAlbum($this->userId, $id, $album->getAlbumPath(), 'Just created');
		return new JSONResponse($album->toArray());
	}

	/**
	 * get album
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function getAlbum($id,$apath) {
		$album = $this->findAlbum($id, $apath);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		return new JSONResponse($this->albumToApiArray($album, $id));
	}

	/**
	 * album as returned by get album : album.json without pages, plus path and share
	 */
	private function albumToApiArray(Album $album, $id) {
		$albumArray = $album->toArray();
		//add path of album
		$albumArray["path"] = $this->userFolder->getRelativePath($album->getPath());
		//add share
		$share = $this->shareMapper->findByAlbumId($this->userId,$id);
		if (!is_null($share)) {
			$albumArray["isShared"] = true;
			$albumArray["shareToken"] = $share->getToken();
		}
		return $albumArray;
	}

	/**
	 * get album full
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function getAlbumFull($id,$apath) {
		$album = $this->findAlbum($id, $apath);
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
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function getAlbumAssets($id,$apath) {
		$album = $this->findAlbum($id, $apath);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		$assetsArray = $album->getAssets();
		return new JSONResponse($assetsArray);
	}

	/**
	 * post album infos
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function postAlbum($id) {
		$albumValues = $this->request->params;
		//remove conflicting values
		unset($albumValues["isShared"]);
		unset($albumValues["shareToken"]);
		return $this->writeAlbum($id, function (Album $album) use ($albumValues) {
			//set values to model
			$album->setValues($albumValues);
			$lastEditDate = $album->setLastEditDate();
			$album->save();
			return new JSONResponse(array("lastEditDate" => $lastEditDate));
		});
	}

	/**
	 * delete album
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function deleteAlbum($id) {
		$album = $this->findAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		if ($album->delete()) {
			$this->albumMapper->deleteAlbum($this->userId, $id);
			return new JSONResponse("OK");
		} else {
			return new JSONResponse(array(),Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * get asset status infos
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function assetExistsInAlbum($id,$asset_path) {
		$album = $this->findAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		//search locally (one lookup gives both existence and size)
		$asset_node = $album->getAssetNode($asset_path);
		if (!is_null($asset_node)) {
			return new JSONResponse(array("status" => "ok",
										"path" => $this->userFolder->getRelativePath($asset_node->getPath()),
									"size" => $asset_node->getSize() ));
		}
		//search local link (link file read once, target checked from the user root)
		$asset_link = $album->getAssetLink($asset_path);
		if (!is_null($asset_link) && $album->linkTargetExists($asset_link, $this->userFolder)) {
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
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function assetSearch($id,$asset,$asset_name,$asset_size) {
		$album = $this->findAlbum($id);
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
	 * link several picked files into the album in one call (issue #50).
	 * Each item: {asset, asset_name, asset_size, source?}. With `source` (the
	 * picked file's path relative to the user root, known by the web chooser)
	 * the link is created without any search; otherwise, or when that file
	 * does not qualify, the same name + size search as GET assetsearch runs.
	 * Responds {results: [{status: "found"|"notfound"|"invalid"}]} in order.
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function assetSearchBatch($id, $assets = array()) {
		if (!is_array($assets) || count($assets) > BATCH_MAX_ITEMS) {
			return new JSONResponse(array("message" => "assets: array of at most " . BATCH_MAX_ITEMS . " items expected"), Http::STATUS_BAD_REQUEST);
		}
		$album = $this->findAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		$results = array();
		foreach ($assets as $item) {
			$asset = is_array($item) ? ($item["asset"] ?? null) : null;
			//only new album data files: data/<file name>
			if (!is_string($asset) || !preg_match('#^' . DATA_DIR . '/[^/\\\\]+$#', $asset) || str_contains($asset, "\0")
				|| basename($asset) === '.' || basename($asset) === '..') {
				$results[] = array("status" => "invalid");
				continue;
			}
			$name = $item["asset_name"] ?? null;
			$size = isset($item["asset_size"]) ? (int)$item["asset_size"] : null;
			$source = $item["source"] ?? null;
			$found = is_string($source) && $source !== ''
				&& $album->linkAssetToSource($this->userFolder, $asset, $source, $size);
			if (!$found) {
				$found = $album->searchAssetAndLink($this->userFolder, $asset, $name, (int)$size);
			}
			$results[] = array("status" => $found ? "found" : "notfound");
		}
		return new JSONResponse(array("results" => $results));
	}

	/**
	 * clean assets
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function cleanAssets($id) {
		$album = $this->findAlbum($id);
		if (is_null($album)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		if (Profiler::measure('clean', fn () => $album->cleanAssets($this->userFolder))) {
			return new JSONResponse("OK");
		} else {
			return new JSONResponse(array(), Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * create page
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function createPage($album_id,$page_pos) {
		$pageArray = $this->request->params;
		unset($pageArray["album_id"]);
		unset($pageArray["page_pos"]);
		return $this->writeAlbum($album_id, function (Album $album) use ($pageArray, $page_pos) {
			$page = new Page($pageArray);
			$lastEditDate = $page->setLastEditDate();
			$res = $album->insertPage($page,$page_pos);
			if ($res) {
				$pageLastEditDate = $album->setPageLastEditDate();
				$album->save();
				return new JSONResponse(array("lastEditDate" => $lastEditDate, "pageLastEditDate" => $pageLastEditDate));
			} else {
				return new JSONResponse(array(), Http::STATUS_INTERNAL_SERVER_ERROR);
			}
		});
	}

	/**
	 * delete page
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function DeletePage($album_id,$page_id) {
		return $this->writeAlbum($album_id, function (Album $album) use ($page_id) {
			if ($album->deletePage($page_id)) {
				$pageLastEditDate = $album->setPageLastEditDate();
				$album->save();
				return new JSONResponse(array("pageLastEditDate" => $pageLastEditDate));
			} else {
				return new JSONResponse(array(), Http::STATUS_INTERNAL_SERVER_ERROR);
			}
		});
	}

	/**
	 * post page
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function postPage($album_id,$page_id) {
		$pageArray = $this->request->params;
		unset($pageArray["album_id"]);
		unset($pageArray["page_id"]);
		return $this->writeAlbum($album_id, function (Album $album) use ($page_id, $pageArray) {
			$page = $album->getPage($page_id);
			if (!is_null($page)) {
				$page->setValues($pageArray);
				$lastEditDate = $page->setLastEditDate();
				$album->updatePage($page);
				$album->save();
				return new JSONResponse(array("lastEditDate" => $lastEditDate));
			}
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		});
	}

	/**
	 * apply several page operations (update, create, delete, move) in one
	 * album write - see Album::applyPageOperations (issue #50)
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function batchPages($album_id, $operations = array()) {
		if (!is_array($operations) || count($operations) > BATCH_MAX_ITEMS) {
			return new JSONResponse(array("message" => "operations: array of at most " . BATCH_MAX_ITEMS . " items expected"), Http::STATUS_BAD_REQUEST);
		}
		return $this->writeAlbum($album_id, function (Album $album) use ($operations) {
			if (count($operations) === 0) {
				return new JSONResponse(array("results" => array()));
			}
			try {
				$applied = $album->applyPageOperations($operations);
			} catch (\OutOfBoundsException $e) {
				return new JSONResponse(array("message" => $e->getMessage()), Http::STATUS_NOT_FOUND);
			} catch (\InvalidArgumentException $e) {
				return new JSONResponse(array("message" => $e->getMessage()), Http::STATUS_BAD_REQUEST);
			}
			$album->save();
			$response = array("results" => $applied["results"]);
			if (!is_null($applied["pageLastEditDate"])) {
				$response["pageLastEditDate"] = $applied["pageLastEditDate"];
			}
			return new JSONResponse($response);
		});
	}

	/**
	 * move page
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function movePage($album_id,$page_id,$page_pos) {
		return $this->writeAlbum($album_id, function (Album $album) use ($page_id, $page_pos) {
			$page = $album->getPage($page_id);
			if (!is_null($page)) {
				if ($album->movePage($page,$page_pos)) {
					$pageLastEditDate = $album->setPageLastEditDate();
					$album->save();
					return new JSONResponse(array("pageLastEditDate" => $pageLastEditDate));
				} else {
					return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
				}
			}
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		});
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
	 * @CORS
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function createShare($albumId, $validUntil = null) {
		//make sure the album actually exists for this user before sharing it
		$album_db = $this->albumMapper->findByAlbumId($this->userId, $albumId);
		if (is_null($album_db)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		//optional expiration date (YYYY-MM-DD); the share stays valid through that day.
		//null falls back to the mapper default (+3 months) so older clients keep working.
		$validUntilDate = null;
		if (!is_null($validUntil) && $validUntil !== '') {
			$validUntilDate = \DateTime::createFromFormat('Y-m-d', $validUntil);
			if ($validUntilDate === false) {
				return new JSONResponse(array(), Http::STATUS_BAD_REQUEST);
			}
			$validUntilDate->setTime(23, 59, 59);
		}
		$results = $this->shareMapper->createShare($this->userId, $albumId, $validUntilDate);
		//get shareUrl
		$shareUrl = $this->urlGen->linkToRouteAbsolute('souvenirs.public.show',array('token' => $results['share']['token']));

		return new JSONResponse($shareUrl);
	}

	/**
	 * delete share
	 * @CORS
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
