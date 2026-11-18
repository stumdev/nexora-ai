import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // em desenvolvimento, a API roda com "nexora web" na porta 4173
    proxy: { '/api': { target: 'http://127.0.0.1:4173', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
