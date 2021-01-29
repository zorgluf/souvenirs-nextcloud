import Vue from 'vue'
import AlbumItemList from './components/album-item-list'

Vue.config.devtools = true

//for nextcloud vue components
Vue.prototype.t = window.t
Vue.prototype.n = window.n
Vue.prototype.OC = window.OC
Vue.prototype.OCA = window.OCA


// boot up vue 
new Vue({
  el: 'album-item-list',
  render: h => h(AlbumItemList, {
    props: {
    },
  }),
});
