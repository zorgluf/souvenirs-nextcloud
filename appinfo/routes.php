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

    //API v1 deprecated
    ['name' => 'api#list_albums', 'url' => '/api/album', 'verb' => 'GET' ],
    ['name' => 'api#create_album', 'url' => '/api/album/{id}', 'verb' => 'PUT' ],
    ['name' => 'api#get_album', 'url' => '/api/album/{id}', 'verb' => 'GET' ],
    ['name' => 'api#get_album_full', 'url' => '/api/album/{id}/full', 'verb' => 'GET' ],
    ['name' => 'api#post_album', 'url' => '/api/album/{id}', 'verb' => 'POST','requirements' => array('infos' => '.+') ],

    ['name' => 'api#asset_exists_in_album', 'url' => '/api/album/{id}/assetprobe/{asset_path}', 'verb' => 'GET', 'requirements' => array('asset_path' => '.+')],
    ['name' => 'api#clean_assets', 'url' => '/api/album/{id}/cleanassets', 'verb' => 'GET' ],

    ['name' => 'api#create_page', 'url' => '/api/album/{id}/page/{page_pos}', 'verb' => 'PUT','requirements' => array('infos' => '.+') ],
    ['name' => 'api#post_page', 'url' => '/api/album/{id}/page/{page_id}', 'verb' => 'POST','requirements' => array('infos' => '.+') ],
    ['name' => 'api#delete_page', 'url' => '/api/album/{id}/page/{page_id}', 'verb' => 'DELETE','requirements' => array('infos' => '.+') ],
    ['name' => 'api#move_page', 'url' => '/api/album/{id}/page/{page_id}/pos/{page_pos}', 'verb' => 'POST' ],

    ['name' => 'api#get_share_by_user', 'url' => '/api/share', 'verb' => 'GET'],
    ['name' => 'api#create_share', 'url' => '/api/share', 'verb' => 'POST','requirements' => array('albumId' => '.+')],
    ['name' => 'api#delete_share', 'url' => '/api/share/{token}', 'verb' => 'DELETE'],

    //API v2
    ['name' => 'api2#list_albums', 'url' => '/apiv2/album', 'verb' => 'GET' ],
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
    
    ]
];
