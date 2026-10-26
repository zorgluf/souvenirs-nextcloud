<?php

declare(strict_types=1);

namespace OCA\Souvenirs\Middleware;

use OCA\Souvenirs\Controller\Api2Controller;
use OCA\Souvenirs\Controller\PreviewController;
use OCA\Souvenirs\Service\Profiler;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Middleware;
use Psr\Log\LoggerInterface;

/**
 * Adds a `Server-Timing` header to the apiv2 and preview responses (issue #50),
 * so the cost of each edit-mode call can be measured from the browser without
 * touching the server logs. The same breakdown
 * is logged at debug level for server-side analysis.
 *
 * The header only exposes durations of the app's own steps (no paths, no
 * data), on endpoints that already require the user's session or a share
 * token.
 */
class TimingMiddleware extends Middleware {

	private ?int $start = null;

	public function __construct(
		private LoggerInterface $logger,
	) {
	}

	private function isProfiled($controller): bool {
		return ($controller instanceof Api2Controller) || ($controller instanceof PreviewController);
	}

	public function beforeController($controller, $methodName) {
		if ($this->isProfiled($controller)) {
			Profiler::reset();
			$this->start = hrtime(true);
		}
	}

	public function afterController($controller, $methodName, Response $response) {
		if (!$this->isProfiled($controller) || $this->start === null) {
			return $response;
		}
		$totalMs = (hrtime(true) - $this->start) / 1e6;
		$header = Profiler::serverTimingHeader($totalMs);
		$response->addHeader('Server-Timing', $header);
		$this->logger->debug('souvenirs ' . $methodName . ': ' . $header, ['app' => 'souvenirs']);
		$this->start = null;
		return $response;
	}
}
