# 5 · Progression state machine and three worked examples

Every number in this document is asserted by
`src/engine/worked-examples.test.ts`. If a constant changes, that file fails and
this document gets corrected with it — the docs cannot drift from the engine.

---

## The state machine

```
                        ┌───────────────────┐
                        │   UNCALIBRATED    │
                        │  no rank, no id   │
                        └─────────┬─────────┘
                                  │ completeCalibration()
                                  │ → SELF_REPORTED, level 1, tier ≤ COBALT
                                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                          ACTIVE                              │
   │                                                              │
   │   logSession() ──► scoreSession()                            │
   │                       │                                      │
   │                       ├─► applyStatGain()  capped +2.0/pillar/7d
   │                       ├─► awardXp()        level = f(XP)     │
   │                       └─► recordSession()  streak            │
   │                                                              │
   │   weekly tick ──► reevaluateTier()                           │
   │                     needs ≥1 verified session in window      │
   │                     no verified session → tier does NOT move │
   └───┬────────────────────┬─────────────────────┬───────────────┘
       │                    │                     │
       │ pauseFor(          │ 21 consecutive      │ checkIn() accepted
       │  'injury'|         │ idle days           │ → verification tier ↑
       │  'illness')        │                     │ → COBALT cap lifts
       ▼                    ▼                     │
  ┌──────────┐         ┌──────────┐               │
  │  PAUSED  │         │ DECAYING │               │
  │          │         │          │               │
  │ no decay │         │ −1 CPS   │               │
  │ no streak│         │ per day  │               │
  │ loss     │         │          │               │
  │ no quests│         │ floors 1 │               │
  │ no prompt│         │ tier below│              │
  │          │         │ career pk │              │
  └────┬─────┘         └────┬─────┘               │
       │ resume()           │ logSession()        │
       │ or logSession()    │                     │
       └──────────┬─────────┘                     │
                  ▼                               │
              ACTIVE ◄───────────────────────────┘

                        ┌───────────────────┐
        ACTIVE ────────►│  SEASON ROLLOVER  │ every 13 weeks
                        │                   │
                        │ RESET:  ladder pts, seasonal quests, placement
                        │ PERSIST: level, XP, pillars, achievements,
                        │          titles, guild, rivalry records
                        │ SOFT:   tier → min(current, peak − 1)
                        └─────────┬─────────┘
                                  ▼
                               ACTIVE
```

### Transition table

| From | Event | To | Effect |
|---|---|---|---|
| UNCALIBRATED | `completeCalibration()` | ACTIVE | Level 1, SELF_REPORTED, tier ≤ COBALT |
| ACTIVE | `logSession()` | ACTIVE | Pillar gain (capped), XP, streak |
| ACTIVE | weekly tick + ≥1 verified | ACTIVE | Tier re-derived |
| ACTIVE | weekly tick, 0 verified | ACTIVE | **Tier unchanged.** Not a demotion. |
| ACTIVE | 21 idle days | DECAYING | −1 CPS/day begins on day 22 |
| ACTIVE | `pauseFor()` | PAUSED | Decay and streak loss suspended |
| DECAYING | `logSession()` | ACTIVE | Decay stops immediately |
| DECAYING | floor reached | DECAYING | Holds at one tier below career peak, forever |
| PAUSED | `resume()` or `logSession()` | ACTIVE | Streak resumes at its paused value |
| PAUSED | any elapsed time | PAUSED | **Nothing decays. Ever.** |
| ACTIVE | `checkIn()` accepted | ACTIVE | Verification ↑, COBALT cap lifts |
| ACTIVE | 30 days no verified session | ACTIVE | Verification lapses to SELF_REPORTED, cap returns |
| any | season end | ACTIVE | Partial reset per §17 |

**Why "no verified session" does not demote:** demotion is decay's job, and decay
has its own 21-day grace period. Conflating the two would punish a light week —
exactly the loss-framing §16 forbids.

---

## The maths

