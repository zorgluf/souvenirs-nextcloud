import Vue from 'vue'
import Album from './components/album'

Vue.config.devtools = true
__webpack_nonce__ = btoa(OC.requestToken)
__webpack_public_path__ = OC.linkTo('souvenirs', 'js/')

// boot up vue album
new Vue({
  el: 'album',
  render: h => h(Album, {
    props: {
      "sName": albumData.name,
      "pages": albumData.pages,
      "path": albumData.path,
      "token": (typeof token === 'undefined') ? "": token,
    }
  }),
});