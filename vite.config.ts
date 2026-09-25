import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути обязательны для Яндекс.Игр (игра грузится из iframe-подкаталога)
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
    host: true,
  },
});
