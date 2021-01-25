<?php
script('souvenirs', 'script');
style('souvenirs', 'style');
?>

<div id="app">
	<div id="app-navigation">
		<?php print_unescaped($this->inc('navigation/index')); ?>
		<?php print_unescaped($this->inc('settings/index')); ?>
	</div>

	<div id="app-content">
		<div id="app-content-wrapper">
			<?php p($_['msg']); ?>
		</div>
	</div>
</div>

