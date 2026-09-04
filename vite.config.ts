import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: ["es2020", "safari15"],
  },
  server: {
    proxy: {
      "/api/madlad": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/madlad/, ""),
      },
    },
  },
})
