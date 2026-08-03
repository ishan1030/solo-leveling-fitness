# 8 · Notification and voice copy bank

The complete bank is `src/data/copy.ts` and is the authority. This document
explains its structure and the rules it is tested against; every line quoted here
is copied verbatim from that file.

**Coach entity: AXIOM.** **Language: English only** at v1.0.

---

## Structure

```
COPY_BANK[trigger][personality] → VoiceLine[]

VoiceLine = { spoken: string, caption: string }
```

**21 triggers × 3 personalities**, every combination populated. `spoken` and
`caption` are separate fields so a line can be phrased differently for TTS
cadence than for the screen; §20 requires that every spoken line has a written
caption and that the app is fully usable on mute.

### The three personalities (§14)

| Personality | Register | Default for |
|---|---|---|
| `CALM_MENTOR` | Supportive, recovery-forward | **Readiness-flagged operators** (§6) |
| `STRICT_TRAINER` | Direct and demanding, never shaming | Everyone else |
| `ELITE_COMMANDER` | Theatrical | Explicit roleplay opt-in only |

§14 requires the Commander opt-in to state plainly that it is roleplay flavour,
not coaching advice.

---

## The safety override

Two triggers ignore the operator's chosen personality entirely:

```ts
const safetyTriggers = ['MEDICAL_STOP', 'INJURY_LOGGED'];
const effective = safetyTriggers.includes(trigger) ? 'CALM_MENTOR' : personality;
```

§21 forbids theatrical framing around a safety event, and §14 states that
ELITE_COMMANDER is explicitly roleplay flavour. An operator who opted into
theatre still gets a plain voice when it matters.

**Tested:** `lineFor('MEDICAL_STOP', 'ELITE_COMMANDER')` must return the
identical string to `lineFor('MEDICAL_STOP', 'CALM_MENTOR')`.

---

## What AXIOM may never say

Enforced by regex over every line in the bank, in `src/data/copy.test.ts`.

**Content filter** — §14: "NEVER prescribes calories, weight targets, body-fat
goals, or fasting. NEVER comments on the user's body or appearance."

```
calorie · calories · kcal · body fat · body composition · weight loss ·
weight goal · weight target · lose weight · fasting · slim · skinny ·
lean out · toned · shred · bulk · beach body · six-pack · physique ·
looks good · attractive
```

**Tone filter** — §21: "Motivational copy never uses shame, guilt, ultimatums, or
appearance references."

```
pathetic · weak · lazy · excuse · shame · ashamed · disappoint · failure ·
you failed · loser · embarrass · don't lose · last chance · or else
```

Both filters also run over `STATIC_COPY`, and a separate filter runs over the
streak copy in `src/engine/streaks.ts`.

---

## The moments the voice owns (§14)

### Tier-up

| Personality | Line |
|---|---|
| Calm | "{tier}. That is a real change in what your body can do. Take a moment with it." |
| Strict | "{tier}. Earned, verified, recorded. Next tier is already in range." |
| Commander | "{tier}. The board just moved. Everyone below you noticed." |

### Tier-down

Tested to contain none of `lost`, `losing`, `demot`, `dropped`, `fell`, `failed`.

| Personality | Line |
|---|---|
| Calm | "Your tier reads {tier} this week. Capability moves in both directions. That is what makes it honest." |
| Strict | "{tier} this cycle. The number reflects the last few weeks. Change the weeks, change the number." |
| Commander | "{tier} this cycle. The ladder does not care about last month. Neither should you. Climb." |

### Level-up

| Personality | Line |
|---|---|
| Calm | "Level {level}. That is time and consistency, and it counts on its own terms." |
| Strict | "Level {level}. Volume banked. Keep the sessions coming." |
| Commander | "Level {level}. Mileage on the clock, Operator." |

### Anomaly discovered

| Personality | Line |
|---|---|
| Calm | "You found something. {value}. Most operators never trip this one." |
| Strict | "Anomaly. {value}. That was earned by behaviour, not by asking." |
| Commander | "Anomaly detected. {value}. Very few find this." |

**Anomaly reveal copy** (from `src/engine/quests.ts`):

| Anomaly | Reveal |
|---|---|
| DAWN PATROL | "Five sessions before six in the morning. Most operators never see this one." |
| NOMAD | "Three different venues inside a month. You train wherever you land." |
| HELD THE LINE | "Three rival weeks won back to back. Someone out there has noticed." |
| IRON WEEK | "Every scheduled session logged, every day, for a full week." |
| LONG HAUL | "Ninety days of continuous training. This is where capability actually changes." |

### Raid complete

| Personality | Line |
|---|---|
| Calm | "Raid complete. All {count} of you logged your portion. That is the whole point of it." |
| Strict | "Raid complete. {count} operators, every portion logged. Nobody carried anybody." |
| Commander | "Raid complete. {count} operators, one clean run. The counter just ticked." |

### Raid abandoned

Tested against `/abandoned you|let.*down|quit|bailed/i`.

