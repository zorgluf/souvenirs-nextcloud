<?php
// db/share.php

namespace OCA\Souvenirs\Db;

use OCP\AppFramework\Db\Entity;

class Album extends Entity {

    protected $name;
    protected $albumId;
    protected $path;
    protected $user;

    public function toArray() {
        return array('name' => $this->name, 'albumId' => $this->albumId, 'path' => $this->path, 'user' => $this->user);
    }

}

?>