<?php
style('souvenirs', 'style');
emit_script_tag('','var albumData = '.json_encode($_['album_json']));
emit_script_tag('','albumData.path = "'.$_['apath'].'";');
emit_script_tag('','var token = "'.$_['token'].'";');
script('souvenirs', 'vue-index');
?>

<div id="album-parent-frame">
	<album>
	</album>
</div>


