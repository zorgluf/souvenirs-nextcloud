<?php
namespace OCA\Souvenirs\Model;

class Element {

    private $contentArray;

    public function __construct($content) {
        $this->contentArray = $content;
    }

    public function getContent($name) {
        if (array_key_exists($name, $this->contentArray)) {
            return $this->contentArray[$name];
        } else {
            return NULL;
        }
    }
    public function setContent($name,$value) {
        $this->contentArray[$name] = $value;
    }

    public function getImage() {
        return $this->getContent("image");
    }

    public function isVideo() {
        $class = $this->getContent("class");
        if ($class === "VideoElement") {
            return TRUE;
        }
        return FALSE;
    }

    public function getAssets() {
        $assets = array();
        $asset_image = $this->getContent("image");
        if (($asset_image !== NULL) && ($asset_image !== "")) {
            array_push($assets,$asset_image);
        }
        $asset_audio = $this->getContent("audio");
        if (($asset_audio !== NULL) && ($asset_audio !== "")) {
            array_push($assets,$asset_audio);
        }
        $asset_video = $this->getContent("video");
        if (($asset_video !== NULL) && ($asset_video !== "")) {
            array_push($assets,$asset_video);
        }
        return $assets;
    }

    public function toArray() {
        $elementArray = $this->contentArray;
        foreach ($elementArray as $key => $value) {
			if ((is_null($value)) && (substr($key,0,1) !== "_")) {
				unset($elementArray[$key]);
			}
        }
        return $elementArray;
    }
}