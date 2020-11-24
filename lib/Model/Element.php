<?php
namespace OCA\Souvenir\Model;

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

    public function toArray() {
        $elementArray = $this->contentArray;
        foreach ($elementArray as $key => $value) {
			if ((is_null($value)) && (substr($key,0,1) != "_")) {
				unset($elementArray[$key]);
			}
        }
        return $elementArray;
    }
}