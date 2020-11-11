<?php
script('souvenir', 'vue-index-list');
emit_script_tag('','var albumList = '.json_encode($_['albumArray']));
?>

<album-item-list>
</album-item-list>


