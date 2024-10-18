<?php
namespace OCA\Souvenirs\Model;

use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCA\Souvenirs\Model\Album;

class AlbumList {

    private $albumsFolder;


    public function __construct($albumsFolder) {
        $this->albumsFolder = $albumsFolder;
    }



    public function getList() {
        try {
			if($this->albumsFolder instanceof \OCP\Files\Folder) {
				$nodes = $this->albumsFolder->getDirectoryListing();
				usort($nodes,function($a,$b) {
					return strcmp($b->getName(),$a->getName());
				});
				$albumArray = array();
				foreach ($nodes as $node) {
					if ($node instanceof \OCP\Files\Folder) {
						if (Album::isAlbum($node)) {
							$album = Album::withFolder($node);
							$albumArray[] = array("name" => $album->getName(), "id" => $album->getId(), "path" => $node->getPath());
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

    public static function getInstance($albumsFolder) {
        return new AlbumList($albumsFolder);
	}
	
	public function getAlbum($id) {
		try {
			if($this->albumsFolder instanceof \OCP\Files\Folder) {
				$nodes = $this->albumsFolder->getDirectoryListing();
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
			$albumNode = $this->albumsFolder->newFolder($dirname);
			//create album
			return Album::create($albumNode,$id);
		} else {
			//return NULL if id already exists
			return NULL;
		}
	}
}