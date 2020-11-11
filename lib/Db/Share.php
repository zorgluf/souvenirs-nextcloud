<?php
// db/share.php

namespace OCA\Souvenir\Db;

use OCP\AppFramework\Db\Entity;

class Share extends Entity {

    protected $token;
    protected $validUntil;
    protected $user;
    protected $albumId;

    public function toArray() {
        return array('token' => $this->token, 'albumId' => $this->albumId, 'validUntil' => $this->validUntil, 'user' => $this->user);
    }

}

?>