import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Must mirror vite.config.ts, or anything importing through '@/' is
  // untestable — which is why no test had ever touched a store.
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/lib/__tests__/**/*.test.ts', 'src/store/__tests__/**/*.test.ts'],
  },
});
