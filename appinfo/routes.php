<?php
/**
 * Create your routes in here. The name is the lowercase name of the controller
 * without the controller part, the stuff after the hash is the method.
 * e.g. page#index -> OCA\Souvenir\Controller\PageController->index()
 *
 * The controller class has to be registered in the application.php file since
 * it's instantiated in there
 */
return [
    'routes' => [
	   ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
       ['name' => 'page#show', 'url' => '/show', 'verb' => 'GET', 'requirements' => array('apath' => '.+')],
       // Large preview of a file
    ['name' => 'preview#get_preview', 'url'  => '/preview','verb' => 'GET','requirements' => array('apath' => '.+', 'file' => '.+')],
    ['name' => 'preview#get_asset', 'url' => '/asset', 'verb' => 'GET', 'requirements' => array('apath' => '.+', 'file' => '.+') ],

    // admin
    ['name' => 'admin#update', 'url' => '/admin', 'verb' => 'PUT'],

    //API v2
    ['name' => 'api2#list_albums', 'url' => '/apiv2/album', 'verb' => 'GET', 'requirements' => array('page' => '[0-9]+') ],
    ['name' => 'api2#get_album', 'url' => '/apiv2/album/{id}', 'verb' => 'GET' ],
    ['name' => 'api2#get_album_full', 'url' => '/apiv2/album/{id}/full', 'verb' => 'GET' ],
    ['name' => 'api2#create_album', 'url' => '/apiv2/album/{id}', 'verb' => 'PUT' ],
    ['name' => 'api2#post_album', 'url' => '/apiv2/album/{id}', 'verb' => 'POST' ],
    ['name' => 'api2#delete_album', 'url' => '/apiv2/album/{id}', 'verb' => 'DELETE' ],

    ['name' => 'api2#asset_exists_in_album', 'url' => '/apiv2/album/{id}/assetprobe/{asset_path}', 'verb' => 'GET', 'requirements' => array('asset_path' => '.+')],
    ['name' => 'api2#clean_assets', 'url' => '/apiv2/album/{id}/clean', 'verb' => 'GET' ],

    ['name' => 'api2#create_page', 'url' => '/apiv2/album/{album_id}/page/{page_pos}', 'verb' => 'PUT' ],
    ['name' => 'api2#post_page', 'url' => '/apiv2/album/{album_id}/page/{page_id}', 'verb' => 'POST' ],
    ['name' => 'api2#delete_page', 'url' => '/apiv2/album/{album_id}/page/{page_id}', 'verb' => 'DELETE' ],
    ['name' => 'api2#move_page', 'url' => '/apiv2/album/{album_id}/page/{page_id}/pos/{page_pos}', 'verb' => 'POST' ],
    
    ['name' => 'api2#create_share', 'url' => '/apiv2/share', 'verb' => 'POST','requirements' => array('albumId' => '.+')],
    ['name' => 'api2#delete_share', 'url' => '/apiv2/share/{token}', 'verb' => 'DELETE'],
    ['name' => 'api2#get_share_by_user', 'url' => '/apiv2/share', 'verb' => 'GET'],

    //public API
    ['name' => 'public#show', 'url' => '/public/{token}', 'verb' => 'GET'],
    ['name' => 'public#get_album_full', 'url' => '/public/{token}/album', 'verb' => 'GET'],
    ['name' => 'preview#get_public_preview', 'url' => '/public/{token}/preview', 'verb' => 'GET','requirements' => array('file' => '.+')],
    ['name' => 'preview#get_public_asset', 'url' => '/public/{token}/asset', 'verb' => 'GET','requirements' => array('file' => '.+')],
    
    ]
];
