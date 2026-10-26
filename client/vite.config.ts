import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true, ws: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
