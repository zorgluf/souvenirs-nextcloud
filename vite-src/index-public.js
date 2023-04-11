import 'vite/modulepreload-polyfill'
import Vue from 'vue'
import Album from './components/album.vue'
import App from './app.vue'
import VueRouter from 'vue-router'

Vue.use(VueRouter)

const routes = [
  { 
    path: '/', 
    component: Album,
    props: route => ({
      token: window.location.pathname.substring(window.location.pathname.lastIndexOf("/")+1)
    })
  },

]

const router = new VueRouter({
  routes: routes,
})


const app = new Vue({
  router,
  render: h => h(App),
}).$mount('#app-vue')

