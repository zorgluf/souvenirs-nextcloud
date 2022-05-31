<?php

namespace OCA\Souvenirs\Settings;

use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Settings\IIconSection;

class AdminSection implements IIconSection
{
    private $l;
    private $url;

    public function __construct(IURLGenerator $url, IL10N $l)
    {
        $this->url = $url;
        $this->l = $l;
    }

    /**
     * @return string
     */
    public function getID()
    {
        return 'souvenirs';
    }

    public function getName()
    {
        return 'Souvenirs';
    }

    public function getPriority()
    {
        return 90;
    }

    /**
     * @return string
     */
    public function getIcon()
    {
        return $this->url->imagePath('souvenirs', 'icon.svg');
    }
}