**Composite Power Score**

```
CPS = 0.30·strength + 0.30·endurance + 0.25·consistency + 0.15·mobility
```

**Tier, derived — never assigned**

| Tier | CPS |
|---|---|
| ASH | 0 – 29 |
| IRON | 30 – 44 |
| COBALT | 45 – 59 |
| STORM | 60 – 74 |
| SOLAR | 75 – 89 |
| ECLIPSE | 90 – 100 |

**Level, separate from tier**

```
XP to clear level N = round(100 × N^1.4, nearest 10)      cap: level 100
```

| Level | XP to clear | Cumulative |
|---|---|---|
| 1 | 100 | 100 |
| 2 | 260 | 360 |
| 10 | 2 510 | ~13 400 |
| 41 | 18 110 | ~340 000 |
| 50 | 23 910 | ~530 000 |
| 99 | 62 210 | ~2 470 000 |

**Caps and floors**

| Rule | Value |
|---|---|
| Stat gain | +2.0 per pillar per rolling 7 days |
| Maximum CPS gain per week | **exactly 2.0** — less than any 15-point tier band |
| Decay grace | 21 consecutive idle days |
| Decay rate | −1 CPS/day |
| Decay floor | bottom of the tier one below career peak |
| Trust cap | COBALT for SELF_REPORTED |

The maximum weekly CPS gain of 2.0 is why nobody can rush a tier: the narrowest
band is 15 points wide, so **the fastest possible tier climb is 7.5 weeks**, and
that assumes every pillar maxes its cap every week.

---

## Worked example A — Priya, 24, complete beginner

**Calibration inputs**

| Input | Value |
|---|---|
| Push-ups | 6 |
| Pull-ups | 0 |
| Bodyweight squats | 20 |
| Bench | *skipped — no barbell access* |
| Longest run | 1.5 km |
| Pace | 480 s/km (8:00/km) |
| Resting HR | *skipped* |
| Sessions/week | 2 |
| Months training | 2 |
| Sit-and-reach | −6 cm |
| Overhead squat | 2 / 4 |
| Shoulder rotation | 2 / 4 |

**Result**

```
CALIBRATION COMPLETE
Operator:  Priya
Tier:      ASH            Level: 1
Strength 16.5   Endurance 21.5   Consistency 27.0   Mobility 42.0
Power Score: 24.5         Status: UNVERIFIED
```

**What the two skipped inputs did.** Bench and resting HR were skipped. Their
weight was **redistributed across the answered inputs**, not counted as zero. Her
strength pillar is scored on push-ups, pull-ups and squats at
0.30/0.30/0.20 → renormalised to 0.375/0.375/0.25. A user without a barbell is
not scored as though she failed the bench press.

**Her first week.** Five sets — knee push-ups ×2, bodyweight squats ×2, a 45 s
plank — earn enough XP that four such sessions clear level 1 and reach **level 2**.

**The gap she can see.** Her mobility (42.0) is nearly triple her strength
(16.5), so the quest engine targets strength every day. The board is legible: her
weakest number is the one being worked.

**The ceiling she meets on day one.** ASH is nowhere near the COBALT cap, so it
does not bite — but if Priya had entered elite numbers for every input, the engine
would compute CPS 100, uncapped tier ECLIPSE, and **show her COBALT**. That is
asserted directly in the test file.

---

## Worked example B — Rajesh, 34, intermediate, verified

**Pillars:** Strength 58 · Endurance 44 · Consistency 72 · Mobility 35

```
CPS = 58(0.30) + 44(0.30) + 72(0.25) + 35(0.15)
    = 17.40 + 13.20 + 18.00 + 5.25
    = 53.85 → 53.9        Tier: COBALT
```

**Distance to STORM:** 60 − 53.9 = **6.1 CPS**.

**How long that takes.** At the theoretical maximum of +2.0 CPS/week —
every pillar hitting its cap every week, which essentially nobody sustains — it
takes **4 weeks**. Realistically 8–12.

