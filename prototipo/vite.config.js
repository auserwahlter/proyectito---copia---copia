import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/matctrl/',
  plugins: [react()],
  server: {
    proxy: {
      '/matctrl': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/matctrl/, ''),
      },
    },
  },
})
