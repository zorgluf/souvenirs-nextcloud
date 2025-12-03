import { createAppConfig } from '@nextcloud/vite-config'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'

const myOverrides = defineConfig({
    plugins: [mkcert()],
    build: {
        outDir: "js/vite",
        manifest: true,
        commonjsOptions: {
            transformMixedEsModules: true
        },
        emptyOutDir: true
    },
    server: {
        origin: 'https://localhost:5173',
        https: true,
    }
})

export default createAppConfig({
    index: 'src/index.js',
}, {
    config: myOverrides,
    emptyOutputDirectory: false,
    appName: 'souvenirs'
})