**The level/tier tension.** Rajesh is level 41 and COBALT. §5 says this must read
as honest rather than punishing, so the UI states:

> Level 41 is time invested. COBALT is what you can do today. Both are real.

His mobility (35) is dragging a CPS that his consistency (72) has earned. The
quest engine targets mobility; the honest framing is that he has trained
consistently and specifically, and the ladder measures breadth.

**What happens if he stops verifying.** If Rajesh climbs to STORM-level pillars
(70/62/75/55 → CPS 67.0) but lets his verification lapse past 30 days, his
profile reverts to SELF_REPORTED and the board shows him **COBALT** — with
`uncappedTier: STORM` displayed alongside, so he knows exactly what one gym scan
would restore.

---

## Worked example C — Sunita, 41, advanced, injured mid-season

**Pillars:** Strength 82 · Endurance 88 · Consistency 90 · Mobility 70

```
CPS = 82(0.30) + 88(0.30) + 90(0.25) + 70(0.15)
    = 24.6 + 26.4 + 22.5 + 10.5
    = 84.0                Tier: SOLAR (verified via EQUIPMENT_TAP)
```

**Distance to ECLIPSE:** 90 − 84 = 6 CPS — three maximal weeks.

### She tears a hamstring in week 3 of the season.

She taps **STOP — I'M INJURED** mid-session and logs the injury.

| Effect | Value |
|---|---|
| Session | Logged, scores zero, **no penalty** |
| Streak | Paused at its current value, indefinitely |
| Decay | **Suspended entirely** |
| Quests | Suppressed — no prompting at all |
| Tier | Frozen at SOLAR |
| AXIOM | Switches to the calm register regardless of her chosen personality |

**Six months later, still paused:** CPS is still **84.0**. Not one point lost.
This is asserted directly — `computeDecay` returns `isDecaying: false` and
`cpsLost: 0` for a paused profile at any elapsed time.

### She lifts the pause but does not train.

Decay now runs from her last session date:

| Day | Idle days | State | CPS |
|---|---|---|---|
| 21 | 21 | Grace period | 84.0 |
| 22 | 22 | Decay begins | 83.0 |
| 31 | 31 | Decaying | **74.0** |
| 45 | 45 | Decaying | 60.0 |
| 46+ | 46+ | **Floored** | 60.0 |

**The floor.** Her career peak of 84.0 is SOLAR. One tier below is STORM, whose
floor is CPS 60. After two years of total inactivity she is **still STORM** —
never lower. §5's promise that you cannot fall more than one tier below your best
is a hard floor, not a slow approach.

**Decay preserves shape.** Pillars scale proportionally, so at the floor her
endurance still exceeds her strength and her consistency still exceeds her
mobility. A runner who stops training loses standing in the shape she built it,
rather than having her strongest pillar hollowed out first.

### Season rollover finds her at SOLAR.

| Group | Outcome |
|---|---|
| RESET | Ladder points → 0, seasonal quests cleared, placement cleared |
| PERSISTS | Level, XP, all four pillars, achievements, titles, guild, every rivalry record |
| SOFT | Season peak SOLAR → starts at **STORM** |

The soft reset costs exactly one tier and never more, no matter how far above the
line she finished.

---

## Reading the three together

| | Priya | Rajesh | Sunita |
|---|---|---|---|
| CPS | 24.5 | 53.9 | 84.0 |
| Tier shown | ASH | COBALT | SOLAR |
| Verification | SELF_REPORTED | QR_CHECK_IN | EQUIPMENT_TAP |
| Capped? | No (below cap) | No | No |
| Weakest pillar | Strength 16.5 | Mobility 35 | Mobility 70 |
| Quest target | Strength | Mobility | Mobility |
| Fastest path up | Verify, then train | 4+ weeks | 3+ weeks |

All three are targeted at their weakest pillar, all three see a legible next
threshold, and none of the three can buy a single point of it.
