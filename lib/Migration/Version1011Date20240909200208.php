<?php

declare(strict_types=1);

namespace OCA\Souvenirs\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

/**
 * Auto-generated migration step: Please modify to your needs!
 */
class Version1011Date20240909200208 extends SimpleMigrationStep {

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

		$table = $schema->createTable('souvenirs_albums');

		$table->addColumn('id', Types::BIGINT, [
			'autoincrement' => true,
			'notnull' => true,
			'length' => 20,
			'unsigned' => true,
		]);
		$table->addColumn('path', 'string', [
			'notnull' => true,
			'length' => 256,
		]);
		$table->addColumn('albumId', 'string', [
			'notnull' => true,
			'length' => 64,
		]);
		$table->addColumn('name', 'string', [
			'notnull' => false,
			'length' => 256,
		]);
		$table->addColumn('user', 'string', [
			'notnull' => true,
			'length' => 64,
		]);

		$table->setPrimaryKey(['id']);

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
