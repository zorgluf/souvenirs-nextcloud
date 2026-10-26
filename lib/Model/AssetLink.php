<?php
namespace OCA\Souvenirs\Model;

use OCP\Files\File;
use OCP\Files\Node;

class AssetLink {

    private $assetPath;
    private $assetSize;

    public function __construct($path = "",$size = 0) {
        $this->assetPath = $path;
        $this->assetSize = $size;
    }

    public static function createFromFile(File $assetLinkFile) {
        $assetLinkJson = json_decode($assetLinkFile->getContent());
        $assetLink = new self();
        //unreadable or incomplete link files are no link
        if (!is_object($assetLinkJson) || !isset($assetLinkJson->assetPath) || $assetLinkJson->assetPath == NULL) {
            return NULL;
        }
        $assetLink->setAssetPath($assetLinkJson->assetPath);
        if (!isset($assetLinkJson->assetSize) || $assetLinkJson->assetSize == NULL) {
            return NULL;
        }
        $assetLink->setAssetSize($assetLinkJson->assetSize);
        return $assetLink;
    }

    public static function createLinkFromAsset(File $link, File $asset, Node $targetFile) {
        //save assetlink
        $assetLink = AssetLink::createLink($link,$targetFile);
        //delete original asset
        $asset->delete();

        return $assetLink;
    }

    public static function createLink(File $link, Node $targetFile) {
        //create assetlink
        $assetLink = new self();
        $assetLink->setAssetPath($targetFile->getPath());
        $assetLink->setAssetSize($targetFile->getSize());
        //save assetlink
        $assetLink->saveToFile($link);

        return $assetLink;
    }

    public function getAssetPath() {
        return $this->assetPath;
    }
    public function setAssetPath($value) {
        $this->assetPath = $value;
    }
    public function getAssetSize() {
        return $this->assetSize;
    }
    public function setAssetSize($value) {
        $this->assetSize = $value;
    }

    public function saveToFile(File $file) {
        $file->putContent($this->toJson());
    }

    public function toJson() {
        return json_encode(array("assetPath"=> $this->getAssetPath(), "assetSize" => $this->getAssetSize() ));
    }

    /**
     * link file content pointing to $targetFile
     */
    public static function jsonFor(Node $targetFile) {
        return (new self($targetFile->getPath(), $targetFile->getSize()))->toJson();
    }

}