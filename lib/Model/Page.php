<?php
namespace OCA\Souvenirs\Model;

use OCA\Souvenirs\Model\Element;

class Page {

    private $contentArray;

    public function __construct($content) {
        $this->contentArray = $content;
    }

    public function getId() {
        return $this->getContent("id");
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

    /**
     * stamp the page with the current edit date (format YmdHis),
     * overwriting any existing value, and return it
     */
    public function setLastEditDate() {
        $lastEditDate = date('YmdHis');
        $this->setContent("lastEditDate",$lastEditDate);
        return $lastEditDate;
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

    public function getElements() {
        if (is_array($this->getContent("elements"))) {
            $elements = array();
            foreach($this->getContent("elements") as $elementArray) {
                $elements[] = new Element($elementArray);
            }
            return $elements;
        }
        return array();
    }

    public function setElements($elements) {
        $out = array();
        foreach($elements as $element) {
            $out[] = $element->toArray();
        }
        $this->setContent("elements",$out);
    }

    public function toArray() {
        $pageArray = $this->contentArray;
        foreach ($pageArray as $key => $value) {
			if ((is_null($value)) || (substr($key,0,1) === "_")) {
				unset($pageArray[$key]);
			}
        }
        return $pageArray;
    }

}