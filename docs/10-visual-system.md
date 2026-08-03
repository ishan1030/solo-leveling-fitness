# 10 · Visual system

> **Direction:** industrial-futurist, not neon-anime. Mission-control
> instrumentation and precision equipment rather than glowing blue holograms.
> The app should look like a serious instrument that happens to be beautiful.

Implemented in `src/design/tokens.ts`. Rules enforced by source scan in
`src/data/design.test.ts`.

---

## Palette

| Token | Hex | Role | Contrast on base | Contrast on surface |
|---|---|---|---|---|
| `base` | `#0A0B0D` | Near-black, slightly warm | — | — |
| `surface` | `#141619` | Raised panels | 1.09 | — |
| `surfaceRaised` | `#1B1E22` | Nested panels | 1.18 | 1.08 |
| `ink` | `#F2F3F5` | Primary text | **17.73** | **16.33** |
| `muted` | `#7C8289` | Secondary text | **5.07** | **4.67** |
| `hairline` | `#242830` | Borders, dividers | 1.33 | 1.23 |
| `signal` | `#00E0B8` | Progress, confirmation, live state | **11.58** | **10.66** |
| `alert` | `#FF5A3C` | PRs, tier-ups, urgency | **6.36** | **5.85** |

Every text pairing clears WCAG AA (4.5:1) including the secondary muted grey on
the raised surface, which is the tightest pairing in the system at 4.67:1. These
ratios are computed, not estimated — `contrastRatio()` implements WCAG 2.1 and is
asserted in the test suite.

### Tier colours

| Tier | Hex | Character | Contrast on base |
|---|---|---|---|
| ASH | `#8A8377` | Warm grey | 5.24 |
| IRON | `#8E99A6` | Cold steel | 6.80 |
| COBALT | `#2F6BE0` | Deep blue | 4.03 |
| STORM | `#7B5BE8` | Violet | 4.22 |
| SOLAR | `#F2A93B` | Amber | 9.86 |
| ECLIPSE | *iridescent* | **The only gradient in the app** | 13.38 |

Tier colours are used at display size or as borders, so the applicable threshold
is AA-large (3.0:1). All six clear it; four clear full AA as well.

**ECLIPSE gradient stops:** `#7B5BE8 → #00E0B8 → #F2A93B → #C9D6E8`.

No other gradient exists anywhere. `src/data/design.test.ts` scans every
`.ts`/`.tsx` file in `src/` and fails on a `LinearGradient`, `RadialGradient`, or
`linear-gradient` outside `tokens.ts` and `TierSigil.tsx`.

---

## The six sigils

Original geometric marks built from **instrument geometry** — dial markings,
tolerance bands, aperture rings — rather than the heraldic or arcane vocabulary
the genre defaults to. §3 forbids imitating any existing property's visual
identity, and this is where that rule lives.

| Tier | Shape | Reading |
|---|---|---|
| ASH | `ash_scatter` | Four scattered marks of decreasing size settling toward a baseline. The beginning of something, not yet consolidated. |
| IRON | `iron_bar` | One solid bar between two tolerance marks. The scatter has become one thing. |
| COBALT | `cobalt_chevron` | Double chevron. The first mark that points somewhere. |
| STORM | `storm_fork` | A discharge fork crossing a measured horizontal plane. |
| SOLAR | `solar_ring` | A closed aperture ring with eight radial ticks. The first sigil that closes — a complete system. |
| ECLIPSE | `eclipse_occult` | One disc occulting another, corona escaping around the edge. **Structurally different from every other sigil: the only one built from overlap.** |

**§20 compliance:** each shape is distinguishable in monochrome. `TierSigil`
takes a `monochrome` prop, and colour is therefore never the sole carrier of
tier — sigil, colour and label always travel together.

**Authoring:** all six are drawn on a 100×100 grid and scaled by SVG `viewBox`,
so a sigil is geometrically identical at 16px in a ladder row and at 320px on a
rank card.

---

## Typography

| Role | Family | Notes |
|---|---|---|
| Display | Wide geometric sans, tight tracking | Tiers and moments |
| UI | Neutral grotesque | Everything else |
| **Data** | **Monospace** | **All numbers, stats, timers, system readouts** |

> "Numbers are the hero of this product. Set them large, set them monospace, let
> them breathe."

### Scale

| Token | Size | Tracking | Line height | Family |
|---|---|---|---|---|
| `moment` | 56 | −1.5 | 60 | display |
| `display` | 34 | −0.8 | 38 | display |
| `title` | 22 | −0.2 | 28 | ui |
| `body` | 16 | 0 | 24 | ui |
| `small` | 13 | +0.1 | 18 | ui |
| **`dataHero`** | **64** | **−2.0** | 66 | **data** |
| `dataLarge` | 32 | −0.5 | 36 | data |
| `data` | 16 | 0 | 22 | data |
| `dataSmall` | 12 | +0.4 | 16 | data |
| `label` | 11 | **+1.6** | 14 | data |

