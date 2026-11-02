import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
      input: {
        main: resolve(__dirname, 'index.html'),
        styleGuide: resolve(__dirname, 'style-guide.html'),
      },
    },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
