import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/eskiz': {
        target: 'https://notify.eskiz.uz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/eskiz/, '/api')
      }
    }
  }
})
