<?php

declare(strict_types=1);

namespace OCA\Souvenirs\AppInfo;

use OCA\Souvenirs\Middleware\TimingMiddleware;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\EventDispatcher\IEventDispatcher;
use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCP\Util;

class Application extends App implements IBootstrap {

    public function __construct() {
        parent::__construct('souvenirs');

        // this runs every time Nextcloud loads a page if this app is enabled
        $container = $this->getContainer();
        $eventDispatcher = $container->get(IEventDispatcher::class);

        // load files plugin script when the Files app triggers the LoadAdditionalScriptsEvent event
        $eventDispatcher->addListener(LoadAdditionalScriptsEvent::class, function () {
            // this loads the js/fileaction.js script once the Files app has done loading its scripts
            Util::addscript("souvenirs", 'fileaction', 'files');
        });
    }

    public function register(IRegistrationContext $context): void {
        // Server-Timing breakdown on the apiv2/preview responses (issue #50)
        $context->registerMiddleware(TimingMiddleware::class);
    }

    public function boot(IBootContext $context): void {
    }

}
