import { defineConfig } from 'vite'

// The service worker (issue #22) is built apart from the app (vite.config.js):
// it must be ONE classic script, with no shared chunk nor hashed name, served
// by PageController::serviceWorker. Runs after the app build, into the same
// output directory.
export default defineConfig({
    build: {
        outDir: 'js/vite',
        emptyOutDir: false,
        sourcemap: false,
        lib: {
            entry: 'src/sw/index.js',
            formats: ['iife'],
            name: 'SouvenirsServiceWorker',
            fileName: () => 'souvenirs-sw.js',
        },
    },
})
