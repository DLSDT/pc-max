import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Tauri requires a fixed port and no clearing of the screen in dev.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    // Browser-based testing against the deployed API.
    //
    // The server refuses a localhost origin on purpose — ALLOW_DEV_CORS_ORIGINS
    // defaults to false so production never hands its credentials to a page
    // running on someone's machine. Proxying here makes the request same-origin
    // from the browser's point of view, so nothing about that guard has to be
    // relaxed to click through the app in a browser.
    //
    // Only active for `vite dev`. A packaged build talks to the API directly.
    proxy: {
      '/api': {
        target: process.env.PCMAX_PROXY_TARGET ?? 'https://pc-maxapp.rixy.ir',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    target: 'chrome105',
    minify: 'esbuild',
    sourcemap: false,
  },
});
