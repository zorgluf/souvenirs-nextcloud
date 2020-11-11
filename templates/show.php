<?php
style('souvenir', 'style');
emit_script_tag('','var albumData = '.json_encode($_['album_json']));
emit_script_tag('','albumData.path = "'.$_['apath'].'";');
script('souvenir', 'vue-index');
?>

<div id="album-parent-frame">
	<album v-bind:s-name="album.name"  v-bind:displayed-page="album.displayedPage" v-bind:nb-page="album.pages.length">
	</album>
</div>

