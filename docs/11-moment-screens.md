# 11 · The five moment screens, frame by frame

§19: each moment gets a distinct sound signature, a haptic pattern, and an
auto-generated shareable card.

**§20 applies to all five:** every one is skippable from frame one, and under
`prefers-reduced-motion` every stage resolves to its final value immediately —
the content is always delivered, only the transition is removed.

---

## 1 · CALIBRATION REVEAL

> "stats resolving, sigil forming last"

**Implemented:** `src/screens/Reveal.tsx`

| Time | Frame |
|---|---|
| 0 ms | Black. A single 40×2 `signal` rule, centred. SKIP already present, top-right. |
| 200 ms | `CALIBRATION COMPLETE` cuts in — no fade. 11pt mono, 1.6 tracking, muted. |
| 300 ms | Operator name, 34pt display, `ink`. |
| 400 ms | STRENGTH label appears; its number begins ticking 0 → value over 900 ms. |
| 550 ms | ENDURANCE begins. |
| 700 ms | CONSISTENCY begins. |
| 850 ms | MOBILITY begins. |
| 1 600 ms | `POWER SCORE` label. The CPS ticks 0 → value at **64pt monospace** in the tier colour. This is the largest number the app ever renders. |
| 2 400 ms | **Sigil strokes on** over 500 ms, cubic-bezier(0.2, 0, 0, 1). Haptic: `NotificationFeedbackType.Success`. |
| 2 900 ms | Tier name, 56pt display, tier colour. |
| 3 000 ms | `LEVEL 1 · UNVERIFIED` — the verification status is stated on the money frame, not buried. |
| 3 400 ms | Trust-cap notice, readiness banner if flagged, AXIOM's line, and `Save my rank`. |

**Sound:** low sustained tone from 0 ms, rising in pitch as each pillar resolves,
resolving to the tier's signature chord at 2 400 ms as the sigil strikes.

**Haptic:** a light tick per pillar resolution, then a success notification on the
sigil.

**Card:** the rank card is generated here. §4 — the user has something to lose
*before* the account exists.

**The design intent.** The sigil comes last because it is the answer. Everything
before it is the working. A reveal that leads with the badge is a lottery result;
a reveal that shows the arithmetic and *then* the badge is a measurement.

---

## 2 · TIER-UP

> "sigil shatters and reforms in the new tier's colour and sound"

| Time | Frame |
|---|---|
| 0 ms | Current sigil, centred, at rest, current tier colour. |
| 150 ms | Sigil **fractures** — the SVG paths separate along their own construction lines and drift outward 12–20px. No rotation, no bounce. |
| 400 ms | Fragments hold, dimmed to 40%. Background hairlines sweep outward on one axis. |
| 600 ms | Fragments **collapse inward**, recolouring to the new tier mid-flight. |
| 850 ms | Reformed sigil lands. Haptic: heavy impact. Sound: new tier's signature. |
| 900 ms | New tier name ticks in beneath, 56pt. |
| 1 100 ms | CPS readout ticks from old to new value. |
| 1 400 ms | AXIOM's tier-up line, with caption. Share and Continue. |

**Fracture is along construction lines**, not a generic shatter: an IRON bar
splits into its bar and two tolerance marks; a SOLAR ring separates into ring,
core and eight ticks. Each tier's break is its own, which makes a tier-up feel
specific to the tier you left.

**ECLIPSE arrival is different.** The iridescent gradient sweeps across the
fragments during the collapse, and the corona rings expand past the frame edge.
§3: "ECLIPSE should be visually rare enough that seeing one in the wild is an
event."

**Tier-down uses none of this.** No fracture, no set piece. The new tier is
stated on a panel with the §14 copy. §21 forbids ceremonial loss-framing — a
demotion is information, not a cutscene.

---

## 3 · NEW PR

> "the number itself is the animation"

| Time | Frame |
|---|---|
| 0 ms | The set's numbers sit at `dataLarge` (32pt) in the log row. |
| 100 ms | The row's other content fades to 15%. The number does not move. |
| 250 ms | The number **scales to 64pt in place** — it grows from where it already is rather than transitioning to a new screen. |
| 400 ms | An `alert`-coloured hairline draws left-to-right beneath it, 200 ms. |
| 600 ms | `PERSONAL RECORD` in 11pt mono above. Haptic: medium impact. |
| 750 ms | The previous best appears beneath, struck through, muted. |
| 1 000 ms | AXIOM's PR line. Share card auto-generated. |

