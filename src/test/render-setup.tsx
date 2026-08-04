import React from 'react';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Setup for the `render` test project.
 *
 * Only genuinely native modules are mocked. Everything else — the design
 * system, the engine, the store, react-native-svg — runs for real, because a
 * test that mocks the thing it is testing proves nothing. The point of this
 * project is to mount the actual component tree.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Native modules with no web implementation
// ---------------------------------------------------------------------------

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(async () => {}),
  notificationAsync: vi.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

vi.mock('expo-speech', () => ({
  speak: vi.fn(),
  stop: vi.fn(),
  isSpeakingAsync: vi.fn(async () => false),
}));

vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(async () => {}),
}));

vi.mock('react-native-view-shot', () => ({
  captureRef: vi.fn(async () => 'file:///mock.png'),
}));

vi.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

/**
 * AsyncStorage is mocked rather than polyfilled so each test starts from an
 * empty store. The persistence path itself is not what these tests are for.
 */
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => {}),
    removeItem: vi.fn(async () => {}),
  },
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ---------------------------------------------------------------------------
// jsdom gaps that React Native Web expects
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

// react-native-web's Animated loop needs these; jsdom has them but not always
// in the shape Animated expects when a test unmounts mid-animation.
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 16) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id as unknown as NodeJS.Timeout)) as typeof cancelAnimationFrame;
}
