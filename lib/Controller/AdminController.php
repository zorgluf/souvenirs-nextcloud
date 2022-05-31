<?php

namespace OCA\Souvenirs\Controller;

use OCA\Souvenirs\Settings\AdminSettings;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\AppFramework\Controller;

class AdminController extends Controller
{

    /**
     * @var IConfig
     */
    private $config;
    private $userId;

    public function __construct($appName, IRequest $request, $UserId ,IConfig $config)
    {
        parent::__construct($appName, $request);
        $this->userId = $UserId;
        $this->config = $config;
    }

    /**
     * Controller main entry.
     *
     * There are no checks for the index method since the output is
     * rendered in admin/admin.php
     *
     * @return TemplateResponse
     */
    public function index(): TemplateResponse
    {
        return new TemplateResponse($this->appName, 'admin', $this->getData(), 'blank');
    }

    /**
     * Get admin data.
     *
     * @return array
     */
    private function getData(): array
    {
        $data = [];

        foreach (array_keys(AdminSettings::DEFAULT_SETTINGS) as $setting) {
            $data[$setting] = $this->config->getUserValue(
                $this->userId,
                $this->appName,
                $setting,
                AdminSettings::DEFAULT_SETTINGS[$setting]
            );
        }

        return $data;
    }

    /**
     * Update the app config.
     *
     * @param string    $souvenirsPath Path to Souvenirs' albums
     *
     * @return array with the updated values
     */
    public function update(string $souvenirsPath): array {
        if ($souvenirsPath === "") {
            $this->config->deleteUserValue($this->userId, $this->appName, 'souvenirsPath');
        } else {
            $this->config->setUserValue($this->userId, $this->appName, 'souvenirsPath', $souvenirsPath);
        }
        

        return $this->getData();
    }
}