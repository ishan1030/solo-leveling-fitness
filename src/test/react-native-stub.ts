/**
 * Minimal React Native stub for the node-side test runner.
 *
 * The engine is pure TypeScript and imports nothing from React Native, but the
 * design tokens legitimately need `Platform.select` to pick system font faces.
 * React Native's real entry point ships Flow syntax that Rollup cannot parse, so
 * vitest aliases the module to this file.
 *
 * Only the surface the tokens actually touch is stubbed. Anything else is left
 * undefined on purpose: if a future test reaches further into React Native, it
 * should fail loudly here rather than silently pass against a fake.
 */

export const Platform = {
  OS: 'ios' as const,
  select<T>(options: { ios?: T; android?: T; native?: T; default?: T }): T | undefined {
    return options.ios ?? options.native ?? options.default;
  },
};
