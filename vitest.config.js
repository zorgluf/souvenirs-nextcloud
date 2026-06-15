import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Standalone test config (kept separate from vite.config.js, which is wired to
// the Nextcloud build pipeline). Component/unit tests run against the source in
// src/ with a DOM environment and Nextcloud globals stubbed in setup.js.
export default defineConfig({
    plugins: [vue()],
    test: {
        environment: 'happy-dom',
        setupFiles: ['./tests/frontend/setup.js'],
        include: ['src/**/*.{test,spec}.js'],
        globals: true,
    },
})
