<?php
namespace OCA\Souvenirs\Model;

use OCP\Files\Folder;
use OCA\Souvenirs\Model\Page;

define("ALBUM_CONF_FILENAME","album.json");
define("DATA_DIR","data");

class Album {

    private $albumNode;
    private $contentArray;

    private function __construct() {
        $contentArray = array();
    }

    public static function withFolder(Folder $albumNode) {
        $instance = new self();
        $instance->loadByFolder($albumNode);
        return $instance;
    }

    public static function create(Folder $albumNode, $id) {
        //create empty album and save it
        $album = new self();
        $album->setAlbumNode($albumNode);
        $album->setId($id);
        $album->save();
        //create the data dir
        $albumNode->newFolder(DATA_DIR);
        return $album;
    }

    public static function isAlbum(Folder $node) {
        return $node->nodeExists(ALBUM_CONF_FILENAME);
    }

    protected function loadByFolder(Folder $albumNode) {
        if ($albumNode->nodeExists(ALBUM_CONF_FILENAME)) {
            //get album conf
            $jsonAlbum = $albumNode->get(ALBUM_CONF_FILENAME)->getContent();
            $this->contentArray = json_decode($jsonAlbum,true);
            $this->albumNode = $albumNode;
        }
    }

    public function delete() {
        try {
            $this->albumNode->delete();
        } catch (Exception $e) {
            return false;
        }
        return true;
    }

    public function setContent($name,$value) {
        $this->contentArray[$name] = $value;
    }
    public function getContent($name) {
        if (array_key_exists($name, $this->contentArray)) {
            return $this->contentArray[$name];
        } else {
            return NULL;
        }
    }

    public function getName() {
        return $this->getContent("name");
    }
    public function getId() {
        return $this->getContent("id");
    }
    public function getAlbumImage() {
        return $this->getContent("albumImage");
    }
    public function setId($id) {
        $this->setContent("id",$id);
    }
    public function getPages() {
        if (is_array($this->getContent("pages"))) {
            $pages = array();
            foreach($this->getContent("pages") as $pageArray) {
                $pages[] = new Page($pageArray);
            }
            return $pages;
        }
        return array();
    }

    public function getPage($id) {
        foreach ($this->getPages() as $page) {
            if ($page->getId() === $id) {
                return $page;
            }
        }
        return NULL;
    }

    public function getAlbumPath() {
        return $this->albumNode->getPath();
    }

    public function setPages($pages) {
        $out = array();
        foreach($pages as $page) {
            $out[] = $page->toArray();
        }
        $this->setContent("pages",$out);
    }

    public function insertPage($page,$pos) {
        $pages = $this->getPages();
        array_splice($pages,$pos,0,[$page]);
        $this->setPages($pages);
        return true;
    }

    public function movePage($page,$pos) {
        $old_pos = $this->getPagePos($page);
        $this->deletePage($page->getId());
        if ($old_pos <= $pos) {
            $this->insertPage($page,$pos-1);
        } else {
            $this->insertPage($page,$pos);
        }
        return true;
    }

    public function getPagePos($page) {
        foreach ($this->getPages() as $key => $p) {
            if ($p->getId() === $page->getId()) {
                return $key;
            }
        }
        return -1;
    }

    public function updatePage($pageNew){
        $pages = $this->getPages();
        foreach ($pages as &$page) {
            if ($page->getId() === $pageNew->getId()) {
                $page = $pageNew;
            }
        }
        $this->setPages($pages);
    } 

    public function deletePage($page_id) {
        $pages = $this->getPages();
        foreach ($pages as $key => $page) {
            if ($page->getId() === $page_id) {
                unset($pages[$key]);
                $this->setPages($pages);
                return true;
            }
        }
        return false;
    }

    public function setAlbumNode($node) {
        $this->albumNode = $node;
    }

    public function hasAsset($assetPath) {
        return $this->albumNode->nodeExists($assetPath);
    }

    public function buildFullAssetPath($assetPath) {
        return $this->albumNode->getFullPath($assetPath);
    }

    public function cleanAssets() {
        //list data dir
        $dataFiles = $this->albumNode->get(DATA_DIR)->search("%");
        //loop on page/element to check if assets still in use
        foreach ($this->getPages() as $page) {
            foreach ($page->getElements() as $element) {
                if (!is_null($element->getImage())) {
                    $dataFiles = array_filter($dataFiles,function ($v) use ($element) {
                        return ($v->getName() !== basename($element->getImage()));
                    });
                }
            }
        }
        //check album image
        if (!is_null($this->getAlbumImage())) {
            $dataFiles = array_filter($dataFiles,function ($v) {
                return ($v->getName() !== basename($this->getAlbumImage()));
            });
        }
        //delete remainings assets
        foreach ($dataFiles as $file) {
            $file->delete();
        }
        return true;
    }

    /**
     * save album conf file to disk
     */
    public function save() {
        $json = json_encode($this->contentArray);
        if ($this->albumNode->nodeExists(ALBUM_CONF_FILENAME)) {
            $file = $this->albumNode->get(ALBUM_CONF_FILENAME);
        } else {
            $file = $this->albumNode->newFile(ALBUM_CONF_FILENAME);
        }
        $file->putContent($json);
    }

    public function toArray() {
        $albumArray = $this->contentArray;
        unset($albumArray["pages"]);
        foreach ($albumArray as $key => $value) {
			if (is_null($value)) {
				unset($albumArray[$key]);
			}
        }
        return $albumArray;
    }

    public function toArrayFull() {
        return $this->contentArray;
    }

    public function setValues($valuesArray) {
        if (is_array($valuesArray)) {
            foreach ($valuesArray as $key => $value) {
                if ((!is_null($value)) && (substr($key,0,1) != "_")) {
                    $this->setContent($key,$value);
                }
            }
        }
    }
}