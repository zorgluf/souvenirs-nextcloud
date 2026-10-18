<?php

declare(strict_types=1);

namespace OCA\Souvenirs\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

/**
 * Speed up the album id -> path lookups (issue #50): every edit-mode API
 * call resolves an album from its (user, album_id) pair, so give that pair
 * its own index instead of a full table scan per request.
 */
class Version1014Date20261018120000 extends SimpleMigrationStep {

	/**
	 * @param IOutput $output
	 * @param Closure $schemaClosure The \Closure returns an ISchemaWrapper
	 * @param array $options
	 */
	public function preSchemaChange(IOutput $output, Closure $schemaClosure, array $options) {
	}

	/**
	 * @param IOutput $output
	 * @param Closure $schemaClosure The \Closure returns an ISchemaWrapper
	 * @param array $options
	 * @return null|ISchemaWrapper
	 */
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options) {
		/** @var Schema $schema */
		$schema = $schemaClosure();

		$table = $schema->getTable('souvenirs_albums');

		if (!$table->hasIndex('souvenirs_albums_user_album')) {
			$table->addIndex(['user', 'album_id'], 'souvenirs_albums_user_album');
		}

		return $schema;
	}

	/**
	 * @param IOutput $output
	 * @param Closure $schemaClosure The \Closure returns an ISchemaWrapper
	 * @param array $options
	 */
	public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options) {
	}
}
