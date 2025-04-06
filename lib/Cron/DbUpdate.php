<?php
namespace OCA\Souvenirs\Cron;

use OCP\BackgroundJob\TimedJob;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IUserManager;
use OCP\IUser;
use OCP\Files\IRootFolder;
use OCA\Souvenirs\Controller\Utils;
use OCA\Souvenirs\Model\AlbumList;
use OCA\Souvenirs\Db\AlbumMapper;
use OCP\IConfig;

class DbUpdate extends TimedJob {

    private IUserManager $userManager;
    private IRootFolder $rootFolder;
    private AlbumMapper $albumMapper;

    public function __construct(ITimeFactory $time, IUserManager $userManager, IRootFolder $rootFolder, IConfig $config, AlbumMapper $albumMapper) {
        parent::__construct($time);

        // Run once a day
        //$this->setInterval(60);
        $this->setInterval(3600*24);
        $this->userManager = $userManager;
        $this->rootFolder = $rootFolder;
        $this->config = $config;
        $this->albumMapper = $albumMapper;
    }

    protected function run($arguments) {

        //for all users
        $this->userManager->callForSeenUsers(function (IUser $user): void {
			$uid = $user->getUID();
			$this->updateSouvenirsDb($uid);
		});
    }

    private function updateSouvenirsDb($user) {

        $userFolder = $this->rootFolder->getUserFolder($user);
        $albumsFolder = Utils::getAlbumsNode($this->config, $user, "souvenirs", $userFolder);
		$albumList = AlbumList::getInstance($albumsFolder);

        $arrayAlbum = $albumList->getList();
        $albumListInDb = $this->albumMapper->findAllByUser($user);
        //add missing albums
        foreach ($arrayAlbum as $album) {
            $found = false;
            foreach ($albumListInDb as $albumDb) {
                if ($album['id'] === $albumDb->getAlbumId()) {
                    $found = true;
                    #check if date is ok
                    if ($album['date'] !== $albumDb->getDate()) {
                        $this->albumMapper->setDate($user, $album['id'], $album['date']);
                    }
                    break;
                }
            }
            if ($found === false) {
                //add album to db
                $this->albumMapper->createAlbum($user, $album['id'], $album['path'], $album['name'], $album['date']);
            }
        }
        //remove destroyed albums
        foreach ($albumListInDb as $albumDb) {
            $found = false;
            foreach ($arrayAlbum as $album) {
                if ($album['id'] === $albumDb->getAlbumId()) {
                    $found = true;
                    //update title
                    $name = $album['name'];
                    if ($name != NULL) {
                        $albumDb->setName($name);
                        $this->albumMapper->update($albumDb);
                    }
                    break;
                }
            }
            if ($found === false) {
                //remove album from db
                $this->albumMapper->deleteAlbum($user, $albumDb->getAlbumId());
            }
        }
    }

}