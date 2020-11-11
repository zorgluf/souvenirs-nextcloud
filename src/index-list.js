import Vue from 'vue'
import AlbumItemList from './components/album-item-list'

Vue.config.devtools = true


// boot up vue 
new Vue({
  el: 'album-item-list',
  render: h => h(AlbumItemList, {
    props: {
        'albumList': albumList.sort(function(a,b) {
          return b["date"].localeCompare(a["date"]);
        }),
    },
  }),
});
