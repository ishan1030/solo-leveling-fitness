# MERIDIAN

**A verified fitness progression ladder.**

> The only fitness ladder where your rank is earned in a real gym and can't be
> faked.

React Native (iOS + Android). Free core, optional subscription, optional seasonal
pass. Built to the master specification in
[`docs/`](docs/01-overview-and-core-loop.md).

> **Note on the repository name.** This repo is named `solo-leveling-fitness`.
> §3 of the specification forbids that vocabulary in any product-facing artifact,
> and a source scan enforces it inside `src/`. **The repository should be renamed
> before it is public** — see
> [open questions A3](docs/14-open-questions.md#a3--repository-name).

---

## Quick start

```bash
npm install
npm test          # 426 tests
npm run typecheck
npm start         # Expo
```

Verified to bundle: `npx expo export --platform ios` produces a 748-module
Hermes bundle.

---

## What this is

A complete v1.0 build: the progression engine, calibration, logging, quests,
raids, rivals, verification, ladders, territory, seasons, entitlements, a design
system, **52 of the 59 specified screens plus all five moment screens**, and the
full specification.

The 7 unbuilt screens are listed in
[the screen inventory](docs/03-screen-inventory.md#build-status) with what each
is blocked on. Their engines are complete and tested — what is missing is the
screen, not the logic.

**Confirmed decisions:** MODE `BUILD` · coach entity **AXIOM** · **English only**
· working name **MERIDIAN**.

**Not confirmed, not invented:** pricing. See
[open questions](docs/14-open-questions.md).

---

## Architecture

```
src/
├── engine/          Pure TypeScript. No React, no network, no clock reads
│   ├── types.ts         Domain types, tier and verification scales
│   ├── config.ts        Every tunable number, as data, with invariant checks
│   ├── progression.ts   CPS, tiers, XP, decay, weekly re-evaluation
│   ├── calibration.ts   Published lookup tables, readiness resolution
│   ├── scoring.ts       Set → pillar points; implausible-input detection
│   ├── quests.ts        Daily, weekly, anomaly, trial generation
│   ├── raids.ts         Reward scaling, anti-abuse, drop-out handling
│   ├── rivals.ts        Matchmaking, weekly head-to-head
│   ├── verification.ts  QR check-in, anti-cheat, appeals
│   ├── seasons.ts       13-week cycle, partial reset, pass, archive
│   ├── streaks.ts       Rest days, freezes, injury pauses
│   ├── ladder.ts        Board construction, §10 filtering, §12 territory
│   ├── records.ts       PR detection per movement and metric, history series
│   ├── coach.ts         AXIOM: next session, recovery, ≤5%/week progression
│   ├── guilds.ts        Roster rules, per-member contribution cap, guild quests
│   └── entitlements.ts  The §18 fairness rule, enforced by the type system
├── data/            Exercise library (302), AXIOM copy bank, rule tests
├── design/          Tokens and components
├── nav/             Tab bar
├── screens/         Calibration · reveal · home · session · check-in · ladder
│                    social · profile · season · rank card · records ·
│                    coach · territory · trials · moments · safety
└── state/           store.ts   operator state, persisted, offline-first
                     world.ts   server-cached ladder/venues/raids, not persisted
```

**The engine imports nothing from React Native and reads no clock** — every
function that needs the time takes `now` as an argument. That is what makes the
ladder auditable: any number a user sees can be recomputed from stored inputs and
replayed in a test.

---

## Rules enforced by the type system, not by convention

Three specification rules are load-bearing enough that comments were not
sufficient.

**1 · No competitive advantage can be sold** (§18)

```ts
type Capability = FreeCapability | PaidCapability;   // CompetitiveCapability absent
export function entitlementsFor(state, now): Set<Capability>
```

Selling an XP multiplier would not typecheck. A runtime audit
(`assertNoCompetitiveAdvantageIsSold`) also runs at app start.

**2 · Implausible progression is never auto-punished** (§10)

```ts
interface ReviewFlag { autoPunished: false; }   // literal type
```

**3 · Nothing earned is removed on a lapsed subscription** (§14)

```ts
interface LapseOutcome {
  coachingHistoryRemainsReadable: true;
  earnedContentRemoved: false;
  ladderPositionAffected: false;
}
```

---

## Rules enforced by tests

| Rule | Test |
|---|---|
| A perfect self-reported calibration still caps at COBALT | `progression.test.ts` |
| Two identical "completed" sessions gain different amounts | `systems.test.ts` |
| A mixed-pillar raid pair out-earns a matched pair | `systems.test.ts` |
| No raid can complete with one participant unlogged | `systems.test.ts` |
| WCAG AA contrast for every palette pairing and tier colour | `design.test.ts` |
| **No drop shadow, blur, or gradient outside the ECLIPSE sigil** | `design.test.ts` (source scan) |
| No calorie, body-fat or weight-goal identifier anywhere | `design.test.ts` (source scan) |
| No franchise reference anywhere in `src/` | `design.test.ts` (source scan) |
| No shame or appearance language in any AXIOM line | `copy.test.ts` |
| Streak reset copy never names the lost number | `systems.test.ts` |
| Every documented worked example matches the engine | `worked-examples.test.ts` |
| A filtered operator never occupies a leaderboard rank slot | `ladder.test.ts` |
| Unverified operators contribute nothing to venue territory | `ladder.test.ts` |
| Calories may be named only inside a negation | `design.test.ts` (source scan) |
| A flagged set can never set a personal record | `records.test.ts` |
| Equalling a previous best is not a record | `records.test.ts` |
| An injured session still credits the sets completed before stopping | `systems.test.ts` |
| Load never rises >5% in a week, at any load from 20 to 300 kg | `coach.test.ts` |
| A progression step changes at most one variable | `coach.test.ts` |
| A deload lands every 4th week and cannot be skipped | `coach.test.ts` |
| AXIOM never prescribes calories, weight or fasting, in any configuration | `coach.test.ts` |
| One power user cannot carry a guild roster | `guilds.test.ts` |
| Past the cap, only recruiting raises a guild's contribution | `guilds.test.ts` |

The source scans exist because "we agreed not to use drop shadows" survives about
two sprints, and a filesystem check in CI survives the project.

---

## The four failures, and where each is defeated

Full table with test names: [`docs/02-failure-defeat-table.md`](docs/02-failure-defeat-table.md).

| Failure | Defeated by |
|---|---|
| 1 · Habit tracker in a costume | Scoring reads only measured load, volume, pace and range. There is no completion bonus in the codebase. |
| 2 · Self-reported ranks are fiction | The trust cap is applied inside the single function every tier render passes through. |
| 3 · Not sticky | Raids require every participant to log; streaks are tracked per *pairing*. |
| 4 · Borrowed aesthetic | Original vocabulary and sigils, plus source scans that fail the build on the genre's visual clichés. |

---

## Documentation

| # | Document |
|---|---|
| 1 | [Overview and core loop](docs/01-overview-and-core-loop.md) |
| 2 | [Failure-defeat table](docs/02-failure-defeat-table.md) |
| 3 | [Screen inventory](docs/03-screen-inventory.md) — 59 screens |
| 4 | [Data model](docs/04-data-model.md) |
| 5 | [Progression state machine + 3 worked users](docs/05-progression-state-machine.md) |
| 6 | [Quest, raid and rival generation](docs/06-generation-logic.md) |
| 7 | [Verification and anti-cheat](docs/07-verification-anticheat.md) |
| 8 | [Copy bank](docs/08-copy-bank.md) |
| 9 | [Monetization and entitlement matrix](docs/09-monetization-matrix.md) |
| 10 | [Visual system](docs/10-visual-system.md) |
| 11 | [Five moment screens, frame by frame](docs/11-moment-screens.md) |
| 12 | [Rank card spec, per tier](docs/12-rank-card-spec.md) |
| 13 | [Launch and store assets](docs/13-launch-assets.md) |
| 14 | [Open questions](docs/14-open-questions.md) |
| 15 | [Technical architecture](docs/15-technical-architecture.md) |

---

## Safety (§21)

Non-negotiable, and implemented rather than merely stated.

- Minimum age 16, gated at signup
- Readiness questionnaire **before** any physical test question
- **No calorie, weight, body-fat or body-composition tracking, targets or
  commentary anywhere.** Enforced by a source scan.
- No mechanic penalises rest, illness or injury
- Deload every 4th week; load progression capped at 5%/week
- Motivational copy never uses shame, guilt, ultimatums or appearance references
- Persistent plain-language disclaimer: not medical advice
- Reported chest pain, dizziness, fainting or cardiac history surfaces a
  stop-and-seek-attention state and suppresses every challenge prompt

---

## Privacy (§10)

Location is read **once**, at the moment of a venue scan, to confirm presence.

- Never continuously tracked — `ACCESS_BACKGROUND_LOCATION` is in
  `blockedPermissions`, so the capability is not compiled into the app
- Coordinates are never persisted; only the computed distance, and only to
  defend an appeal
- Never sold
- Stated in-product in plain language
