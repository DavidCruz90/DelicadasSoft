import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'src/web',
  plugins: [preact()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000', '/fotos': 'http://127.0.0.1:3000' } },
});
