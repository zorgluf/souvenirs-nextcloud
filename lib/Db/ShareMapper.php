<?php
// db/sharemapper.php

namespace OCA\Souvenirs\Db;

use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\AppFramework\Db\QBMapper;
use OCA\Souvenirs\Db\Share;

define("SHARE_TABLE", 'souvenir_shares');

class ShareMapper extends QBMapper {

    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'souvenir_shares');
    }


    /**
     * @throws \OCP\AppFramework\Db\MultipleObjectsReturnedException if more than one result
     */
    public function findByAlbumId(string $user, string $albumId) {
        $qb = $this->db->getQueryBuilder();

        $qb->select('*')
           ->from(SHARE_TABLE)
           ->where(
                $qb->expr()->andX(
                    $qb->expr()->eq('album_id', $qb->createNamedParameter($albumId, IQueryBuilder::PARAM_STR)),
                    $qb->expr()->eq('user', $qb->createNamedParameter($user, IQueryBuilder::PARAM_STR))
                )
           );

        try {
            return $this->findEntity($qb);
        } catch (\OCP\AppFramework\Db\DoesNotExistException $e) {
            return NULL;
        }        
    }

    public function findAllByUser(string $user) {
        $qb = $this->db->getQueryBuilder();

        $qb->select('*')
           ->from(SHARE_TABLE)
           ->where(
               $qb->expr()->eq('user', $qb->createNamedParameter($user, IQueryBuilder::PARAM_STR))
           );
        
        return $this->findEntities($qb);
    }

    public function findByToken(string $token) {
        $qb = $this->db->getQueryBuilder();

        $qb->select('*')
           ->from(SHARE_TABLE)
           ->where(
                $qb->expr()->eq('token', $qb->createNamedParameter($token, IQueryBuilder::PARAM_STR))
           );

        try {
            return $this->findEntity($qb);
        } catch (\OCP\AppFramework\Db\DoesNotExistException $e) {
            return NULL;
        } catch (\OCP\AppFramework\Db\MultipleObjectsReturnedException $e) {
            return NULL;
        } 
    }

    public function createShare(string $user, string $albumId) {

        //check if share exists
        $res = $this->findByAlbumId($user,$albumId);
        if (! is_null($res)) {
            return array("action" => 'success', 'share' => $res->toArray());
        }

        //create new share
        $newShare = new Share();
        $newToken = $this->generateRandomString(64);
        $newShare->setToken($newToken);
        $newShare->setUser($user);
        $newShare->setAlbumId($albumId);
        $this->insert($newShare);
        return array('action' => 'success', 'share' => $newShare->toArray());
    }

    public function deleteShare(string $user, string $albumId) {

        //check if share exists
        $res = $this->findByAlbumId($user,$albumId);
        if (is_null($res)) {
            return array("action" => 'failure', 'error' => 'Album not found');
        }

        //delete record in db
        $qb = $this->db->getQueryBuilder();
        $qb->delete(SHARE_TABLE)
            ->where(
                $qb->expr()->andX(
                    $qb->expr()->eq('album_id', $qb->createNamedParameter($albumId, IQueryBuilder::PARAM_STR)),
                    $qb->expr()->eq('user', $qb->createNamedParameter($user, IQueryBuilder::PARAM_STR))
                )
            );
        $qb->execute();
        return array("action" => 'success');
    }

    private function generateRandomString($length = 10) {
        $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $charactersLength = strlen($characters);
        $randomString = '';
        for ($i = 0; $i < $length; $i++) {
            $randomString .= $characters[rand(0, $charactersLength - 1)];
        }
        return $randomString;
    }

}