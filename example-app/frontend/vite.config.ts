import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: '/example-app/',
  build: { outDir: 'build' },
  server: { proxy: {
    '/example-api': 'http://127.0.0.1:8080',
    '/guacamole': { target: 'http://127.0.0.1:8080', ws: true },
  } },
});
