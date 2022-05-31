<?php
namespace OCA\Souvenirs\Controller;

use OCP\IConfig;
use OCA\Souvenirs\Settings\AdminSettings;

class Utils {

    public static function getAlbumsNode(IConfig $config, $userId, $appName, $userFolder) {
        //get path settings
        $albumsPath = $config->getUserValue($userId, $appName, 'souvenirsPath', AdminSettings::DEFAULT_SETTINGS["souvenirsPath"]);
        if ($userFolder->nodeExists($albumsPath)) {
            return $userFolder->get($albumsPath);
        }
        //check for previous default dir /album for retro-compatibilty
		if ($userFolder->nodeExists("album")) {
			$config->setUserValue($userId, $appName, 'souvenirsPath', "/album");
            return $userFolder->get("album");
		}
        $userFolder->newFolder($albumsPath);
        return $userFolder->get($albumsPath);
	}

}