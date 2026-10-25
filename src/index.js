import 'vite/modulepreload-polyfill'
import { createApp } from 'vue'
import AlbumItemList from './components/album-item-list.vue'
import Album from './components/album.vue'
import App from './app.vue'
import { createRouter, createWebHistory } from 'vue-router'
import { generateUrl } from '@nextcloud/router'


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

// Legacy hash links (e.g. the Files app "Open Album" action) look like
// apps/souvenirs/#/show?apath=<path>. The server only serves the app root, so
// rewrite them into a history route before the router reads the location.
// The album view expects apath to stay percent-encoded once the router has
// decoded the query (same as the router-link in album-item.vue).
if (window.location.hash.startsWith('#/show?')) {
  const apath = new URLSearchParams(window.location.hash.slice('#/show?'.length)).get('apath')
  if (apath) {
    window.history.replaceState(null, '', generateUrl('apps/souvenirs')
      + '/show?apath=' + encodeURIComponent(encodeURIComponent(apath)))
  }
}

const router = createRouter({
  routes: routes,
  history: createWebHistory(generateUrl('apps/souvenirs')),
})

const app = createApp(App).use(router).mount('#app-vue')


