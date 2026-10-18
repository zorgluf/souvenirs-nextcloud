<?php
namespace OCA\Souvenirs\Model;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCA\Souvenirs\Model\Page;
use OCA\Souvenirs\Model\AssetLink;
use OCA\Souvenirs\Model\AlbumList;
use OCA\Souvenirs\Service\AssetFinder;
use OCA\Souvenirs\Service\Profiler;

define("ALBUM_CONF_FILENAME","album.json");
define("DATA_DIR","data");
//sidecar of the duplicate search done by cleanAssets (issue #50)
define("ASSET_CHECKS_FILENAME",".souvenirs-assets-checked.json");

class Album {

    /** data files younger than this are never garbage-collected (in-flight uploads) */
    const ORPHAN_GRACE_SECONDS = 600;
    /** an asset is searched for duplicates again after this delay */
    const DUPLICATE_CHECK_TTL_SECONDS = 7 * 86400;

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

    /**
     * Garbage-collect the album data folder and replace assets with links to
     * identical user files (issue #50). Returns true.
     *
     * - The data folder is listed once; orphan detection and link lookups
     *   use that listing instead of one lookup per asset.
     * - Files written less than ORPHAN_GRACE_SECONDS ago are never deleted:
     *   an upload (or a link created by assetsearch) lands before the page
     *   referencing it is saved, and a clean running in between must not
     *   remove it. This is what makes a background clean safe.
     * - Every asset processed by the duplicate search is remembered, whatever
     *   the outcome, in ASSET_CHECKS_FILENAME; it is processed again only
     *   when its size changes or after DUPLICATE_CHECK_TTL_SECONDS.
     *
     * @param Folder $userFolder the user files root
     */
    public function cleanAssets($userFolder, $finder = null) {
        $listing = $this->listDataFolder();
        if (is_null($listing)) {
            //no data folder: nothing to clean nor to link
            return true;
        }
        $listing = $this->cleanOrphanAssets($listing);
        $this->linkDuplicatedAssets($userFolder, $listing, $finder ?? new AssetFinder());
        return true;
    }

    /**
     * @return array<string, Node>|null data folder entries by name, or null
     *                                   when the album has no data folder
     */
    private function listDataFolder() {
        try {
            $dataFolder = $this->albumNode->get(DATA_DIR);
        } catch (NotFoundException $e) {
            return NULL;
        }
        if (!($dataFolder instanceof Folder)) {
            return NULL;
        }
        $listing = array();
        foreach ($dataFolder->getDirectoryListing() as $node) {
            $listing[$node->getName()] = $node;
        }
        return $listing;
    }

    /**
     * basenames of every asset referenced by the pages, plus the album image
     * @return array<string, true>
     */
    private function referencedAssetNames() {
        $names = array();
        foreach ($this->getPages() as $page) {
            foreach ($page->getElements() as $element) {
                foreach ($element->getAssets() as $asset) {
                    $names[basename($asset)] = true;
                }
            }
        }
        if (!is_null($this->getAlbumImage()) && $this->getAlbumImage() !== "") {
            $names[basename($this->getAlbumImage())] = true;
        }
        return $names;
    }

    /**
     * same rule as before issue #50: a data file is in use when its name
     * starts with the name of a referenced asset (e.g. "x.jpg" and
     * "x.jpg.lnk" for the asset "data/x.jpg")
     */
    private static function isReferenced($name, array $referenced) {
        if (isset($referenced[$name])) {
            return true;
        }
        if (str_ends_with($name, ".lnk") && isset($referenced[substr($name, 0, -4)])) {
            return true;
        }
        foreach ($referenced as $assetName => $unused) {
            if (str_starts_with($name, $assetName)) {
                return true;
            }
        }
        return false;
    }

    private static function isRecent(Node $node) {
        $written = max((int)$node->getMTime(), (int)$node->getUploadTime());
        return $written > (time() - self::ORPHAN_GRACE_SECONDS);
    }

    /**
     * delete the data files no longer referenced by the album, except recent
     * ones (see cleanAssets)
     * @param array<string, Node> $listing
     * @return array<string, Node> the listing without the deleted entries
     */
    private function cleanOrphanAssets(array $listing) {
        $referenced = $this->referencedAssetNames();
        foreach ($listing as $name => $node) {
            if (!($node instanceof File) || self::isReferenced($name, $referenced) || self::isRecent($node)) {
                continue;
            }
            $node->delete();
            unset($listing[$name]);
        }
        return $listing;
    }

