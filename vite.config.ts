import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:4820',
      '/mcp': 'http://127.0.0.1:4820',
      '/events': 'http://127.0.0.1:4820',
    },
  },
});
