<?php
// db/sharemapper.php

namespace OCA\Souvenirs\Db;

use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\AppFramework\Db\QBMapper;
use OCP\Security\ISecureRandom;
use OCA\Souvenirs\Db\Share;

define("SHARE_TABLE", 'souvenirs_shares');

class ShareMapper extends QBMapper {

    private $secureRandom;

    public function __construct(IDBConnection $db, ISecureRandom $secureRandom) {
        parent::__construct($db, SHARE_TABLE);
        $this->secureRandom = $secureRandom;
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

    public function createShare(string $user, string $albumId, ?\DateTime $validUntil = null) {

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
        $newShare->setValidUntil($validUntil ?? new \DateTime('+3 months'));
        $this->insert($newShare);
        return array('action' => 'success', 'share' => $newShare->toArray());
    }

    /**
     * Delete every share whose expiration date has passed.
     * Shares with a NULL valid_until never expire.
     */
    public function deleteExpired(\DateTime $now): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete(SHARE_TABLE)
            ->where(
                $qb->expr()->andX(
                    $qb->expr()->isNotNull('valid_until'),
                    $qb->expr()->lt('valid_until', $qb->createNamedParameter($now, IQueryBuilder::PARAM_DATETIME_MUTABLE))
                )
            );
        $qb->executeStatement();
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
        $qb->executeStatement();
        return array("action" => 'success');
    }

    private function generateRandomString($length = 10) {
        //use Nextcloud's cryptographically secure RNG for share tokens
        return $this->secureRandom->generate($length, ISecureRandom::CHAR_ALPHANUMERIC);
    }

}