    /**
     * replace assets with links to identical user files, at most once per
     * asset per DUPLICATE_CHECK_TTL_SECONDS (see cleanAssets)
     * @param array<string, Node> $listing data folder entries by name
     */
    private function linkDuplicatedAssets($userFolder, array $listing, AssetFinder $finder) {
        $checks = $this->loadAssetChecks();
        $now = time();
        $changed = false;
        $seen = array();
        foreach ($this->getPages() as $page) {
            foreach ($page->getElements() as $element) {
                //videos: only the video file, the poster image is generated
                $assets = $element->isVideo() ? array($element->getContent("video")) : $element->getAssets();
                $name = $element->getContent("name");
                $size = $element->getContent("size");
                foreach ($assets as $asset) {
                    if (is_null($asset) || $asset === "") {
                        continue;
                    }
                    $seen[$asset] = true;
                    $check = $checks[$asset] ?? null;
                    if (is_array($check) && ($check["size"] ?? null) === $size
                        && (int)($check["at"] ?? 0) > ($now - self::DUPLICATE_CHECK_TTL_SECONDS)) {
                        continue;
                    }
                    $this->checkAssetDuplicate($userFolder, $finder, $asset, $name, $size, $listing);
                    $checks[$asset] = array("size" => $size, "at" => $now);
                    $changed = true;
                }
            }
        }
        //forget assets no longer in the album
        foreach (array_keys($checks) as $asset) {
            if (!isset($seen[$asset])) {
                unset($checks[$asset]);
                $changed = true;
            }
        }
        if ($changed) {
            $this->saveAssetChecks($checks);
        }
    }

    /**
     * one asset of cleanAssets: keep a valid link, else link the asset to an
     * identical user file when there is one
     */
    private function checkAssetDuplicate($userFolder, AssetFinder $finder, $asset, $name, $size, array $listing) {
        $inData = (dirname($asset) === DATA_DIR);
        $baseName = basename($asset);
        $linkNode = $inData ? ($listing[$baseName . ".lnk"] ?? null) : null;
        if ($linkNode instanceof File || !$inData) {
            $link = $this->getAssetLink($asset);
            if (!is_null($link) && $this->linkTargetExists($link, $userFolder)) {
                return;
            }
        }
        //sizes written as numeric strings by some clients count too
        $size = is_numeric($size) ? (int)$size : 0;
        if (is_null($name) || $name === "" || $size === 0) {
            return;
        }
        $assetNode = $inData ? ($listing[$baseName] ?? null) : $this->getAssetNode($asset);
        foreach ($finder->find($userFolder, $name, $size) as $candidate) {
            if ($this->isLinkableSource($candidate)) {
                $this->linkAsset($asset, $candidate, $linkNode, $assetNode);
                return;
            }
        }
    }

    /**
     * a user file can back an album asset unless it lives in the albums
     * folder itself (it could be removed with its album)
     */
    private function isLinkableSource(Node $node) {
        $albumsRoot = dirname($this->albumNode->getPath());
        return ($node instanceof File) && !str_starts_with($node->getPath(), $albumsRoot . "/");
    }

    /**
     * point $assetPath to $target with a link file, replacing a data file of
     * the same asset (now redundant) if there is one
     * @param Node|null $linkNode existing link file node, when already known
     * @param Node|null $assetNode existing data file node, when already known
     */
    private function linkAsset($assetPath, Node $target, $linkNode = null, $assetNode = null) {
        $json = AssetLink::jsonFor($target);
        if ($linkNode instanceof File) {
            $linkNode->putContent($json);
        } else {
            //creates or overwrites the link file in one write
            $this->albumNode->newFile($assetPath . ".lnk", $json);
        }
        if ($assetNode instanceof File) {
            $assetNode->delete();
        }
    }

    /**
     * link $assetPath to the user file the client picked, given by its path
     * relative to the user root: no search at all (issue #50). Rejected when
     * the file is missing, is not a file, lives in the albums folder, or does
     * not have the expected size.
     * The asset path must be a new one (no data file to replace), as built
     * by the editor when adding media.
     * @return bool true when the link was created
     */
    public function linkAssetToSource($userFolder, $assetPath, $sourcePath, $expectedSize = null) {
        try {
            $source = $userFolder->get($sourcePath);
        } catch (NotFoundException $e) {
            return FALSE;
        }
        if (!$this->isLinkableSource($source)) {
            return FALSE;
        }
        if (!is_null($expectedSize) && (int)$expectedSize !== $source->getSize()) {
            return FALSE;
        }
        $this->linkAsset($assetPath, $source);
        return TRUE;
    }

