<?php
style('souvenirs', 'style');
script('souvenirs', 'vue-index');
?>

<div id="album-parent-frame">
	<album path="<?php p($_['apath']) ?>" token="<?php p($_['token']) ?>">
	</album>
</div>


