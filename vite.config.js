import { createAppConfig } from '@nextcloud/vite-config'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'
import vue from '@vitejs/plugin-vue'

const myOverrides = defineConfig({
    plugins: [mkcert()],
    build: {
        outDir: "js/vite",
        manifest: true,
    },
    server: {
        origin: 'https://localhost:5173',
        https: true,
    },
    base: "./"
})

export default createAppConfig({
    index: 'src/index.js',
}, {
    config: myOverrides,
    emptyOutputDirectory: false,
    appName: 'souvenirs'
})

/* import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'


export default defineConfig({
  plugins: [mkcert(), vue()],
  define: {
    'process.env.NODE_DEBUG': '""'
  },
  build: {
    manifest: true,
    outDir: "../js/vite",
    rollupOptions: {
      input: {
        "index": 'index.js',
        "index-public": 'index-public.js'
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      esmExternals: true 
    },
  },
  server: {
    origin: 'https://localhost:5173',
    https: true,
  },
  base: "./",
})
*/