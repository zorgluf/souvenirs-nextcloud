<?php

namespace OCA\Souvenirs\Settings;

use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\Settings\ISettings;

class AdminSettings implements ISettings
{

    /**
     * List of default settings
     */
    public const DEFAULT_SETTINGS = [
        'souvenirsPath' => '/Souvenirs',
    ];

    /**
     * @var IConfig
     */
    private $config;
    private $userId;

    public function __construct(IConfig $config, $UserId)
    {
        $this->config = $config;
        $this->userId = $UserId;
    }

    public function getForm()
    {
        $data = [];

        foreach (array_keys(self::DEFAULT_SETTINGS) as $setting) {
            $data[$setting] = $this->config->getUserValue(
                $this->userId,
                "souvenirs",
                $setting,
                self::DEFAULT_SETTINGS[$setting]
            );
        }

        return new TemplateResponse("souvenirs", 'admin', $data);
    }

    public function getSection()
    {
        return 'souvenirs';
    }

    public function getPriority()
    {
        return 10;
    }
}