<?php
// db/share.php

namespace OCA\Souvenirs\Db;

use OCP\AppFramework\Db\Entity;
use OCP\DB\Types;

class Share extends Entity {

    protected $token;
    protected $validUntil;
    protected $user;
    protected $albumId;

    public function __construct() {
        $this->addType('validUntil', Types::DATETIME);
    }

    public function toArray() {
        return array(
            'token' => $this->token,
            'albumId' => $this->albumId,
            'validUntil' => is_null($this->validUntil) ? null : $this->validUntil->format(\DateTime::ATOM),
            'user' => $this->user,
        );
    }

}

?>