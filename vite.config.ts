import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
});
