import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { a11y, contrastRatio, palette, space, tierVisuals, type } from '../design/tokens';
import { TIERS } from '../engine/types';

/**
 * §19 and §20 as enforced rules rather than intentions.
 *
 * The source-scanning tests below exist because "no drop shadows" and "the only
 * gradient in the app" are the kind of rule that erodes silently over a project's
 * life. A grep in CI is the only thing that actually holds them.
 */

const SRC = join(__dirname, '..');

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) acc.push(full);
  }
  return acc;
}

/**
 * Strips comments so the prohibition scans below check shipped behaviour rather
 * than the spec citations that document it. `copy.ts` legitimately contains the
 * sentence "NEVER prescribes calories, weight targets, body-fat goals" as a
 * quotation of §14 — that comment is the reason the rule holds, not a violation
 * of it.
 *
 * Deliberately simple: a "//" inside a string literal would truncate that line
 * early. That only ever makes the scan see less text, so it cannot produce a
 * false pass on a violation that appears before the quote — and no user-facing
 * string in this codebase contains "//".
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const ALL_SOURCES = sourceFiles(SRC).map((path) => ({
  path: path.replace(SRC, 'src'),
  content: readFileSync(path, 'utf8'),
}));

/** Same files with comments removed, for the §21 and §3 prohibition scans. */
const ALL_SOURCES_CODE_ONLY = ALL_SOURCES.map((file) => ({
  path: file.path,
  content: stripComments(file.content),
}));

