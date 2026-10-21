import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { proxy: { '/api': 'http://localhost:8785', '/health': 'http://localhost:8785' } },
  build: { sourcemap: false },
})
