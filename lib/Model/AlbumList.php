<?php
namespace OCA\Souvenir\Model;

use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCA\Souvenir\Model\Album;

define("ALBUM_DIR","/album");

class AlbumList {

    private $userFolder;


    public function __construct($userFolder) {
        $this->userFolder = $userFolder;
    }

    public function getList() {
        try {
			$file = $this->userFolder->get(ALBUM_DIR);
			if($file instanceof \OCP\Files\Folder) {
				$nodes = $file->getDirectoryListing();
				$albumArray = array();
				foreach ($nodes as $node) {
					if ($node instanceof \OCP\Files\Folder) {
						if (Album::isAlbum($node)) {
							$album = Album::withFolder($node);
							$albumArray[] = array("name" => $album->getName(), "id" => $album->getId());
						}
					}
				}
				return $albumArray;
			} else {
				return NULL;
			}
		} catch(\OCP\Files\NotFoundException $e) {
			return NULL;
        }
    }

    public static function getInstance($userFolder) {
        return new AlbumList($userFolder);
	}
	
	public function getAlbum($id) {
		try {
			$file = $this->userFolder->get(ALBUM_DIR);
			if($file instanceof \OCP\Files\Folder) {
				$nodes = $file->getDirectoryListing();
				foreach ($nodes as $node) {
					if($node instanceof \OCP\Files\Folder) {
						$album = Album::withFolder($node);
						if ($album->getId() === $id) {
							return $album;
						}
					}
				}
				return NULL;
			} else {
				return NULL;
			}
		} catch(\OCP\Files\NotFoundException $e) {
			return NULL;
        }
	}

	public function createAlbum($id) {
		if ($this->getAlbum($id) === NULL) {
			//get dir name
			$dirname = strftime("%Y%m%d%H%M%S");
			$albumNode = $this->userFolder->get(ALBUM_DIR)->newFolder($dirname);
			//create album
			return Album::create($albumNode,$id);
		} else {
			//return NULL if id already exists
			return NULL;
		}
	}
}