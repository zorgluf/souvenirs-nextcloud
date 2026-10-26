<?php

namespace OCA\Souvenirs\Tests\Unit\Support;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\TestCase;

/**
 * In-memory stand-in for the Nextcloud files API, built from PHPUnit mocks of
 * the OCP\Files interfaces (issue #50).
 *
 * The model classes only see OCP\Files\Folder / File nodes; this fake keeps a
 * flat map of absolute paths and answers the calls the app makes (get,
 * nodeExists, newFile, getDirectoryListing, search, getContent, putContent,
 * delete, ...). Every call is counted, so tests can pin how many storage
 * round trips an operation costs - the metric that matters on a slow data
 * folder or a remote database.
 */
class FakeFs {

	/** @var array<string, array{content: string, mtime: int, upload: int, size: ?int}> */
	private array $files = [];
	/** @var array<string, true> */
	private array $folders = [];
	/** @var array<string, int> */
	public array $calls = [];

	public function __construct(
		private TestCase $test,
	) {
	}

	// --- setup -------------------------------------------------------------------

	public function addFolder(string $path): Folder {
		$path = self::norm($path);
		$parts = explode('/', trim($path, '/'));
		$current = '';
		foreach ($parts as $part) {
			$current .= '/' . $part;
			$this->folders[$current] = true;
		}
		return $this->folder($path);
	}

	/**
	 * @param int|null $size reported size when it must differ from strlen($content)
	 * @param int $age seconds since the file was written
	 */
	public function addFile(string $path, string $content = '', ?int $size = null, int $age = 86400): File {
		$path = self::norm($path);
		$this->addFolder(dirname($path));
		$time = time() - $age;
		$this->files[$path] = ['content' => $content, 'mtime' => $time, 'upload' => $time, 'size' => $size];
		return $this->file($path);
	}

	public function exists(string $path): bool {
		$path = self::norm($path);
		return isset($this->files[$path]) || isset($this->folders[$path]);
	}

	public function content(string $path): ?string {
		$path = self::norm($path);
		return $this->files[$path]['content'] ?? null;
	}

	/** @return string[] absolute paths of every file */
	public function filePaths(): array {
		return array_keys($this->files);
	}

	public function resetCalls(): void {
		$this->calls = [];
	}

	public function count(string $call): int {
		return $this->calls[$call] ?? 0;
	}

	// --- internals ---------------------------------------------------------------------

	private function hit(string $call): void {
		$this->calls[$call] = ($this->calls[$call] ?? 0) + 1;
	}

	private static function norm(string $path): string {
		$path = '/' . trim(preg_replace('#/+#', '/', $path), '/');
		return $path;
	}

	private function join(string $base, string $relative): string {
		return self::norm($base . '/' . $relative);
	}

	public function node(string $path): Node {
		$path = self::norm($path);
		if (isset($this->files[$path])) {
			return $this->file($path);
		}
		if (isset($this->folders[$path])) {
			return $this->folder($path);
		}
		throw new NotFoundException($path);
	}

	/** @return string[] direct children paths */
	private function children(string $path): array {
		$out = [];
		foreach (array_merge(array_keys($this->files), array_keys($this->folders)) as $candidate) {
			if ($candidate !== $path && dirname($candidate) === $path) {
				$out[] = $candidate;
			}
		}
		sort($out);
		return $out;
	}

	private function descendants(string $path): array {
		$out = [];
		foreach (array_merge(array_keys($this->files), array_keys($this->folders)) as $candidate) {
			if (str_starts_with($candidate, $path . '/')) {
				$out[] = $candidate;
			}
		}
		sort($out);
		return $out;
	}

	private function deletePath(string $path): void {
		foreach ($this->descendants($path) as $child) {
			unset($this->files[$child], $this->folders[$child]);
		}
		unset($this->files[$path], $this->folders[$path]);
	}