**No confetti. No burst. No badge.** The number *is* the animation, exactly as
§19 states. This is the moment where the industrial-futurist direction earns its
keep: a PR in this app looks like an instrument registering a new maximum, not
like a slot machine paying out.

**Sound:** a single sharp mechanical click at 250 ms. Nothing else.

---

## 4 · RAID COMPLETE

> "all participants' sigils resolving together"

| Time | Frame |
|---|---|
| 0 ms | 2–6 sigil placeholders arranged on an arc, all dimmed to 25%. |
| 200 ms | Each participant's sigil resolves **in the order they logged their portion**, 180 ms apart. |
| — | The last to resolve gets a slightly longer hold. Not a penalty — an acknowledgement that the raid was waiting on them and they came through. |
| 1 200 ms | Connecting hairlines draw between adjacent sigils along the arc, 300 ms. |
| 1 500 ms | The party multiplier ticks up: `1.0× → 1.54×`, monospace, `signal`. |
| 1 700 ms | Pillar diversity is named beneath: `STRENGTH · ENDURANCE · MOBILITY`. |
| 1 900 ms | Pair streak counters increment for each pairing. Haptic: one light tick per pairing. |
| 2 200 ms | Boss raids only: global completion counter ticks in. |
| 2 400 ms | AXIOM's raid line. Group share card. |

**Why the arc.** Everyone is on the same curve at the same radius. There is no
leader position and no ranking within the party — §9's design is that nobody can
carry anybody, so the visual gives nobody a top slot.

**Sound:** each sigil resolution plays *that operator's tier signature*, so a
mixed-tier party produces a chord that a matched party does not. The reward for
pillar diversity is audible.

**Abandoned raids get no set piece.** A plain panel, the no-penalty copy, and the
solo credit each operator kept.

---

## 5 · SEASON CLOSE

> "career timeline extending by one entry"

| Time | Frame |
|---|---|
| 0 ms | The existing career timeline, horizontal, one node per past season, scrolled to the right edge. |
| 300 ms | The timeline **scrolls left**, making room. Single axis, 400 ms. |
| 700 ms | A new node draws in: tier sigil at 40px, season number beneath. |
| 900 ms | Final stats tick into the node: tier, level, CPS, placement. |
| 1 300 ms | Titles earned this season slide in beneath, one per 150 ms. |
| 1 600 ms | The connecting hairline draws from the previous node to the new one. **This is the emotional beat** — the line, not the node. |
| 1 900 ms | Next season's starting tier is stated: `STARTS NEXT SEASON AT STORM`. |
| 2 100 ms | The §17 persistence list: level, XP, pillars, achievements, titles, guild, rivalries — all shown as **carried**, not reset. |
| 2 400 ms | AXIOM's season-close line. Season card. |

**Why the connecting line is the beat.** A season close in most games reads as a
loss — the ladder resets, the placement evaporates. Here the animation is
literally a line being drawn from your past to your present. The soft reset costs
exactly one tier; the timeline costs nothing and only ever grows.

**Sound:** a low mechanical seat, like a component being locked into a rack. The
archive is append-only, and it should sound like it.

---

## Cross-cutting specification

### Sound signatures

| Tier | Character |
|---|---|
| ASH | Low, dry, unresonant |
| IRON | Struck metal, short decay |
| COBALT | Struck metal, long decay, minor interval |
| STORM | Two-tone, dissonant attack resolving |
| SOLAR | Full major chord, warm |
| ECLIPSE | Chord with a detuned overtone — audibly *odd*, and rare |

### Haptic patterns

| Moment | Pattern |
|---|---|
| Calibration reveal | Light tick × 4 (pillars), then success notification |
| Tier-up | Light × 3 (fracture), heavy × 1 (reform) |
| New PR | Medium × 1 |
| Raid complete | Light × party size, then success |
| Season close | Light × 1 at the connecting line |

### Reduced motion

| Moment | Reduced-motion behaviour |
|---|---|
| Reveal | All values present immediately; sigil at full opacity |
| Tier-up | New sigil replaces old with no fracture |
| PR | Number at 64pt immediately |
| Raid | All sigils lit immediately; multiplier at final value |
| Season close | New node present; no scroll |

In every case the full content is delivered. §20 requires the transition to go,
not the information.

### Auto-generated cards

Each moment produces a shareable card at the §13 dimensions. Card layout per tier
is in [12-rank-card-spec.md](12-rank-card-spec.md).
