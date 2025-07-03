import { defineConfig } from 'vite'

export default defineConfig({
  base: '/bya/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
}) 