describe('§19 — palette', () => {
  it('uses the specified values', () => {
    expect(palette.base).toBe('#0A0B0D');
    expect(palette.surface).toBe('#141619');
    expect(palette.ink).toBe('#F2F3F5');
    expect(palette.muted).toBe('#7C8289');
    expect(palette.signal).toBe('#00E0B8');
    expect(palette.alert).toBe('#FF5A3C');
  });

  it('gives every tier a colour, a sigil, a label and a sound', () => {
    for (const tier of TIERS) {
      const visual = tierVisuals[tier];
      expect(visual.color, tier).toMatch(/^#[0-9A-F]{6}$/i);
      expect(visual.sigil, tier).toBeTruthy();
      expect(visual.label, tier).toBe(tier);
      expect(visual.sound, tier).toBeTruthy();
    }
  });

  it('gives every tier a distinct sigil — §20, colour is never the sole carrier', () => {
    const sigils = new Set(TIERS.map((t) => tierVisuals[t].sigil));
    expect(sigils.size).toBe(TIERS.length);
  });

  it('gives every tier a distinct colour', () => {
    const colors = new Set(TIERS.map((t) => tierVisuals[t].color));
    expect(colors.size).toBe(TIERS.length);
  });

  it('makes ECLIPSE the only gradient in the app', () => {
    for (const tier of TIERS) {
      if (tier === 'ECLIPSE') {
        expect(tierVisuals[tier].gradient).not.toBeNull();
        expect(tierVisuals[tier].gradient!.length).toBeGreaterThan(2);
      } else {
        expect(tierVisuals[tier].gradient, tier).toBeNull();
      }
    }
  });
});

describe('§20 — WCAG AA contrast on the dark theme', () => {
  it('passes AA for primary text on base and surface', () => {
    expect(contrastRatio(palette.ink, palette.base)).toBeGreaterThanOrEqual(a11y.minContrastRatio);
    expect(contrastRatio(palette.ink, palette.surface)).toBeGreaterThanOrEqual(
      a11y.minContrastRatio,
    );
  });

  it('passes AA for secondary text on base and surface', () => {
    expect(contrastRatio(palette.muted, palette.base)).toBeGreaterThanOrEqual(
      a11y.minContrastRatio,
    );
    expect(contrastRatio(palette.muted, palette.surface)).toBeGreaterThanOrEqual(
      a11y.minContrastRatio,
    );
  });

  it('passes AA for the signal accent on base', () => {
    expect(contrastRatio(palette.signal, palette.base)).toBeGreaterThanOrEqual(
      a11y.minContrastRatio,
    );
  });

  it('passes AA-large for the alert accent on base', () => {
    // Alert is only ever used at display size or as a border, so the 3.0 large-text
    // threshold is the applicable one.
    expect(contrastRatio(palette.alert, palette.base)).toBeGreaterThanOrEqual(
      a11y.minContrastRatioLarge,
    );
  });

  it('passes AA-large for every tier colour on base — tier labels are set large', () => {
    for (const tier of TIERS) {
      expect(
        contrastRatio(tierVisuals[tier].color, palette.base),
        `${tier} on base`,
      ).toBeGreaterThanOrEqual(a11y.minContrastRatioLarge);
    }
  });

  it('computes a known contrast ratio correctly', () => {
    // Pure white on pure black is 21:1 by definition.
    expect(contrastRatio('#FFFFFF', '#000000')).toBe(21);
  });
});

describe('§19 — typography', () => {
  it('sets all numeric styles in the monospace family', () => {
    for (const key of ['dataHero', 'dataLarge', 'data', 'dataSmall', 'label'] as const) {
      expect(type[key].fontFamily, key).toBe(type.data.fontFamily);
    }
  });

  it('sets numbers large — they are the hero of the product', () => {
    expect(type.dataHero.fontSize).toBeGreaterThanOrEqual(48);
    expect(type.dataHero.fontSize).toBeGreaterThan(type.title.fontSize);
  });

  it('uses tight tracking on display type', () => {
    expect(type.moment.letterSpacing).toBeLessThan(0);
    expect(type.display.letterSpacing).toBeLessThan(0);
  });
});

describe('§19 — spacing scale', () => {
  it('is a consistent 4pt scale', () => {
    for (const value of Object.values(space)) {
      expect(value % 4).toBe(0);
    }
  });

  it('ascends', () => {
    const values = Object.values(space);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });
});

describe('§19 — surface language, enforced across the source tree', () => {
  it('uses no drop shadows anywhere', () => {
    for (const file of ALL_SOURCES) {
      expect(file.content, `${file.path} declares a shadow`).not.toMatch(
        /shadowColor|shadowOffset|shadowOpacity|shadowRadius|elevation:\s*[1-9]/,
      );
    }
  });

  it('uses no glassmorphism', () => {
    for (const file of ALL_SOURCES) {
      expect(file.content, `${file.path} uses a blur`).not.toMatch(/BlurView|backdropFilter/);
    }
  });

  it('declares a gradient only in the ECLIPSE sigil and the tier token', () => {
    const allowed = ['src/design/tokens.ts', 'src/design/components/TierSigil.tsx'];
    for (const file of ALL_SOURCES) {
      if (allowed.includes(file.path)) continue;
      expect(file.content, `${file.path} declares a gradient`).not.toMatch(
        /LinearGradient|RadialGradient|linear-gradient/,
      );
    }
  });
});

describe('§20 — accessibility rules', () => {
  it('sets the minimum tap target at 44pt', () => {
    expect(a11y.minTapTarget).toBe(44);
  });

  it('targets WCAG AA', () => {
    expect(a11y.minContrastRatio).toBe(4.5);
    expect(a11y.minContrastRatioLarge).toBe(3.0);
  });
});

describe('§21 — the safety rules hold across the whole source tree', () => {
  it('tracks no calorie, weight or body-composition data', () => {
    // §21: "NO calorie, weight, body-fat, or body-composition tracking, targets,
    // or commentary anywhere in the product."
    //
    // Bodyweight is permitted and necessary — it is a scoring input for
    // bodyweight movements and load ratios — but it is never a target, never
    // graphed, and never commented on. What must not exist is any notion of
    // calories, body fat, or a weight goal.
    const banned = /\b(calorieGoal|calories|kcal|bodyFatP|body_fat|bodyFat|weightGoal|targetWeight|weightTarget|bmi|BMI)\b/;
    for (const file of ALL_SOURCES_CODE_ONLY) {
      expect(file.content, `${file.path}`).not.toMatch(banned);
    }
  });

  it('never references an existing franchise — §3 originality rule', () => {
    // The repository is named after one; no product-facing artifact may be.
    const banned = /solo.?level|shadow.?monarch|sung.?jin|hunter.?association|awakening/i;
    for (const file of ALL_SOURCES_CODE_ONLY) {
      expect(file.content, `${file.path}`).not.toMatch(banned);
    }
  });
});
