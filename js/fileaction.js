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
          icon: OC.imagePath('souvenir', 'icon'),
          actionHandler: function (fileName, context) {
            OC.redirect(
              OC.generateUrl(
                'apps/souvenir/show?apath={dir}',
                {'dir': context.dir}
              )
            );
          },
          displayName: t('souvenir', 'Open Album')
        });
  
        //OCA.Files.fileActions.setDefault('application/json', 'AlbumOpen');
      }
    });
  })(jQuery, OC);