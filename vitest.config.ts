import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // React Native's entry point ships Flow syntax that Rollup cannot parse.
      // The design tokens need Platform.select for font selection, so the node
      // test runner resolves react-native to a minimal stub.
      'react-native': path.resolve(__dirname, 'src/test/react-native-stub.ts'),
    },
  },
  test: {
    // The engine is deliberately pure TypeScript with no React Native imports,
    // so it tests in plain Node with no transform pipeline.
    include: ['src/engine/**/*.test.ts', 'src/data/**/*.test.ts'],
    environment: 'node',
  },
});
