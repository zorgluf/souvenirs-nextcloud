<?php

namespace OCA\Souvenirs\Db;

use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\AppFramework\Db\QBMapper;
use OCA\Souvenirs\Db\Album;

define("ALBUM_TABLE", 'souvenirs_albums');

class AlbumMapper extends QBMapper {

    public function __construct(IDBConnection $db) {
        parent::__construct($db, ALBUM_TABLE);
    }


    /**
     * @throws \OCP\AppFramework\Db\MultipleObjectsReturnedException if more than one result
     */
    public function findByAlbumId(string $user, string $albumId) {
        $qb = $this->db->getQueryBuilder();

        $qb->select('*')
           ->from(ALBUM_TABLE)
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
           ->from(ALBUM_TABLE)
           ->where(
               $qb->expr()->eq('user', $qb->createNamedParameter($user, IQueryBuilder::PARAM_STR))
           );
        
        return $this->findEntities($qb);
    }

    public function createAlbum(string $user, string $albumId, string $path, string $name) {

        //check if album exists
        $res = $this->findByAlbumId($user,$albumId);
        if (! is_null($res)) {
            return false;
        }

        //create new album
        $newAlbum = new Album();
        $newAlbum->setUser($user);
        $newAlbum->setAlbumId($albumId);
        $newAlbum->setPath($path);
        $newAlbum->setName($name);
        $this->insert($newAlbum);
        return true;
    }

    public function deleteAlbum(string $user, string $albumId) {

        //check if album exists
        $res = $this->findByAlbumId($user,$albumId);
        if (is_null($res)) {
            return false;
        }

        //delete record in db
        $qb = $this->db->getQueryBuilder();
        $qb->delete(ALBUM_TABLE)
            ->where(
                $qb->expr()->andX(
                    $qb->expr()->eq('album_id', $qb->createNamedParameter($albumId, IQueryBuilder::PARAM_STR)),
                    $qb->expr()->eq('user', $qb->createNamedParameter($user, IQueryBuilder::PARAM_STR))
                )
            );
        $qb->execute();
        return true;
    }


}