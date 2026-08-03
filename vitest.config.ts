import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // The engine is deliberately pure TypeScript with no React Native imports,
    // so it tests in plain Node with no transform pipeline.
    include: ['src/engine/**/*.test.ts', 'src/data/**/*.test.ts'],
    environment: 'node',
  },
});
