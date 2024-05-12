import 'vite/modulepreload-polyfill'
import Vue from 'vue'
import Album from './components/album.vue'
import App from './app.vue'
import VueRouter from 'vue-router'
import device from "vue-device-detector-js"

Vue.use(VueRouter)
Vue.use(device)

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

