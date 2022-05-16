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
        $assetLink->setAssetPath($assetLinkJson->assetPath);
        $assetLink->setAssetSize($assetLinkJson->assetSize);
        return $assetLink;
    }

    public static function replaceAssetWithLink(File $asset, Node $targetFile) {
        //create assetlink
        $assetLink = new self();
        $assetLink->setAssetPath($targetFile->getPath());
        $assetLink->setAssetSize($targetFile->getSize());
        //save assetlink
        $linkName = $asset->getName().".lnk";
        if ($asset->getParent()->nodeExists($linkName)) {
            $file = $asset->getParent()->get($linkName);
        } else {
            $file = $asset->getParent()->newFile($linkName);
        }
        $assetLink->saveToFile($file);
        //delete original asset
        $asset->delete();
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
        $json = json_encode(array("assetPath"=> $this->getAssetPath(), "assetSize" => $this->getAssetSize() ));
        $file->putContent($json);
    }

}