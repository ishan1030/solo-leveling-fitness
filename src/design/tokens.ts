import { Platform } from 'react-native';
import type { Tier } from '../engine/types';

/**
 * §19 — VISUAL SYSTEM.
 *
 * "DIRECTION: industrial-futurist, not neon-anime. Think mission-control
 * instrumentation and precision equipment rather than glowing blue holograms.
 * The app should look like a serious instrument that happens to be beautiful."
 *
 * Rules encoded here rather than left to discipline:
 *   - no drop shadows, no glassmorphism, no gradients except the ECLIPSE sigil
 *   - hairline borders, generous negative space, one accent per screen
 *   - numbers are monospace and set large
 */

// ---------------------------------------------------------------------------
// Palette — §19
// ---------------------------------------------------------------------------

export const palette = {
  /** near-black, slightly warm */
  base: '#0A0B0D',
  /** raised panels */
  surface: '#141619',
  /** one step above surface, for nested panels */
  surfaceRaised: '#1B1E22',
  /** primary text */
  ink: '#F2F3F5',
  /** secondary text */
  muted: '#7C8289',
  /** hairline dividers and borders */
  hairline: '#242830',
  /** primary accent — progress, confirmation, live state */
  signal: '#00E0B8',
  /** PRs, tier-ups, urgency */
  alert: '#FF5A3C',
} as const;

/**
 * §19 tier colours. ECLIPSE is iridescent — "the only gradient in the entire
 * app" — so it carries a gradient stop array while every other tier is a flat
 * colour. Nothing else in the codebase may define a gradient.
 */
export interface TierVisual {
  /** Flat colour. For ECLIPSE this is the mid-point, used where a gradient cannot render. */
  color: string;
  /** Non-null for ECLIPSE only. */
  gradient: readonly string[] | null;
  label: string;
  /** §20: colour is never the sole carrier of tier — every tier has a sigil glyph. */
  sigil: TierSigilShape;
  /** §19: "its own sound signature". Asset key, resolved by the audio layer. */
  sound: string;
}

/**
 * Sigil geometry. Each is drawn from primitives in TierSigil.tsx rather than
 * shipped as art, so they scale cleanly and stay legible at rank-card size and
 * at 16px in a ladder row.
 *
 * §3 HARD RULE: these are original geometric marks. None imitates the sigil
 * language of any existing property — they are built from the same vocabulary
 * as instrument dial markings.
 */
export type TierSigilShape =
  | 'ash_scatter'
  | 'iron_bar'
  | 'cobalt_chevron'
  | 'storm_fork'
  | 'solar_ring'
  | 'eclipse_occult';

export const tierVisuals: Record<Tier, TierVisual> = {
  ASH: {
    color: '#8A8377',
    gradient: null,
    label: 'ASH',
    sigil: 'ash_scatter',
    sound: 'tier_ash',
  },
  IRON: {
    color: '#8E99A6',
    gradient: null,
    label: 'IRON',
    sigil: 'iron_bar',
    sound: 'tier_iron',
  },
  COBALT: {
    color: '#2F6BE0',
    gradient: null,
    label: 'COBALT',
    sigil: 'cobalt_chevron',
    sound: 'tier_cobalt',
  },
  STORM: {
    color: '#7B5BE8',
    gradient: null,
    label: 'STORM',
    sigil: 'storm_fork',
    sound: 'tier_storm',
  },
  SOLAR: {
    color: '#F2A93B',
    gradient: null,
    label: 'SOLAR',
    sigil: 'solar_ring',
    sound: 'tier_solar',
  },
  ECLIPSE: {
    color: '#C9D6E8',
    // The only gradient in the app.
    gradient: ['#7B5BE8', '#00E0B8', '#F2A93B', '#C9D6E8'],
    label: 'ECLIPSE',
    sigil: 'eclipse_occult',
    sound: 'tier_eclipse',
  },
};

// ---------------------------------------------------------------------------
// Typography — §19
// ---------------------------------------------------------------------------

/**
 * "Display — a wide geometric sans, tight tracking, for tiers and moments.
 *  UI — a neutral grotesque.
 *  Data — a monospace for all numbers, stats, timers, and system readouts."
 *
 * Platform system faces are used so v1.0 ships without a font-licensing
 * dependency. `docs/10-visual-system.md` names the licensed families to swap in.
 */
