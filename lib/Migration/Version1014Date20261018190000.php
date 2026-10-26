<?php

declare(strict_types=1);

namespace OCA\Souvenirs\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Index the album id -> path lookup (issue #50).
 *
 * Every apiv2 call coming from the Android app (and every edit-mode write
 * from the web editor) resolves its album with
 * AlbumMapper::findByAlbumId(user, album_id); without an index this is a full
 * scan of souvenirs_albums per request, which shows on a remote database.
 */
class Version1014Date20261018190000 extends SimpleMigrationStep {

	public const INDEX_NAME = 'souvenirs_albums_user_aid';

	/**
	 * @param IOutput $output
	 * @param Closure(): ISchemaWrapper $schemaClosure
	 * @param array $options
	 * @return null|ISchemaWrapper
	 */
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options) {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();
		if (!$schema->hasTable('souvenirs_albums')) {
			return null;
		}
		$table = $schema->getTable('souvenirs_albums');
		if ($table->hasIndex(self::INDEX_NAME)) {
			return null;
		}
		$table->addIndex(['user', 'album_id'], self::INDEX_NAME);
		return $schema;
	}
}
