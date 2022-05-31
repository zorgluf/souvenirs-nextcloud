<?php
script('souvenirs', 'admin');
style('souvenirs', 'admin');
?>

<div class="section" id="souvenirs">
    <h2>Souvenirs</h2>
    <div class="form-line">
        <p>
            <label for="souvenirs-path">
                <?php p("Path for Souvenirs Album storage"); ?></p>
            </label>
        <p>
            <em>
            <?php p("Path relative to user directory used to store Souvenirs' albums and images"); ?></em>
        </p>
        <p><input type="text" name="souvenirs-path"
               value="<?php p($_['souvenirsPath']); ?>"></p>
    </div>
    <div id="souvenirs-saved-message">
        <span class="msg success"><?php p('Saved'); ?></span>
    </div>
</div>