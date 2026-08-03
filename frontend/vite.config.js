import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,            // Listen on 0.0.0.0
    port: 5173,
    strictPort: false,
    allowedHosts: 'all',   // Allow any host (dev only!)
    
    // Optional: proxy API calls to backend
    proxy: {
      '/api': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,    // Allow self-signed cert
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 1000,
  }
})