<?php

use \OCP\Util;
$util = new Util();

if ($_['isDev']) {
    emit_script_tag("https://localhost:5173/@vite/client" . '" type="module');
    emit_script_tag("https://localhost:5173/index.js" . '" type="module');
} else {
	function manifest(): array
    {
        $manifestPath = dirname(__FILE__) . "/../js/vite/manifest.json";
        if (!file_exists($manifestPath)) {
            return [];
        }
        $manifestFile = fopen($manifestPath, "r");
        $content = fread($manifestFile,filesize($manifestPath));
        fclose($manifestFile);

        return $content
            ? json_decode($content, true)
            : [];
    }
    $manifest = manifest();
	$js_file = $manifest['index.js']['file'];
    emit_script_tag($util->linkToAbsolute('souvenirs', 'js/vite/' . $js_file) . '" type="module');
    if (array_key_exists("css",$manifest["index.js"])) {
        $css_file = $manifest['index.js']['css'][0];
        emit_css_tag($util->linkToAbsolute('souvenirs', 'js/vite/' . $css_file));
    }
    //for imports
    if (array_key_exists("imports",$manifest['index.js'])) {
        foreach($manifest['index.js']["imports"] as $import) {
            $js_file = $manifest[$import]['file'];
            emit_script_tag($util->linkToAbsolute('souvenirs', 'js/vite/' . $js_file) . '" type="module');
            if (array_key_exists("css",$manifest[$import])) {
                $css_file = $manifest[$import]['css'][0];
                emit_css_tag($util->linkToAbsolute('souvenirs', 'js/vite/' . $css_file));
            }
        }
    }
}

?>

<div id="app-vue">
</div>

