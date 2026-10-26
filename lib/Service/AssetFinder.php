<?php

declare(strict_types=1);

namespace OCA\Souvenirs\Service;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Search\ISearchBinaryOperator;
use OCP\Files\Search\ISearchComparison;

/**
 * Finds the user's files that have exactly a given name and size: the
 * candidates an album asset can be replaced with a link to (issue #50).
 *
 * Folder::search(string) is a "name contains" (LIKE '%name%') query over the
 * whole file cache of the user, which cannot use an index and returns every
 * partial match. When the server classes are available (Nextcloud 31+, which
 * this app requires) the search is built as name = ? AND size = ?, which the
 * file cache answers from its name index; otherwise it falls back to the
 * plain string search. Either way the result is filtered again here, so the
 * contract does not depend on the database collation.
 */
class AssetFinder {

	/**
	 * @return File[] files named exactly $name, $size bytes long
	 */
	public function find(Folder $userFolder, string $name, int $size): array {
		return Profiler::measure('search', function () use ($userFolder, $name, $size) {
			$nodes = $this->exactSearch($userFolder, $name, $size);
			if ($nodes === null) {
				$nodes = $userFolder->search($name);
			}
			return array_values(array_filter($nodes, function ($node) use ($name, $size) {
				return ($node instanceof File)
					&& ($node->getName() === $name)
					&& ($node->getSize() === $size);
			}));
		});
	}

	/**
	 * @return array|null the nodes, or null when the query cannot be built
	 *                    (server classes missing or rejecting it)
	 */
	private function exactSearch(Folder $userFolder, string $name, int $size): ?array {
		$queryClass = '\OC\Files\Search\SearchQuery';
		$comparisonClass = '\OC\Files\Search\SearchComparison';
		$operatorClass = '\OC\Files\Search\SearchBinaryOperator';
		if (!class_exists($queryClass) || !class_exists($comparisonClass) || !class_exists($operatorClass)) {
			return null;
		}
		try {
			$operator = new $operatorClass(ISearchBinaryOperator::OPERATOR_AND, [
				new $comparisonClass(ISearchComparison::COMPARE_EQUAL, 'name', $name),
				new $comparisonClass(ISearchComparison::COMPARE_EQUAL, 'size', $size),
			]);
			$query = new $queryClass($operator, 0, 0, [], $userFolder->getOwner());
			return $userFolder->search($query);
		} catch (\Throwable $e) {
			return null;
		}
	}
}
