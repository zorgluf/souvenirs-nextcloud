<?php
namespace OCA\Souvenir\Controller;

use OCP\IRequest;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Template\PublicTemplateResponse;
use OCP\AppFramework\Controller;
use OCP\Files\IRootFolder;
use OCP\IL10N;

use OCA\Souvenir\Db\ShareMapper;
use OCA\Souvenir\Model\AlbumList;

define("ALBUM_CONF_FILENAME","album.json");
define("ALBUM_DIR","/album");

class PublicController extends Controller {
	private $il10n;
	private $shareMapper;
	private $rootFolder;


	public function __construct($AppName, IRequest $request, IRootFolder $rootFolder, IL10N $il10n, ShareMapper $shareMapper){
		parent::__construct($AppName, $request);
		$this->rootFolder = $rootFolder;
		$this->il10n = $il10n;
		$this->shareMapper = $shareMapper;
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
			$albumList = AlbumList::getInstance($userFolder);
			$album = $albumList->getAlbum($share->getAlbumId());
			if (is_null($album)) {
				return new PublicTemplateResponse($this->appName, 'publicerr', array('msg' => 'Cannot read file'));
			}
			$param = array('album_json' => $album->toArrayFull(), 'apath' => $album->getAlbumPath(), "token" => $token);
		} catch(\OCP\Files\NotFoundException $e) {
			return new PublicTemplateResponse($this->appName, 'publicerr', array('msg' => 'File does not exist'));
		}
		//create public template
		$template = new PublicTemplateResponse($this->appName, 'publicshow', $param);
        $template->setHeaderTitle('Public albums');
        $template->setHeaderDetails($param['album_json']['name']);
        return $template;
	}

}
