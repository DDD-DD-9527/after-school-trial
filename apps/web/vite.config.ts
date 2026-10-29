import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5280,
    proxy: {
      '/api': { target: 'http://localhost:5281', changeOrigin: true },
      '/health': { target: 'http://localhost:5281', changeOrigin: true },
    },
  },
});