`dataHero` at 64px is the largest type in the system — larger than `moment` — 
which is the typographic statement of the whole product: the number is the point.

**Font licensing.** v1.0 ships with platform system faces (Avenir Next Condensed
/ sans-serif-condensed for display, Helvetica Neue / sans-serif for UI, Menlo /
monospace for data) so launch carries no font-licensing dependency. The intended
licensed families are listed in [14-open-questions.md](14-open-questions.md) as a
decision to confirm, not a gap.

---

## Spacing

4pt base scale. Asserted: every value is a multiple of 4 and the scale ascends.

| Token | Value |
|---|---|
| `xxs` | 4 |
| `xs` | 8 |
| `sm` | 12 |
| `md` | 16 |
| `lg` | 24 |
| `xl` | 32 |
| `xxl` | 48 |
| `xxxl` | 72 |

Radii: `none 0 · sm 2 · md 4 · lg 8 · pill 999`. The system is deliberately
sharp — `md` (4) is the default, and nothing above `lg` (8) appears outside a
pill badge.

---

## Surface language

> "Thin 1px borders, generous negative space, hairline dividers, subtle grain
> over dark surfaces, and a single accent per screen. No drop shadows. No
> glassmorphism. No purple gradient buttons."

| Rule | Implementation | Enforcement |
|---|---|---|
| Hairline borders | `surface.hairlineWidth` = 0.5 native, 1 web | — |
| **No drop shadows** | — | Source scan for `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`, `elevation: [1-9]` |
| **No glassmorphism** | — | Source scan for `BlurView`, `backdropFilter` |
| **One gradient only** | ECLIPSE sigil | Source scan for gradient constructors |
| Grain | `surface.grainOpacity` = 0.035 | — |
| One accent per screen | `Panel accent` prop, used sparingly | Review |

**Why 0.5 rather than 1.** On a 3× screen a 1pt border renders as three physical
pixels and reads as a heavy rule, which loses the instrument feel entirely. 0.5pt
gives a true hairline on native and falls back to 1 on web where subpixel borders
are unreliable.

**Why the scans exist.** "We agreed not to use shadows" survives about two
sprints. A filesystem scan in CI survives the project.

---

## Motion

> "Fast and mechanical: 150–250ms, custom ease, never bouncy. Numbers tick rather
> than fade. Panels slide on one axis. Everything feels like a machine
> responding."

| Token | Duration | Use |
|---|---|---|
| `instant` | 100 ms | State toggles |
| `fast` | 150 ms | Press feedback |
| `base` | 200 ms | Panel transitions |
| `slow` | 250 ms | Bar fills |
| `moment` | 1 200 ms | The five set pieces only |

**Easing:** `cubic-bezier(0.2, 0, 0, 1)` — sharp attack, hard settle.

Deliberately **not a spring**. Springs overshoot, and an instrument that
overshoots reads as imprecise. Nothing in this app bounces.

**Numbers tick.** `TickingNumber` counts up digit by digit rather than
crossfading, because a readout that fades looks like a label and a readout that
counts looks like an instrument. Under reduced motion it renders the final value
immediately.

---

## Component library

`src/design/components/index.tsx`

| Component | Purpose | Accessibility |
|---|---|---|
| `Screen` | Base scaffold, 24pt horizontal padding | — |
| `Panel` | Bordered surface, optional single accent edge | — |
| `SectionLabel` | 11pt mono, 1.6 tracking, uppercase | `role="header"` |
| `Divider` | Hairline | — |
| `TickingNumber` | Counting numeric readout | Announces the final value, not intermediates |
| `PillarBar` | Animated 0–100 bar with delta chip | One `progressbar` node carrying name, value and delta |
| `TierBadge` | Dot + label | Labelled `"{tier} tier"` |
| `TierSigil` | The six marks | `role="image"`, labelled |
| `Button` | 4 variants | ≥44pt, `role="button"`, disabled state |
| `Notice` | info / caution / **stop** | `role="alert"` |
| `Stat` | Label + monospace value | Labelled `"{label}: {value}"` |
| `useReducedMotion` | §20 hook | — |

**A note on `PillarBar`.** It renders as a *single* accessible node carrying the
pillar name, its value and any delta. Three separate nodes would be read by a
screen reader as disconnected fragments — "Strength", "62.4", "plus 1.2" — which
is technically labelled and practically useless.

---

## Accessibility (§20)

| Requirement | Implementation |
|---|---|
| WCAG AA throughout, including dark theme | Computed and asserted for every pairing |
| Full screen-reader labelling | Handled at the component layer, so a screen cannot ship an unlabelled stat |
| `prefers-reduced-motion` | `useReducedMotion`; every set piece resolves to its final value, content still delivered |
| Every voice line captioned | `VoiceLine.caption` is a required field |
| Every cinematic skippable | SKIP present from frame one, not after |
| Colour never the sole carrier | Sigil + colour + label, always together |
| Minimum 44pt tap targets | `a11y.minTapTarget`, applied in `Button` and every pressable |
| One-handed reachability | Logging controls sit in the lower two-thirds of the session screen |
