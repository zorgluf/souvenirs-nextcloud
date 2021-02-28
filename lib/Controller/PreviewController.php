<?php
namespace OCA\Souvenirs\Controller;

use OCP\IRequest;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Controller;
use OCP\Files\IRootFolder;
use OCP\IPreview;
use \OCP\ILogger;

use OCA\Souvenirs\Http\ImageResponse;
use OCA\Souvenirs\Db\ShareMapper;
use OCA\Souvenirs\Model\AlbumList;

define("DATA_DIR","data");

class PreviewController extends Controller {

    private $userId;
	private $preview;
	private $shareMapper;
	private $rootFolder;
	private $logger;

    public function __construct($AppName, ILogger $logger, IRequest $request, $UserId, IRootFolder $rootFolder, IPreview $preview, ShareMapper $shareMapper){
		parent::__construct($AppName, $request);
		$this->userId = $UserId;
		$this->rootFolder = $rootFolder;
		$this->preview = $preview;
		$this->shareMapper = $shareMapper;
		$this->logger = $logger;
    }
    
    /**
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 *
	 * Sends a large preview of the requested file
	 *
	 * @param string $file file path
	 * @param int $width
	 * @param int $height
	 *
	 * @return DataResponse|ImageResponse|JSONResponse
	 */
	public function getPreview($apath, $file, $width=-1, $height=-1) {

		$userFolder = $this->rootFolder->getUserFolder($this->userId);
		return $this->preview($userFolder, $apath, $file, $width, $height);
	}
	
	/**
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 * @PublicPage
	 *
	 * Sends a large preview of the requested file for public share
	 *
	 * @param string $token
	 * @param string $file file path
	 * @param int $width
	 * @param int $height
	 *
	 * @return DataResponse|ImageResponse|JSONResponse
	 */
	public function getPublicPreview($token, $file, $width=-1, $height=-1) {
		//check token and get album path
		$share = $this->shareMapper->findByToken($token);
		if (is_null($share)) {
			return new JSONResponse(
				[
					'message' => "Album do not exists.",
					'success' => false
				], Http::STATUS_NOT_FOUND
			);
		}
		$userFolder = $this->rootFolder->getUserFolder($share->getUser());
		$albumList = AlbumList::getInstance($userFolder);
		$album = $albumList->getAlbum($share->getAlbumId());
		if (is_null($album)) {
			return new PublicTemplateResponse($this->appName, 'publicerr', array('msg' => 'Cannot read file'));
		}
		return $this->preview($userFolder, $userFolder->getRelativePath($album->getAlbumPath()), $file, $width, $height);
	}

	/*
	* internal get preview image function
	*/
	private function preview($userFolder, $apath, $file, $width=-1, $height=-1) {
		try {
			$fileObj = $userFolder->get($apath . "/" . DATA_DIR . "/" . $file);
		} catch (\Exception $exception) {
			return new JSONResponse(
				[
					'message' => "File do not exists.",
					'success' => false
				], Http::STATUS_NOT_FOUND
			);
		}
		
		if (!($fileObj instanceof \OCP\Files\File)) {
            return new JSONResponse(
				[
					'message' => "File do not exists.",
					'success' => false
				], Http::STATUS_NOT_FOUND
			);
        }

		if ($this->request->getHeader('If-None-Match') === $fileObj->getEtag()) {
			return new DataResponse([], Http::STATUS_NOT_MODIFIED);
        }

		try {
			$mimeType = $fileObj->getMimeType();
			if (substr($mimeType, 0, 5) !== "image") { //force image mimetype if no extension to image
				$mimeType = "image/jpeg";
			}
			$previewFile = $this->preview->getPreview($fileObj, $width, $height, false, \OCP\IPreview::MODE_FILL, $mimeType);
			$previewImg = $previewFile->getContent();

		} catch (\Exception $exception) {
			return new JSONResponse(
				[
					'message' => "Preview generation has failed.",
					'success' => false
				], Http::STATUS_INTERNAL_SERVER_ERROR
			);
		}

		if (!$previewImg) {
			return new JSONResponse(
				[
					'message' => "I'm truly sorry, but we were unable to generate a preview for this file",
					'success' => false
				], Http::STATUS_INTERNAL_SERVER_ERROR
			);
		}

		$preview['name'] = $previewFile->getName();
		$preview['preview'] = $previewImg;
		$preview['mimetype'] = $mimeType;
		$response = new ImageResponse($preview);
		$response->setETag($previewFile->getEtag());
		$lastModified = new \DateTime();
		$lastModified->setTimestamp($previewFile->getMTime());
		$response->setLastModified($lastModified);
		$response->cacheFor(3600*24);

		return $response;
	}

}
?>