# 6 · Quest, raid and rival generation logic

Implemented in `src/engine/quests.ts`, `src/engine/raids.ts`,
`src/engine/rivals.ts`. Tested in `src/engine/systems.test.ts`.

---

## Quest generation (§8)

### Determinism

Quests are **generated**, not stored on creation. The board is a pure function of:

```
(operatorId, date, pillars, availableDays, restDays,
 previousDayMuscleGroups, loggedCapacity, medicalStopActive, paused)
```

An offline client therefore produces the identical board the server would, which
is what makes §7's offline-first requirement compatible with a shared quest
system. Nothing needs to be fetched to know what today's quest is.

### The three hard rules

**Rule 1 — never schedule a quest on a declared rest day.**

```
isRestDay(date, restDays) → suppressedReason: 'rest_day'
```

The board is replaced by the §16 rest philosophy copy, not left empty.

**Rule 2 — never two consecutive days targeting the same muscle group.**

```
allowedMuscleGroups(candidates, previousDayMuscleGroups)
  = candidates \ previousDayMuscleGroups
  fallback: ['full_body']   // never an empty board
```

**Rule 3 — scale to logged capacity, not to tier.**

```
target = max(floor, round(capacity × multiplier))

multiplier:  DAILY_PRIMARY 0.85   DAILY_OPTIONAL 0.50   WEEKLY 3.20
```

`capacity` is the operator's own rolling median session volume. **Tier and CPS
are not arguments to this function.** A STORM operator returning from injury gets
a quest sized to what they have actually logged lately, not to the rank on their
profile — which is the difference between a quest that gets done and one that
gets ignored.

### The daily board

| Slot | Pillar | Reward |
|---|---|---|
| PRIMARY | Weakest | 120 XP |
| OPTIONAL 1 | 2nd weakest | +0.25 pillar points |
| OPTIONAL 2 | 3rd weakest | +0.25 pillar points |

Optionals draw from the *next* weakest pillars rather than stacking three quests
on one already-fatigued system.

### Suppression precedence

```
medicalStopActive  →  'medical_stop'   (§21, highest precedence)
paused             →  'paused'         (§16)
isRestDay          →  'rest_day'       (§8)
otherwise          →  full board
```

### Weekly quest

Cumulative target on the weakest pillar, ~3.2 sessions' worth. 500 XP + 0.5
pillar points, 7-day expiry.

### Anomalies

Hidden. **Never listed in advance** — no locked slot, no "???" row, no progress
bar toward one. Evaluated after every session.

| Trigger | Condition | XP |
|---|---|---|
| DAWN PATROL | 5 sessions before 06:00 in 30 days | 900 |
| NOMAD | 3 distinct venues in 30 days | 750 |
| HELD THE LINE | 3 consecutive rival weeks won | 1 200 |
| IRON WEEK | Every scheduled session hit in one week | 600 |
| LONG HAUL | 90 consecutive training days | 2 000 |

Each fires once. Discovery has to be a surprise or it is just another checklist.

### Trials

One per week, rotating deterministically so every operator faces the same one.

| Week | Trial | Objective | Limit |
|---|---|---|---|
| 0 | THE HUNDRED | 100 push-ups, broken up however you like | 10:00 |
| 1 | FIVE FLAT | 5 km, one continuous effort | 40:00 |
| 2 | DEAD HANG | 4 minutes of accumulated dead hang | 10:00 |
| 3 | GROUND WORK | 10 min continuous mobility flow, no rest > 15 s | 10:00 |

Opt-in, leaderboarded.

---

## Raid generation and validation (§9)

### Reward multiplier

```
multiplier = partySize × pillarDiversity × (bossRaid ? 1.5 : 1)

partySize:       2→1.10  3→1.20  4→1.30  5→1.40  6→1.50
pillarDiversity: 1.0 (all same pillar) … 1.4 (maximal spread)
```

**§9's stated requirement, verbatim:** "a runner plus a lifter completing a raid
together earns more than two lifters." Asserted directly:

| Party | Size × | Diversity × | Total |
|---|---|---|---|
| 2 lifters | 1.10 | 1.00 | **1.10** |
| 1 lifter + 1 runner | 1.10 | 1.40 | **1.54** |
| 4 operators, 4 pillars | 1.30 | 1.40 | **1.82** |
| 4-pillar boss raid | 1.30 | 1.40 × 1.5 | **2.73** |

**Deliberate ceiling.** The maximum is 2.73×, and an ordinary raid tops out at
2.1×. A raid must be worth organising without becoming the only rational way to
train — otherwise solo operators get pushed off the ladder and §2 FAILURE 3 is
replaced by a worse problem.

### Anti-abuse rules

| Rule | Constant | Rejection code |
|---|---|---|
| Party size 2–6 | `RAID_MIN/MAX_PARTY` | `party_too_small` / `party_too_large` |
| Every participant logs | — | `portion_not_logged` (names the operator) |
| Every session verified | — | `unverified_participant` |
| Shared window | 90 minutes | `outside_shared_window` |
| Proximity (in-person raids) | 150 m, haversine | `outside_proximity` |
| Pair cooldown | 20 hours | `pair_cooldown_active` |

Rejections **name the failing operator**, so the raid screen can show "waiting on
1 of 4" rather than a blank failure.

### Drop-outs

§9 asks explicitly what happens when one participant drops mid-raid.

```
remaining ≥ 2  →  raid CONTINUES at the recomputed (lower) multiplier
remaining < 2  →  raid ABANDONED
                  every operator who logged keeps normal solo credit
                  NO penalty to anyone — including the operator who left
```

The notice copy is tested to contain "no penalty" and tested **not** to contain
blame language (`abandoned you`, `let down`, `quit`, `bailed`). People have lives.

### Pair streaks

Tracked per pairing, not per operator. 10-day grace — long enough that a holiday
does not destroy a months-old partnership. The obligation should feel like a
friendship, not a subscription.

---

## Rival matchmaking (§11)

### Eligibility

```
|tierIndex(operator) − tierIndex(candidate)| ≤ 1
AND candidate.acceptingRivals
```

Max **3** rivals. Scarcity is what makes each one matter.

### Suggestion ranking

```
score = 0
      + 100  if same venue
      + 50   if same city
      + 10 − 5 × |tier difference|
```

Locality is weighted heavily on purpose. §12's whole argument is that an operator
in a smaller market needs a realistic, *nearby* ladder to care about — a rival at
your own gym in Bharatpur is worth more than a stranger three tiers of
abstraction away.

### Weekly head-to-head

Scored on **pillar points gained in the agreed pillar this week** — not on
absolute pillar score.

This is the only fair comparison across a one-tier spread: a COBALT and a STORM
rival compete on *rate of improvement*, so the lower-ranked operator can genuinely
win, and the higher-ranked one cannot coast on an existing lead.

| Outcome | Operator | Rival |
|---|---|---|
| Win | +25 ladder points | 0 |
| Loss | 0 | +25 |
| **Draw** | **+13** | **+13** |

A draw splits rather than voiding. Two people who both trained hard should not
both walk away with nothing.

Records persist across seasons (§17) and display on the profile as `5W · 2L · 1D`.

Loss copy is tested against a shame filter — `resolveRivalWeek` summaries may not
contain `pathetic`, `weak`, `embarrass`, or `loser`. The framing is always the
rematch.
