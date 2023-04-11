import 'vite/modulepreload-polyfill'
import Vue from 'vue'
import AlbumItemList from './components/album-item-list.vue'
import Album from './components/album.vue'
import App from './app.vue'
import VueRouter from 'vue-router'

Vue.use(VueRouter)

const routes = [
  { path: '/', component: AlbumItemList },
  { 
    path: '/show', 
    component: Album, 
    props: route => ({ 
      path: route.query.apath,
    }) 
  },
  { 
    path: '/public/:token', 
    component: Album, 
    props: {
      default: true,
    } 
  }
]

const router = new VueRouter({
  routes: routes,
})


const app = new Vue({
  router,
  render: h => h(App),
}).$mount('#app-vue')

