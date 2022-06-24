<?php
namespace OCA\Souvenirs\Model;

use OCP\Files\Folder;
use OCA\Souvenirs\Model\Page;
use OCA\Souvenirs\Model\AssetLink;
use OCA\Souvenirs\Model\AlbumList;

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

    /**
	 * search if asset is in local album data folder
	 */
    public function hasAsset($assetPath) {
        return $this->albumNode->nodeExists($assetPath);
    }

    /**
	 * search if we have a nc link to asset
	 */
    public function hasAssetLink($assetPath) {
        //check if link file exists
        if ($this->albumNode->nodeExists($assetPath . ".lnk")) {
            $link = $this->getAssetLink($assetPath);
            if (!is_null($link)) {
                //check if link points to an existing file
                $root = $this->albumNode;
                while (substr_count($root->getPath(),"/") > 2) {
                    $root = $root->getParent();
                }
                return $root->nodeExists( $root->getRelativePath($link->getAssetPath()) );
            }
        }
        return FALSE;
    }
    public function getAssetLink($assetPath) {
        try {
            $assetLink = $this->albumNode->get($assetPath . ".lnk");
            $link = AssetLink::createFromFile($assetLink);
        } catch (NotFoundException $e) {
            return NULL;
        }
        return $link;
    }

    /**
     * get real file path of an asset
     */
    public function getAssetRealPath($assetPath) {
        if ($this->hasAsset($assetPath)) {
            return $this->albumNode->get($assetPath)->getPath();
        }
        if ($this->hasAssetLink($assetPath)) {
            $link = $this->getAssetLink($assetPath);
            return $link->getAssetPath();
        }
        return "unknown";
    }

    public function buildFullAssetPath($assetPath) {
        return $this->albumNode->getFullPath($assetPath);
    }

    public function cleanAssets($userFolder) {
        //list data dir
        $dataFiles = $this->albumNode->get(DATA_DIR)->search("%");
        //loop on page/element to check if assets still in use
        foreach ($this->getPages() as $page) {
            foreach ($page->getElements() as $element) {
                foreach ($element->getAssets() as $asset) {
                    $dataFiles = array_filter($dataFiles,function ($v) use ($asset) {
                        return !(str_starts_with($v->getName(),basename($asset)));
                    });
                }
            }
        }
        //check album image
        if (!is_null($this->getAlbumImage())) {
            $dataFiles = array_filter($dataFiles,function ($v) {
                return !(str_starts_with($v->getName(),basename($this->getAlbumImage())));
            });
        }
        //delete remainings assets
        foreach ($dataFiles as $file) {
            $file->delete();
        }
        //search for duplicated files in user root FS and create assetLinks
        foreach ($this->getPages() as $page) {
            foreach ($page->getElements() as $element) {
                if (is_null($element->getImage())) {
                    continue;
                }
                //if link exists, skip the search
                if ($this->hasAssetLink($element->getImage())) {
                    continue;
                }
                if (is_null($element->getContent("name")) || $element->getContent("name") === "") {
                    continue;
                }
                if (is_null($element->getContent("size")) || $element->getContent("size") === 0) {
                    continue;
                }
                //if name and size look for similar file
                $nodesSameName = $userFolder->search($element->getContent("name"));
                foreach ($nodesSameName as $node) {
                    //do not link if in an other album
                    if (str_starts_with($node->getPath(),$this->albumNode->getParent()->getPath())) {
                        continue;
                    }
                    if ($node->getSize() === $element->getContent("size")) {
                        //same name and size -> replace asset with a link
                        try {
                            $asset = $this->albumNode->get($element->getContent("image"));
                            $link = AssetLink::replaceAssetWithLink($asset, $node);
                            break;
                        } catch (NotFoundException $e) {
                            //TODO log error
                            continue;
                        }
                        
                    }
                }
            }
        }
        return true;
    }

    public function getPath() {
        return $this->albumNode->getPath();
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
        $albumArray = $this->contentArray;
        //remove buggy shared informations
        foreach (array("isShared","shareToken") as $key) {
            if (array_key_exists($key,$albumArray)) {
                unset($albumArray[$key]);
            }
        }
        return $this->contentArray;
    }

    public function setValues($valuesArray) {
        if (is_array($valuesArray)) {
            foreach ($valuesArray as $key => $value) {
                if ((!is_null($value)) && (substr($key,0,1) !== "_")) {
                    $this->setContent($key,$value);
                }
            }
        }
    }
}