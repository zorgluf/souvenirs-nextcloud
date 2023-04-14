(function ($, OC) {
    $(document).ready(function() {
      if ( typeof OCA !== 'undefined'
        && typeof OCA.Files !== 'undefined'
        && typeof OCA.Files.fileActions !== 'undefined'
      ) {
        OCA.Files.fileActions.registerAction({
          name: 'AlbumOpen',
          mime: 'application/json',
          permissions: OC.PERMISSION_READ,
          icon: OC.imagePath('souvenirs', 'icon'),
          actionHandler: function (fileName, context) {
            OC.redirect(
              OC.generateUrl(
                'apps/souvenirs/#/show?apath={dir}',
                {'dir': context.dir}
              )
            );
          },
          displayName: t('souvenirs', 'Open Album')
        });
  
      }
    });
  })(jQuery, OC);