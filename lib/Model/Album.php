<?php
namespace OCA\Souvenirs\Model;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCA\Souvenirs\Model\Page;
use OCA\Souvenirs\Model\AssetLink;
use OCA\Souvenirs\Model\AlbumList;
use OCA\Souvenirs\Service\Profiler;

define("ALBUM_CONF_FILENAME","album.json");
define("DATA_DIR","data");

class Album {

    private $albumNode;
    private $contentArray;
    /** @var File|null album.json node, kept from load to save without a new lookup */
    private $confFile = null;

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
        $album->setLastEditDate();
        $album->setPageLastEditDate();
        $album->save();
        //create the data dir
        $albumNode->newFolder(DATA_DIR);
        return $album;
    }

    /**
     * load the album stored in $albumNode, or null when the folder holds no
     * album.json. One node lookup (issue #50), where isAlbum() followed by
     * withFolder() costs two plus a duplicate existence check.
     */
    public static function tryLoad(Folder $albumNode) {
        $instance = new self();
        $instance->loadByFolder($albumNode);
        return $instance->isLoaded() ? $instance : null;
    }

    public static function isAlbum(Folder $node) {
        return $node->nodeExists(ALBUM_CONF_FILENAME);
    }

    public function isLoaded() {
        return !is_null($this->albumNode);
    }

    protected function loadByFolder(Folder $albumNode) {
        Profiler::measure('load', function () use ($albumNode) {
            try {
                //get album conf (single lookup, no nodeExists() before)
                $confFile = $albumNode->get(ALBUM_CONF_FILENAME);
                $jsonAlbum = $confFile->getContent();
            } catch (NotFoundException $e) {
                //not an album folder
                return;
            }
            $this->contentArray = json_decode($jsonAlbum,true);
            $this->albumNode = $albumNode;
            $this->confFile = ($confFile instanceof File) ? $confFile : null;
        });
    }

    public function delete() {
        try {
            $this->albumNode->delete();
        } catch (\Exception $e) {
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

    /**
     * stamp the album with the current edit date (format YmdHis),
     * overwriting any existing value, and return it. To be called every
     * time album data (excluding pages) is modified.
     */
    public function setLastEditDate() {
        $lastEditDate = date('YmdHis');
        $this->setContent("lastEditDate",$lastEditDate);
        return $lastEditDate;
    }

    /**
     * stamp the album with the current page edit date (format YmdHis),
     * overwriting any existing value, and return it. To be called every
     * time a page is created, moved or deleted.
     */
    public function setPageLastEditDate() {
        $pageLastEditDate = date('YmdHis');
        $this->setContent("pageLastEditDate",$pageLastEditDate);
        return $pageLastEditDate;
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
    public function getDate() {
        $date = date_create_from_format("YmdHis", $this->getContent("date"));
        return $date;
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
     * node of an asset stored in the album data folder, or null
     * (one lookup, where hasAsset() + get() cost two)
     * @return Node|null
     */
    public function getAssetNode($assetPath) {
        try {
            return $this->albumNode->get($assetPath);
        } catch (NotFoundException $e) {
            return NULL;
        }
    }

    /**
	 * search if we have a nc link to asset, pointing to an existing file
	 * @param Folder|null $userFolder the user files root, saves walking up the
	 *                                album parents to find it
	 */
    public function hasAssetLink($assetPath, $userFolder = null) {
        $link = $this->getAssetLink($assetPath);
        return !is_null($link) && $this->linkTargetExists($link, $userFolder);
    }

    /**
     * read the link file of an asset (one lookup and one read), or null when
     * there is none or it is unreadable
     * @return AssetLink|null
     */
    public function getAssetLink($assetPath) {
        return Profiler::measure('link', function () use ($assetPath) {
            try {
                $assetLink = $this->albumNode->get($assetPath . ".lnk");
                if (!($assetLink instanceof File)) {
                    return NULL;
                }
                return AssetLink::createFromFile($assetLink);
            } catch (NotFoundException $e) {
                return NULL;
            }
        });
    }

    /**
     * check that the file a link points to still exists
     * @param Folder|null $userFolder the user files root, when the caller has it
     */
    public function linkTargetExists(AssetLink $link, $userFolder = null) {
        $root = $userFolder;
        if (is_null($root)) {
            //walk up to the user root ("/<user>/files")
            $root = $this->albumNode;
            while (substr_count($root->getPath(),"/") > 2) {
                $root = $root->getParent();
            }
        }
        $relativePath = $root->getRelativePath($link->getAssetPath());
        if (is_null($relativePath)) {
            return FALSE;
        }
        return $root->nodeExists($relativePath);
    }

    /**
     * get real file path of an asset: the data file itself, else the target of
     * its link file (read once), else "unknown"
     */
    public function getAssetRealPath($assetPath) {
        return self::resolveAssetPath($this->albumNode, $assetPath);
    }

    /**
     * resolve the real path of an album asset without loading album.json
     * (issue #50: the preview and asset endpoints used to parse the whole
     * album for every tile). Callers must pass a plain asset file name under
     * the data folder (see PreviewController).
     * A missing link target is reported by the caller's own lookup of the
     * returned path.
     * @param Folder $albumNode the album folder node
     * @param string $assetPath asset path relative to the album folder
     * @return string the real path, or "unknown" when the asset has neither a
     *                data file nor a link file
     */
    public static function resolveAssetPath(Folder $albumNode, $assetPath) {
        return Profiler::measure('link', function () use ($albumNode, $assetPath) {
            try {
                return $albumNode->get($assetPath)->getPath();
            } catch (NotFoundException $e) {
                //no data file, try the link file
            }
            try {
                $linkFile = $albumNode->get($assetPath . ".lnk");
            } catch (NotFoundException $e) {
                return "unknown";
            }
            $link = ($linkFile instanceof File) ? AssetLink::createFromFile($linkFile) : NULL;
            return is_null($link) ? "unknown" : $link->getAssetPath();
        });
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
                if ($element->isVideo()) {
                    //search only for video asset, preview image is generated, so not present elsewhere
                    $this->searchAssetAndLink($userFolder,$element->getContent("video"),$element->getContent("name"),$element->getContent("size"));
                } else {
                    foreach ($element->getAssets() as $asset) {
                        $this->searchAssetAndLink($userFolder,$asset,$element->getContent("name"),$element->getContent("size"));
                    }
                }
            }
        }
        return true;
    }

    public function getAssets() {
        $assets = array();
        foreach ($this->getPages() as $page) {
            foreach ($page->getElements() as $element) {
                foreach ($element->getAssets() as $asset) {
                    $assets[] = array("assetPath" => $asset);
                }
            }
        }
        return $assets;    
    }

    public function searchAssetAndLink($userFolder,$assetPath,$asset_name,$asset_size) {
        //if link exists, skip the search
        if ($this->hasAssetLink($assetPath)) {
            return TRUE;
        }
        if (is_null($asset_name) || $asset_name === "") {
            return FALSE;
        }
        if (is_null($asset_size) || $asset_size === 0) {
            return FALSE;
        }
        //if name and size look for similar file
        $nodesSameName = Profiler::measure('search', fn () => $userFolder->search($asset_name));
        foreach ($nodesSameName as $node) {
            //do not link if in an other album
            if (str_starts_with($node->getPath(),$this->albumNode->getParent()->getPath())) {
                continue;
            }
            if ($node->getSize() === $asset_size) {
                //compute link name
                $linkPath = $assetPath.".lnk";
                if ($this->albumNode->nodeExists($linkPath)) {
                    $linkFile = $this->albumNode->get($linkPath);
                } else {
                    $linkFile = $this->albumNode->newFile($linkPath);
                }
                //if asset exists, replace with link
                if ($this->albumNode->nodeExists($assetPath)) {
                    $assetNode = $this->albumNode->get($assetPath);
                    $link = AssetLink::createLinkFromAsset($linkFile,$assetNode, $node);
                    return TRUE;
                } else {
                    //just create link
                    $link = AssetLink::createLink($linkFile, $node);
                    return TRUE;
                }
            }
        }
        return FALSE;
    }

    public function getPath() {
        return $this->albumNode->getPath();
    }

    /**
     * save album conf file to disk
     */
    public function save() {
        Profiler::measure('save', fn () => $this->doSave());
    }

    private function doSave() {
        $json = json_encode($this->contentArray);
        //reuse the node read at load time (issue #50): no exists + get lookups
        $file = $this->confFile;
        if (is_null($file)) {
            try {
                $file = $this->albumNode->get(ALBUM_CONF_FILENAME);
            } catch (NotFoundException $e) {
                $file = $this->albumNode->newFile(ALBUM_CONF_FILENAME);
            }
        }
        $file->putContent($json);
        $this->confFile = ($file instanceof File) ? $file : null;
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
        return $albumArray;
    }

    public function setValues($valuesArray) {
        //structural keys managed through dedicated endpoints / immutable at creation
        $protectedKeys = array("pages", "id");
        if (is_array($valuesArray)) {
            foreach ($valuesArray as $key => $value) {
                if ((!is_null($value)) && (substr($key,0,1) !== "_")
                    && (!in_array($key, $protectedKeys, true))) {
                    $this->setContent($key,$value);
                }
            }
        }
    }
}