<?php

namespace OCA\Souvenirs\Tests\Unit\Support;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;

/**
 * Minimal in-memory stand-in for the OCP\Files node tree, for use in a
 * PHPUnit TestCase. Files and folders live in two arrays keyed by absolute
 * path; every Folder/File handed out is a mock whose methods read and write
 * those arrays, so the real model code (album.json, data/ assets, .lnk asset
 * links) runs unchanged and its effects can be asserted on the arrays.
 *
 * Only the node methods the app actually calls are implemented.
 */
trait FakeFilesystem {

    /** @var array<string,string> absolute file path => content */
    protected array $files = [];
    /** @var array<string,true> absolute folder paths */
    protected array $folders = [];

    protected function addFile(string $path, string $content = ''): void {
        $this->files[$path] = $content;
        $this->addFolder(dirname($path));
    }

    protected function addFolder(string $path): void {
        while ($path !== '/' && $path !== '' && !isset($this->folders[$path])) {
            $this->folders[$path] = true;
            $path = dirname($path);
        }
    }

    protected function pathExists(string $path): bool {
        return isset($this->files[$path]) || isset($this->folders[$path]);
    }

    /**
     * @throws NotFoundException
     */
    protected function node(string $path): Node {
        if (isset($this->files[$path])) {
            return $this->fileNode($path);
        }
        if (isset($this->folders[$path])) {
            return $this->folderNode($path);
        }
        throw new NotFoundException($path);
    }

    private static function joinPath(string $base, $relative): string {
        $relative = trim((string)$relative, '/');
        return $relative === '' ? $base : $base . '/' . $relative;
    }

    /** remove a file, or a folder and everything below it */
    private function removePath(string $path): void {
        unset($this->files[$path], $this->folders[$path]);
        foreach ([&$this->files, &$this->folders] as &$entries) {
            foreach (array_keys($entries) as $p) {
                if (str_starts_with($p, $path . '/')) {
                    unset($entries[$p]);
                }
            }
        }
    }

    protected function folderNode(string $path): Folder {
        $folder = $this->createMock(Folder::class);
        $folder->method('getPath')->willReturn($path);
        $folder->method('getName')->willReturn(basename($path));
        $folder->method('getParent')->willReturnCallback(fn () => $this->folderNode(dirname($path)));
        $folder->method('nodeExists')->willReturnCallback(
            fn ($rel) => $rel !== null && $this->pathExists(self::joinPath($path, $rel)));
        $folder->method('get')->willReturnCallback(fn ($rel) => $this->node(self::joinPath($path, $rel)));
        $folder->method('getFullPath')->willReturnCallback(fn ($rel) => self::joinPath($path, $rel));
        $folder->method('getRelativePath')->willReturnCallback(function ($abs) use ($path) {
            if ($abs === $path) {
                return '/';
            }
            // like Nextcloud: null for a path outside this folder
            return str_starts_with($abs, $path . '/') ? substr($abs, strlen($path)) : null;
        });
        $folder->method('newFile')->willReturnCallback(function ($rel, $content = null) use ($path) {
            $full = self::joinPath($path, $rel);
            $this->addFile($full, (string)$content);
            return $this->fileNode($full);
        });
        $folder->method('newFolder')->willReturnCallback(function ($rel) use ($path) {
            $full = self::joinPath($path, $rel);
            $this->addFolder($full);
            return $this->folderNode($full);
        });
        $folder->method('delete')->willReturnCallback(fn () => $this->removePath($path));
        // Nextcloud search is a name LIKE match; '%' matches everything
        $folder->method('search')->willReturnCallback(function ($query) use ($path) {
            $found = [];
            foreach (array_keys($this->files) as $p) {
                if (str_starts_with($p, $path . '/')
                    && ($query === '%' || str_contains(basename($p), $query))) {
                    $found[] = $this->fileNode($p);
                }
            }
            return $found;
        });
        $folder->method('getDirectoryListing')->willReturnCallback(function () use ($path) {
            $children = [];
            foreach (array_merge(array_keys($this->folders), array_keys($this->files)) as $p) {
                if (dirname($p) === $path) {
                    $children[] = $this->node($p);
                }
            }
            return $children;
        });
        return $folder;
    }

    protected function fileNode(string $path): File {
        $file = $this->createMock(File::class);
        $file->method('getPath')->willReturn($path);
        $file->method('getName')->willReturn(basename($path));
        $file->method('getParent')->willReturnCallback(fn () => $this->folderNode(dirname($path)));
        $file->method('getContent')->willReturnCallback(fn () => $this->files[$path]);
        $file->method('putContent')->willReturnCallback(function ($data) use ($path) {
            $this->files[$path] = (string)$data;
        });
        $file->method('getSize')->willReturnCallback(fn () => strlen($this->files[$path]));
        $file->method('delete')->willReturnCallback(fn () => $this->removePath($path));
        return $file;
    }
}
