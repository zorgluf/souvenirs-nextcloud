<?php

declare(strict_types=1);

namespace OCA\Souvenirs\Service;

/**
 * Per-request timing accumulator (issue #50).
 *
 * Edit mode is slow on instances with a slow data folder (NFS) or a remote
 * database, and the costs are spread over several layers (album resolution,
 * album.json read/write, user-tree searches, link files). Each layer wraps its
 * work in Profiler::measure(), and TimingMiddleware turns the accumulated spans
 * into a `Server-Timing` response header, readable in the browser dev tools
 * and by tools/bench-apiv2.mjs.
 *
 * Static on purpose: one PHP request = one profile, and the model classes
 * (Album, AssetLink) are not built through the DI container.
 */
final class Profiler {

	/** @var array<string, array{count: int, ms: float}> */
	private static array $spans = [];

	public static function reset(): void {
		self::$spans = [];
	}

	/**
	 * Run $fn and account its wall time to the span $name.
	 *
	 * @template T
	 * @param callable(): T $fn
	 * @return T
	 */
	public static function measure(string $name, callable $fn) {
		$start = hrtime(true);
		try {
			return $fn();
		} finally {
			self::add($name, (hrtime(true) - $start) / 1e6);
		}
	}

	public static function add(string $name, float $ms): void {
		if (!isset(self::$spans[$name])) {
			self::$spans[$name] = ['count' => 0, 'ms' => 0.0];
		}
		self::$spans[$name]['count']++;
		self::$spans[$name]['ms'] += $ms;
	}

	/**
	 * @return array<string, array{count: int, ms: float}>
	 */
	public static function spans(): array {
		return self::$spans;
	}

	/**
	 * Format the spans plus the total controller time as a Server-Timing value,
	 * e.g. `load;dur=41.2;desc="1x", save;dur=80.3;desc="1x", total;dur=130.9`.
	 */
	public static function serverTimingHeader(float $totalMs): string {
		$parts = [];
		foreach (self::$spans as $name => $span) {
			$parts[] = sprintf('%s;dur=%.1f;desc="%dx"', $name, $span['ms'], $span['count']);
		}
		$parts[] = sprintf('total;dur=%.1f', $totalMs);
		return implode(', ', $parts);
	}
}