export const fonts = {
  display: Platform.select({
    ios: 'Avenir Next Condensed',
    android: 'sans-serif-condensed',
    default: 'system-ui',
  })!,
  ui: Platform.select({
    ios: 'Helvetica Neue',
    android: 'sans-serif',
    default: 'system-ui',
  })!,
  data: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'ui-monospace',
  })!,
} as const;

/**
 * §19: "Numbers are the hero of this product. Set them large, set them
 * monospace, let them breathe."
 */
export const type = {
  moment: { fontFamily: fonts.display, fontSize: 56, letterSpacing: -1.5, lineHeight: 60 },
  display: { fontFamily: fonts.display, fontSize: 34, letterSpacing: -0.8, lineHeight: 38 },
  title: { fontFamily: fonts.ui, fontSize: 22, letterSpacing: -0.2, lineHeight: 28 },
  body: { fontFamily: fonts.ui, fontSize: 16, letterSpacing: 0, lineHeight: 24 },
  small: { fontFamily: fonts.ui, fontSize: 13, letterSpacing: 0.1, lineHeight: 18 },

  /** All numbers, stats, timers and readouts. */
  dataHero: { fontFamily: fonts.data, fontSize: 64, letterSpacing: -2, lineHeight: 66 },
  dataLarge: { fontFamily: fonts.data, fontSize: 32, letterSpacing: -0.5, lineHeight: 36 },
  data: { fontFamily: fonts.data, fontSize: 16, letterSpacing: 0, lineHeight: 22 },
  dataSmall: { fontFamily: fonts.data, fontSize: 12, letterSpacing: 0.4, lineHeight: 16 },

  /** Section headers and system labels. */
  label: { fontFamily: fonts.data, fontSize: 11, letterSpacing: 1.6, lineHeight: 14 },
} as const;

// ---------------------------------------------------------------------------
// Spacing and surface — §19
// ---------------------------------------------------------------------------

/** 4pt base scale. Generous negative space is a rule, not a preference. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 72,
} as const;

export const radius = {
  none: 0,
  sm: 2,
  md: 4,
  lg: 8,
  pill: 999,
} as const;

/**
 * "Thin 1px borders, generous negative space, hairline dividers, subtle grain
 * over dark surfaces, and a single accent per screen. No drop shadows. No
 * glassmorphism. No purple gradient buttons."
 *
 * `hairlineWidth` is 1 physical pixel, not 1 density-independent point — on a
 * 3x screen a 1pt border reads as a heavy 3px line and loses the instrument feel.
 */
export const surface = {
  hairlineWidth: Platform.OS === 'web' ? 1 : 0.5,
  borderColor: palette.hairline,
  /** Opacity of the grain overlay applied over large dark surfaces. */
  grainOpacity: 0.035,
} as const;

// ---------------------------------------------------------------------------
// Motion — §19
// ---------------------------------------------------------------------------

/**
 * "Fast and mechanical: 150–250ms, custom ease, never bouncy. Numbers tick
 * rather than fade. Panels slide on one axis. Everything feels like a machine
 * responding."
 */
export const motion = {
  instant: 100,
  fast: 150,
  base: 200,
  slow: 250,
  /** Set pieces only — the five §19 moment screens. */
  moment: 1200,

  /**
   * A custom ease with a sharp attack and a hard settle. Deliberately not a
   * spring: springs overshoot, and an instrument that overshoots reads as
   * imprecise.
   */
  easing: { x1: 0.2, y1: 0.0, x2: 0.0, y2: 1.0 },

  /** §20: prefers-reduced-motion disables all set-piece animation. */
  reducedMotionDuration: 0,
} as const;

// ---------------------------------------------------------------------------
// Accessibility — §20
// ---------------------------------------------------------------------------

export const a11y = {
  /** "Minimum 44pt tap targets." */
  minTapTarget: 44,
  /** WCAG AA for body text on the base background. */
  minContrastRatio: 4.5,
  /** WCAG AA for large text (18pt+ or 14pt bold). */
  minContrastRatioLarge: 3.0,
} as const;

// ---------------------------------------------------------------------------
// Contrast checking — §20, enforced rather than assumed
// ---------------------------------------------------------------------------

function channelLuminance(component: number): number {
  const c = component / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  );
}

/** WCAG 2.1 contrast ratio between two hex colours. */
export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}