    /**
     * Apply a list of page operations in order, as one album change
     * (issue #50: the batch endpoint, one album.json read and write for e.g.
     * a cross-page move or N added media). Same semantics as the single
     * page endpoints:
     *   ["op" => "update", "page" => [...]]            postPage (fields merged)
     *   ["op" => "create", "pos" => int, "page" => [...]] createPage
     *   ["op" => "delete", "id" => string]              DeletePage
     *   ["op" => "move", "id" => string, "pos" => int]  movePage
     * Nothing is applied unless every operation is valid: the caller saves
     * only on success.
     * @return array{results: array, pageLastEditDate: ?string}
     * @throws \InvalidArgumentException on a malformed operation
     * @throws \OutOfBoundsException when a page does not exist
     */
    public function applyPageOperations(array $operations) {
        $results = array();
        $pagesChanged = false;
        foreach (array_values($operations) as $i => $operation) {
            $type = is_array($operation) ? ($operation["op"] ?? null) : null;
            switch ($type) {
                case "update":
                    $values = self::pageArrayOf($operation, $i);
                    $page = $this->getPage($values["id"]);
                    if (is_null($page)) {
                        throw new \OutOfBoundsException("operation $i: unknown page");
                    }
                    unset($values["id"]);
                    $page->setValues($values);
                    $lastEditDate = $page->setLastEditDate();
                    $this->updatePage($page);
                    $results[] = array("lastEditDate" => $lastEditDate);
                    break;
                case "create":
                    $values = self::pageArrayOf($operation, $i);
                    if (!is_null($this->getPage($values["id"]))) {
                        throw new \InvalidArgumentException("operation $i: page already exists");
                    }
                    $page = new Page($values);
                    $lastEditDate = $page->setLastEditDate();
                    $this->insertPage($page, self::posOf($operation, $i));
                    $pagesChanged = true;
                    $results[] = array("lastEditDate" => $lastEditDate);
                    break;
                case "delete":
                    if (!$this->deletePage(self::idOf($operation, $i))) {
                        throw new \OutOfBoundsException("operation $i: unknown page");
                    }
                    $pagesChanged = true;
                    $results[] = array();
                    break;
                case "move":
                    $page = $this->getPage(self::idOf($operation, $i));
                    if (is_null($page)) {
                        throw new \OutOfBoundsException("operation $i: unknown page");
                    }
                    $this->movePage($page, self::posOf($operation, $i));
                    $pagesChanged = true;
                    $results[] = array();
                    break;
                default:
                    throw new \InvalidArgumentException("operation $i: unknown op");
            }
        }
        return array(
            "results" => $results,
            "pageLastEditDate" => $pagesChanged ? $this->setPageLastEditDate() : NULL,
        );
    }

    private static function pageArrayOf($operation, $i) {
        $page = $operation["page"] ?? null;
        if (!is_array($page) || !isset($page["id"]) || !is_string($page["id"]) || $page["id"] === "") {
            throw new \InvalidArgumentException("operation $i: page with an id expected");
        }
        return $page;
    }

    private static function idOf($operation, $i) {
        $id = $operation["id"] ?? null;
        if (!is_string($id) || $id === "") {
            throw new \InvalidArgumentException("operation $i: page id expected");
        }
        return $id;
    }

    private static function posOf($operation, $i) {
        $pos = $operation["pos"] ?? null;
        if (!is_int($pos) && !(is_string($pos) && ctype_digit($pos))) {
            throw new \InvalidArgumentException("operation $i: position expected");
        }
        return max(0, (int)$pos);
    }

    /**
     * @return array<string, array{size: mixed, at: int}>
     */
    private function loadAssetChecks() {
        try {
            $checks = json_decode($this->albumNode->get(ASSET_CHECKS_FILENAME)->getContent(), true);
        } catch (NotFoundException $e) {
            return array();
        }
        return is_array($checks) ? $checks : array();
    }

    private function saveAssetChecks(array $checks) {
        $json = json_encode((object)$checks);
        try {
            $file = $this->albumNode->get(ASSET_CHECKS_FILENAME);
        } catch (NotFoundException $e) {
            $file = $this->albumNode->newFile(ASSET_CHECKS_FILENAME);
        }
        $file->putContent($json);
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

    /**
     * link $assetPath to a user file with the same name and size (the
     * assetsearch endpoint, used when picking existing media)
     * @return bool true when the asset is (now) linked
     */
    public function searchAssetAndLink($userFolder,$assetPath,$asset_name,$asset_size,$finder = null) {
        //if a valid link exists, skip the search
        if ($this->hasAssetLink($assetPath, $userFolder)) {
            return TRUE;
        }
        if (is_null($asset_name) || $asset_name === "") {
            return FALSE;
        }
        if (is_null($asset_size) || $asset_size === 0) {
            return FALSE;
        }
        $finder = $finder ?? new AssetFinder();
        foreach ($finder->find($userFolder, (string)$asset_name, (int)$asset_size) as $node) {
            //do not link to a file of an album
            if ($this->isLinkableSource($node)) {
                $this->linkAsset($assetPath, $node, null, $this->getAssetNode($assetPath));
                return TRUE;
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