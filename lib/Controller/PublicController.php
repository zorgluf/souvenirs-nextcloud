<?php
namespace OCA\Souvenirs\Controller;

use OCP\IRequest;
use OCP\IConfig;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Template\PublicTemplateResponse;
use OCP\AppFramework\Controller;
use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCP\AppFramework\Http\JSONResponse;
use OCA\Souvenirs\Controller\Utils;

use OCA\Souvenirs\Db\ShareMapper;
use OCA\Souvenirs\Model\AlbumList;


class PublicController extends Controller {
	private $il10n;
	private $shareMapper;
	private $rootFolder;
	private $config;


	public function __construct($AppName, IRequest $request, IRootFolder $rootFolder, IL10N $il10n, 
								ShareMapper $shareMapper, IConfig $config) {
		parent::__construct($AppName, $request);
		$this->rootFolder = $rootFolder;
		$this->il10n = $il10n;
		$this->shareMapper = $shareMapper;
		$this->config = $config;
	}

	/**
	 *
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 * @PublicPage
	 * @BruteForceProtection(action=reset)
	 * 
	 * @param string $token
	 */
	public function show($token) {
		// check token and get album path
		$share = $this->shareMapper->findByToken($token);
		if (is_null($share)) {
			return new PublicTemplateResponse($this->appName, 'publicerr', array('msg' => 'Album does not exist'));
		}
		// get album data
		$param = array();
		try {
			$userFolder = $this->rootFolder->getUserFolder($share->getUser());
			$albumsFolder = Utils::getAlbumsNode($this->config, $share->getUser(), $this->appName, $userFolder);
			$albumList = AlbumList::getInstance($albumsFolder);
			$album = $albumList->getAlbum($share->getAlbumId());
			if (is_null($album)) {
				return new PublicTemplateResponse($this->appName, 'publicerr', array('msg' => 'Cannot read file'));
			}
			$param = array('apath' => $album->getAlbumPath(), "token" => $token);
		} catch(\OCP\Files\NotFoundException $e) {
			return new PublicTemplateResponse($this->appName, 'publicerr', array('msg' => 'File does not exist'));
		}
		//create public template
		$template = new PublicTemplateResponse($this->appName, 'publicshow', $param);
        $template->setHeaderTitle('Public albums');
        $template->setHeaderDetails($album->getName());
        return $template;
	}

	/**
	 * get album full
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 * @PublicPage
	 * @BruteForceProtection(action=reset)
	 */
	public function getAlbumFull($token) {
		// check token and get album path
		$share = $this->shareMapper->findByToken($token);
		if (is_null($share)) {
			return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
		}
		try {
			$userFolder = $this->rootFolder->getUserFolder($share->getUser());
			$albumsFolder = Utils::getAlbumsNode($this->config, $share->getUser(), $this->appName, $userFolder);
			$albumList = AlbumList::getInstance($albumsFolder);
			$album = $albumList->getAlbum($share->getAlbumId());
			if (is_null($album)) {
				return new JSONResponse(array(), Http::STATUS_NOT_FOUND);
			}
			$albumArray = $album->toArrayFull();
			foreach ($albumArray as $key => $value) {
				if (is_null($value)) {
					unset($albumArray[$key]);
				}
			}
			return new JSONResponse($albumArray);
		} catch(\OCP\Files\NotFoundException $e) {
			return new PublicTemplateResponse($this->appName, 'publicerr', array('msg' => 'File does not exist'));
		}
	}

}