| Personality | Line |
|---|---|
| Calm | "Raid closed early. Everything you logged still counts as a normal session. People have lives." |
| Strict | "Raid closed early. Your portion is logged and scored as a solo session. Move on." |
| Commander | "Raid stood down. Your work is on the record regardless. Regroup." |

### Season start / close

| Trigger | Strict line |
|---|---|
| Start | "Season {season}. Thirteen weeks on the clock. Ladder starts level; you do not." |
| Close | "Season {season} closed. Finished at {tier}. Archived, permanent, unarguable." |

### Rival result

| Outcome | Strict line |
|---|---|
| Won | "You beat {rival} on {pillar} this week. Do it again." |
| Lost | "{rival} took this one on {pillar}. Seven days to answer it." |
| Draw | "Drawn with {rival}. Split points. Settle it next week." |

### Streak milestone

Encouraging only. Never "don't lose it."

| Personality | Line |
|---|---|
| Calm | "{streak} sessions. Consistency is a pillar here for exactly this reason." |
| Strict | "{streak} sessions logged. That is the habit doing its job." |
| Commander | "{streak} sessions on the record, Operator." |

### New PR

| Personality | Line |
|---|---|
| Calm | "New best: {value}. Your body did something today it had not done before." |
| Strict | "{value}. New personal record. That number is the new floor." |
| Commander | "{value}. Personal record. Nobody can take that one." |

### Trust cap reached (§6)

The cap must read as an invitation, never a punishment.

| Personality | Line |
|---|---|
| Calm | "Your score is worth {tier}, but self-reported profiles cap at COBALT. One verified session at any partner venue unlocks the rest." |
| Strict | "You are scoring {tier} and being shown COBALT. That gap closes the moment you scan into a real gym." |
| Commander | "{tier} on the numbers. COBALT on the board. The top of this ladder is verified only — that is what makes it worth standing on." |

### Injury logged (§16, §21)

Calm register regardless of chosen personality.

> "Logged. Your streak is paused and your rank is frozen where it is. Take the
> time you need."

### Medical stop (§21)

Identical across all three personalities. This one is not a performance.

> "Stop training now and speak to a doctor. This is not something to push
> through. Your rank and your record are safe and will be here afterwards."

---

## Streak copy (§16)

From `src/engine/streaks.ts`. Enforced by `FORBIDDEN_STREAK_LANGUAGE`, which is
exported specifically so a future edit reintroducing "don't lose your streak!"
fails the test suite.

| Event | Copy |
|---|---|
| Started | "Session one. That is the streak started." |
| Extended | "{n} sessions deep." |
| Held by rest day | "{n} sessions deep." |
| Held by freeze | "Streak freeze used, and it held. {n} and counting. You get another one next month." |
| **Reset** | **"New streak starts today. Session one."** |
| Paused (injury) | "Streak paused at {n}. It stays there until you tell us otherwise. Recover properly." |
| Paused (illness) | "Streak paused at {n}. Rest is the training right now." |
| Resumed | "Back in. Streak picks up at {n}, exactly where you left it." |

**The reset line does not name the lost number.** There is a test asserting this
specifically. Naming what was lost *is* loss-framing, which §16 forbids — so the
copy simply starts counting again.

---

## Free-tier notification gating (§14)

```
medicalStopActive   → suppressed_medical_stop   (§21, all operators)
within quiet hours  → quiet_hours               (all operators, incl. premium)
free && sentToday ≥ 2 → daily_cap_reached
otherwise           → send
```

- **Maximum 2 per day** for free operators
- **Quiet hours 21:00 – 07:00** local, handling the overnight wrap
- Quiet hours apply to premium too — paying does not buy the right to wake someone

---

## Static copy carrying a spec obligation

| Key | Obligation |
|---|---|
| `medicalDisclaimer` | §21 persistent, plain-language, not-medical-advice |
| `privacyLocation` | §10 location policy, in-product, plain language |
| `levelVersusTier` | §5 tension, honest not punishing |
| `trustCapExplainer` | §6 cap, framed as an invitation |
| `fairnessPromise` | §18 fairness rule, stated to the user |
| `streakPhilosophy` | §16 rest never costs anything |

**The fairness promise, verbatim:**

> Nothing on the store page affects your rank. No XP multipliers, no stat boosts,
> no ladder points, no faster verification. Subscriptions buy voice coaching,
> analytics and cosmetics. The ladder is performance only.

**The level/tier explainer, verbatim:**

> Level is what you have invested. Tier is what you can do right now. They move at
> different speeds on purpose — a high level with a lower tier means you have put
> in real time and your capability is still catching up. Both are true.

---

## TTS implementation (§14)

| Aspect | Decision |
|---|---|
| Engine | On-device TTS (`expo-speech`), downloadable voice packs |
| Offline | Cached generic lines play; personalised lines queue until reconnection |
| Captions | Every line, always. `caption` is a required field. |
| Mute | Fully usable. Captions are not an accessibility afterthought — they are the primary channel. |
| On lapse | Voice reverts to text. History stays readable. Nothing earned is removed. |
