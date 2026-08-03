# 12 · Rank card layout specification, per tier

> "Design these cards as if they are the app's poster. They are." — §13

Implemented in `src/screens/RankCard.tsx`.

---

## Contents (§13)

Every card carries, always:

| Element | Treatment |
|---|---|
| Tier sigil | **Dominant.** Size and alignment vary by tier. |
| Operator name | 22pt title, `ink` |
| Level | 11pt mono label, muted |
| Four pillar bars | Labelled, valued, tier-coloured fill |
| Power score | **64pt monospace**, tier colour — the largest element after the sigil |
| Verification badge | `VERIFIED` or `UNVERIFIED`, stated plainly on the card |
| Venue or city | 11pt mono label |
| Season | 11pt mono label |
| Scannable invite code | Bottom-right, with the code in text beneath |

---

## Sizes

| Format | Dimensions | Use |
|---|---|---|
| Story | 1080 × 1920 | Instagram Story |
| Square | 1080 × 1080 | Instagram feed |
| Status | 1080 × 1920 | WhatsApp status |

The card is authored at **4:5** and letterboxed by the export pipeline onto each
target, so one layout serves all three without reflowing. Letterbox fill is
`palette.base`, which reads as intentional on every platform that renders a dark
surround.

---

## Per-tier composition

> §13: "Visually distinct per tier — an ECLIPSE card must look categorically
> different from an ASH card, **not just recoloured**."

Four properties vary. Colour is the *least* of them.

| Tier | Sigil size | Sigil alignment | Framing rules | Tier label |
|---|---|---|---|---|
| ASH | 72 | left | 1 | `display` 34pt |
| IRON | 88 | left | 2 | `display` 34pt |
| COBALT | 104 | left | 3 | **`moment` 56pt** |
| STORM | 128 | **centre** | 4 | `moment` 56pt |
| SOLAR | 152 | centre | 5 | `moment` 56pt |
| ECLIPSE | **188** | centre | **7** | `moment` 56pt |

### What each tier reads as

**ASH** — sparse and bottom-weighted. A small sigil, left-aligned, a single
framing rule. Deliberately quiet: it should look like the start of something, and
it should make the higher cards look earned by comparison.

**IRON** — the same left-aligned composition, marginally denser. The progression
from ASH is visible when the two sit side by side, which is the point: an ASH
operator has seen what IRON looks like.

**COBALT** — the first tier where the label goes monumental (56pt). This is the
trust-cap ceiling, so it is the card the largest number of operators will hold.
It has to feel like an achievement while still visibly sitting below the
verified tiers.

**STORM** — the composition **switches to centred**. This is the single biggest
visual break in the ladder, and it is placed exactly at the verified-only
threshold. A centred card means the operator scanned into a real gym.

**SOLAR** — centred, large, five rules. Warm amber against near-black. The card
starts to read as a poster rather than a profile.

**ECLIPSE** — 188px sigil, seven concentric framing rules, and the only
iridescent gradient in the product. The sigil alone occupies more than a third of
the card height. Structurally different from every other card, matching §3's
requirement that seeing one in the wild is an event.

---

## Layout, 4:5 canvas

```
┌────────────────────────────────────────────┐
│ ═══════════════════════════════════════   │ ← framing rules, count by tier
│ ═══════════════════════════════════════   │   4pt apart, opacity −0.12 each
│                                            │
│ MERIDIAN · SEASON 3          VERIFIED      │ ← 11pt mono, muted / tier colour
│                                            │
│                                            │
│                  ◈◈◈                       │ ← sigil, size and alignment by tier
│                 ◈◈◈◈◈                      │
│                  ◈◈◈                       │
│                                            │
│                 STORM                      │ ← 56pt display, tier colour
│                                            │
│                                            │
│ Sunita Karki                               │ ← 22pt title, ink
│ LEVEL 47 · BHARATPUR                       │ ← 11pt mono, muted
│                                            │
│ STRE ████████████████░░░░░░░░░░░  82       │ ← 2pt track, tier-coloured fill
│ ENDU ██████████████████░░░░░░░░░  88       │
│ CONS ██████████████████░░░░░░░░░  90       │
│ MOBI ██████████████░░░░░░░░░░░░░  70       │
│                                            │
│ POWER SCORE                    ▓░▓░▓       │
│ 84.0                           ░▓░▓░       │ ← 64pt mono / scan code
│                                ▓░▓░▓       │
│                                A7K2M9Q     │ ← 12pt mono
└────────────────────────────────────────────┘
```

**Framing rules** are positioned absolutely from the top, 4pt apart, each 12%
more transparent than the last. Density carries tier information independently of
colour — which is also why an ECLIPSE card is recognisable in a monochrome
screenshot.

---

## The scan code

§13: "Scanning the code opens calibration for the new user with a referral
attached."

**Current implementation** is a deterministic 9×9 block code derived from the
invite string via an FNV hash, so each operator's card is visually unique rather
than showing a static placeholder square.

**Production** substitutes a real QR encoder. The visual footprint and quiet zone
are identical, so the card layout does not change when it is swapped in.

The invite code is rendered as text beneath the block, so the referral works even
from a photograph of a screen — which, in the launch market, is a meaningful share
path.

---

## Watermarking

§13: "No app-name watermark clutter; one clean mark plus the scan code."

The only branding is `MERIDIAN · SEASON {n}` in 11pt mono at the top-left, at
muted contrast. There is no logo lockup, no corner badge, no URL, and no "made
with" strip.

The reason is commercial rather than aesthetic: a card that looks like an ad does
not get posted, and a card that does not get posted does not acquire anyone. The
scan code is the acquisition mechanism; the restraint is what gets it seen.

---

## Generation triggers (§13)

Cards are auto-generated at:

| Trigger | Card |
|---|---|
| Calibration complete | Rank card with UNVERIFIED status |
| Every tier-up | Rank card at the new tier |
| Season end | Season card with placement and titles |
| New PR | PR card — the number, the movement, the date |
| Raid complete | Group card with every participant's sigil |
| On demand | Rank card, from the profile |

---

## Verification on the card

The status is stated in the header, in the tier colour for verified operators and
in `alert` for unverified ones.

This is deliberate and slightly uncomfortable: an unverified operator shares a
card that says UNVERIFIED. That is the point. §2 FAILURE 2 is defeated by making
trust legible everywhere the rank is legible — including, and especially, on the
artifact that leaves the app.

---

## Referral reward (§13)

> "Referrer reward: cosmetic only. Never ladder points."

Stated in-product on the rank card screen:

> Anyone who scans this code starts their own calibration with your referral
> attached. You get a cosmetic for it — never ladder points.

This is the §18 fairness rule reaching the acquisition loop. A referral bonus that
moved the ladder would let a popular operator out-rank a stronger one, which
breaks the only claim the product makes.

---

## Accessibility (§20)

The whole card is a single accessible element with a composed label:

> "Rank card. Sunita Karki, STORM tier, level 47, power score 84.0, verified."

Reading each bar and number separately would produce a stream of disconnected
fragments. The card is one artifact and it announces as one.
