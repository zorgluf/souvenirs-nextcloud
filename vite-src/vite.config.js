import vue from '@vitejs/plugin-vue2'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'

//TODO: surveiller https://github.com/vitejs/vite/pull/2909


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
      transformMixedEsModules: true
    },
    emptyOutDir: true,
  },
  server: {
    origin: 'https://localhost:5173',
    https: true,
  },
  base: "./",
})
