<?php

declare(strict_types=1);

namespace OCA\Souvenirs\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

/**
 * Auto-generated migration step: Please modify to your needs!
 */
class Version0001Date20200102200208 extends SimpleMigrationStep {

	/**
	 * @param IOutput $output
	 * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
	 * @param array $options
	 */
	public function preSchemaChange(IOutput $output, Closure $schemaClosure, array $options) {
	}

	/**
	 * @param IOutput $output
	 * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
	 * @param array $options
	 * @return null|ISchemaWrapper
	 */
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options) {
		/** @var Schema $schema */
		$schema = $schemaClosure();

		$table = $schema->createTable('souvenirs_shares');

		$table->addColumn('token', 'string', [
			'notnull' => true,
				  'length' => 64,
		]);
		$table->addColumn('album_id', 'string', [
			'notnull' => true,
				'length' => 4000,
		]);
		$table->addColumn('valid_until', 'datetime', [
			'notnull' => false,
		]);
		$table->addColumn('user', 'string', [
			'notnull' => true,
				'length' => 64,
		]);

		$table->setPrimaryKey(['token']);

		return $schema;
	}

	/**
	 * @param IOutput $output
	 * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
	 * @param array $options
	 */
	public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options) {
	}
}
