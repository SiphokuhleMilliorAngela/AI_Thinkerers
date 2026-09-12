import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        dashboard: 'index.html',
        popup: 'popup.html',
      },
    },
  },
  plugins: [react(), tailwindcss()],
})
