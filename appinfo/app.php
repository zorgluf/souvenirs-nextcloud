<?php

namespace OCA\souvenir\AppInfo;

use OC\Files\Type\Detection;
use OCP\AppFramework\App;
use OCA\Keeweb\Controller\PageController;

// Script for registering file actions
$eventDispatcher = \OC::$server->getEventDispatcher();
$eventDispatcher->addListener(
	'OCA\Files::loadAdditionalScripts',
	function() {
		\OCP\Util::addScript('souvenir', 'fileaction');
	}
);