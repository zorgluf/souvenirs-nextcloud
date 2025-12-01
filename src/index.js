import 'vite/modulepreload-polyfill'
import { createApp } from 'vue'
import AlbumItemList from './components/album-item-list.vue'
import Album from './components/album.vue'
import App from './app.vue'
import { createRouter, createWebHistory } from 'vue-router'


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
    props: route => ({ 
      token: route.params.token,
    }) 
  }
]

const router = createRouter({
  routes: routes,
  history: createWebHistory('index.php/apps/souvenirs'),
})


const app = createApp(App).use(router).mount('#app-vue')


