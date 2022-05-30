/**
 * Used to update the admin settings
 */
 (function (window, document, $) {
    'use strict';

    $(document).ready(function () {
        var souvenirsPathInput = $('#souvenirs input[name="souvenirs-path"]');
        var savedMessage = $('#souvenirs-saved-message');

        var saved = function () {
            if (savedMessage.is(':visible')) {
                savedMessage.hide();
            }

            savedMessage.fadeIn(function () {
                setTimeout(function () {
                    savedMessage.fadeOut();
                }, 5000);
            });
        };

        var submit = function () {
            var souvenirsPath = souvenirsPathInput.val();

            var data = {
                souvenirsPath: souvenirsPath,
            };

            var url = OC.generateUrl('/apps/souvenirs/admin');

            $.ajax({
                type: 'PUT',
                contentType: 'application/json; charset=utf-8',
                url: url,
                data: JSON.stringify(data),
                dataType: 'json'
            }).then(function (data) {
                saved();
                souvenirsPathInput.val(data.souvenirsPath);
            });

        };

        $('#souvenirs input[type="text"]').blur(submit);
    });


}(window, document, jQuery));