import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = __dirname;

/**
 * Aliases are declared as regexes, not strings.
 *
 * A string alias in Vite is a *prefix* match, so `'react-native'` silently
 * rewrites `react-native-svg` to `react-native-websvg` and the failure surfaces
 * as an unrelated syntax error. Anchored regexes match the bare specifier only.
 */
const alias = (reactNativeTarget: string) => [
  { find: /^@\//, replacement: `${path.resolve(root, 'src')}/` },
  { find: /^react-native$/, replacement: reactNativeTarget },
  // react-native-svg's package entry pulls its native build, whose Flow syntax
  // Vite cannot parse. Its web build exports the identical surface.
  {
    find: /^react-native-svg$/,
    replacement: path.resolve(root, 'node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js'),
  },
];

/**
 * Two test projects, because they need incompatible module resolution.
 *
 * `engine` runs pure TypeScript in Node with `react-native` aliased to a tiny
 * stub — fast, and it keeps the engine honest about importing nothing from the
 * UI layer.
 *
 * `render` mounts real screens in jsdom against `react-native-web`. This project
 * exists because 426 engine tests were green while the app rendered a white
 * screen: a selector returning a fresh object on every call sent nine screens
 * into an infinite render loop, and nothing that never mounts a component can
 * see that.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: alias(path.resolve(root, 'src/test/react-native-stub.ts')) },
        test: {
          name: 'engine',
          environment: 'node',
          include: ['src/engine/**/*.test.ts', 'src/data/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: alias('react-native-web'),
          /**
           * Metro picks platform variants by filename extension, so
           * `./ReactNativeSVG` resolves to `ReactNativeSVG.web.js` on web.
           * Vite has no concept of platforms, so the extension list has to say
           * so explicitly — without this, react-native-svg pulls its native
           * entry and the Flow syntax inside fails to parse.
           */
          extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
        },
        test: {
          name: 'render',
          environment: 'jsdom',
          include: ['src/**/*.render.test.tsx'],
          setupFiles: [path.resolve(root, 'src/test/render-setup.tsx')],
        },
      },
    ],
  },
});