	private function configureNode($mock, string $path): void {
		$fs = $this;
		$mock->method('getPath')->willReturn($path);
		$mock->method('getName')->willReturn(basename($path));
		$mock->method('getParent')->willReturnCallback(function () use ($fs, $path) {
			$fs->hit('getParent');
			return $fs->folder(dirname($path));
		});
		$mock->method('delete')->willReturnCallback(function () use ($fs, $path) {
			$fs->hit('delete');
			$fs->deletePath($path);
		});
	}

	public function file(string $path): File {
		$path = self::norm($path);
		$fs = $this;
		$file = $this->test->getMockBuilder(File::class)->getMock();
		$this->configureNode($file, $path);
		$file->method('getContent')->willReturnCallback(function () use ($fs, $path) {
			$fs->hit('getContent');
			if (!isset($fs->files[$path])) {
				throw new NotFoundException($path);
			}
			return $fs->files[$path]['content'];
		});
		$file->method('putContent')->willReturnCallback(function ($data) use ($fs, $path) {
			$fs->hit('putContent');
			$fs->files[$path] = ['content' => (string)$data, 'mtime' => time(), 'upload' => time(), 'size' => null];
		});
		$file->method('getSize')->willReturnCallback(function () use ($fs, $path) {
			$entry = $fs->files[$path] ?? ['content' => '', 'size' => null];
			return $entry['size'] ?? strlen($entry['content']);
		});
		$file->method('getMTime')->willReturnCallback(fn () => $fs->files[$path]['mtime'] ?? 0);
		$file->method('getUploadTime')->willReturnCallback(fn () => $fs->files[$path]['upload'] ?? 0);
		$file->method('getCreationTime')->willReturn(0);
		$file->method('getMimetype')->willReturn('application/octet-stream');
		return $file;
	}

	public function folder(string $path): Folder {
		$path = self::norm($path);
		$fs = $this;
		$folder = $this->test->getMockBuilder(Folder::class)->getMock();
		$this->configureNode($folder, $path);
		$folder->method('get')->willReturnCallback(function ($relative) use ($fs, $path) {
			$fs->hit('get');
			return $fs->node($fs->join($path, $relative));
		});
		$folder->method('nodeExists')->willReturnCallback(function ($relative) use ($fs, $path) {
			$fs->hit('nodeExists');
			return $fs->exists($fs->join($path, $relative));
		});
		$folder->method('newFile')->willReturnCallback(function ($relative, $content = null) use ($fs, $path) {
			$fs->hit('newFile');
			return $fs->addFile($fs->join($path, $relative), (string)$content, null, 0);
		});
		$folder->method('newFolder')->willReturnCallback(function ($relative) use ($fs, $path) {
			$fs->hit('newFolder');
			return $fs->addFolder($fs->join($path, $relative));
		});
		$folder->method('getDirectoryListing')->willReturnCallback(function () use ($fs, $path) {
			$fs->hit('getDirectoryListing');
			return array_map(fn ($child) => $fs->node($child), $fs->children($path));
		});
		$folder->method('search')->willReturnCallback(function ($query) use ($fs, $path) {
			$fs->hit('search');
			if (!is_string($query)) {
				throw new \InvalidArgumentException('FakeFs only supports string searches');
			}
			// Folder::search(string) is a case-insensitive "name contains" match
			$pattern = str_replace('%', '', $query);
			$out = [];
			foreach ($fs->descendants($path) as $candidate) {
				if ($pattern === '' || stripos(basename($candidate), $pattern) !== false) {
					$out[] = $fs->node($candidate);
				}
			}
			return $out;
		});
		$folder->method('getFullPath')->willReturnCallback(fn ($relative) => $fs->join($path, $relative));
		$folder->method('getRelativePath')->willReturnCallback(function ($absolute) use ($path) {
			$absolute = self::norm($absolute);
			if ($absolute === $path) {
				return '/';
			}
			if (!str_starts_with($absolute, $path . '/')) {
				return null;
			}
			return substr($absolute, strlen($path));
		});
		$folder->method('getOwner')->willReturn(null);
		return $folder;
	}
}
