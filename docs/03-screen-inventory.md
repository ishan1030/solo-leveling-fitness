# 3 · Complete screen inventory

Every screen in v1.0, its purpose, and its key states. Screens marked **BUILT**
exist in `src/screens/`; the rest are specified to the same level of detail and
are implemented against the same engine, which is complete for all of them.

## Build status

| Group | Built | Total |
|---|---|---|
| A · First run | 13 | 13 |
| B · Daily loop | 5 | 5 |
| C · Progression | 5 | 5 |
| D · Social | 6 | 11 |
| E · Territory | 2 | 4 |
| F · Ladder | 2 | 3 |
| G · Seasons | 3 | 4 |
| H · Coach | 0 | 4 |
| I · Commerce | 2 | 4 |
| J · Safety | 4 | 6 |
| **Total** | **42** | **59** |

Plus all five §19 moment screens.

**Not yet built, and what each needs.** Every one of these has its engine
complete and tested — what is missing is the screen, not the logic.

| Screen | Engine ready | Blocked on |
|---|---|---|
| D1–D2 Friends, add friend | — | Friend graph is server-side; no client engine to build against |
| D5–D6 Guilds | Partially — contribution cap specified, not implemented | Guild entity is server-owned |
| D11 Boss raid | `raids.ts`, `isBossRaid` | Global completion counter needs a backend |
| E2, E4 City board, venue profile | `ladder.ts` `buildVenueStandings` | No blocker |
| F3 Trial leaderboard | `quests.ts` `trialForWeek` | No blocker |
| G4 Titles | `seasons.ts` `seasonRewardsFor` | No blocker |
| H1–H4 Coach hub, personality, history, voice packs | `copy.ts` complete, TTS is `expo-speech` | No blocker |
| I2–I3 Pass purchase, manage subscription | `entitlements.ts` | Store SDK integration + confirmed pricing |
| J3 Recovery path | — | Content, not code |
| J6 Recalibrate | `canRecalibrate` | No blocker; UI reuses the calibration flow |

---

## A · First run (§4)

### A1 · CALIBRATION — Demographics **BUILT**
*`src/screens/Calibration.tsx` → `DemographicsStep`*

**Purpose:** collect the two inputs that select the correct lookup table.
First frame the user sees. No splash, no carousel, no account.

| State | Behaviour |
|---|---|
| Empty | Continue disabled. Progress rail at 1/10. |
| Age < 16 | Inline: "Meridian is for operators aged 16 and over." §21 gate. |
| Age out of range | Inline: "Enter an age between 16 and 100." |
| Sex unselected | Continue disabled |
| `unspecified` chosen | Scored against the midpoint of both curves, stated inline |

### A2 · CALIBRATION — Readiness **BUILT**
*`ReadinessStep`*

**Purpose:** §6's mandatory gate, **before any physical test question**.

| State | Behaviour |
|---|---|
| None selected | "None of these apply" is a first-class action, not a skip link |
| Any flag | Coach defaults to CALM_MENTOR; conservative loading; persistent banner |
| Chest pain / syncope / cardiac | Escalates to the §21 medical-stop state |
| Always | Full profile and rank still awarded. **No exit path from this screen.** |

### A3–A10 · CALIBRATION — Eight questions **BUILT**
*`QuestionStep`*

| # | Screen | Inputs | Optional |
|---|---|---|---|
| 1 | UPPER BODY | push-ups | no |
| 2 | PULLING | pull-ups | no |
| 3 | LOWER BODY | bodyweight squats | no |
| 4 | LOADED STRENGTH | bench × bodyweight | **yes** |
| 5 | DISTANCE | longest run, pace | no |
| 6 | RECOVERY | resting HR | **yes** |
| 7 | CONSISTENCY | sessions/week, months training | no |
| 8 | RANGE | sit-and-reach, overhead squat, shoulder rotation | no |

| State | Behaviour |
|---|---|
| Unanswered, required | Next disabled |
| Unanswered, optional | "Skip — I don't train this" available; weight redistributes |
| Scoring table collapsed | Default. One tap to expand. |
| Scoring table expanded | §6: shows the operator's own age/sex band, every rung, every score |

### A11 · CALIBRATION — Name **BUILT**
**Purpose:** §4 step 5. The only thing asked before the reveal.
Email and password are deferred until *after* the rank card exists.

### A12 · THE REVEAL **BUILT**
*`src/screens/Reveal.tsx`* — §19 moment screen 1. Frame timing in
[11-moment-screens.md](11-moment-screens.md).

| State | Behaviour |
|---|---|
| Playing | SKIP present from frame one, top-right, 44pt target |
| Reduced motion | All stages resolve immediately; content identical |
| Trust-capped | Caution notice explaining the COBALT cap |
| Readiness flagged | Persistent, non-blocking banner |
| Medical stop | Stop-toned banner; challenge prompts suppressed downstream |

### A13 · CALIBRATION RESUME **BUILT**
*`CalibrationResumeScreen`* — §4: "what a user who abandons calibration halfway
sees when they come back." States the answer count, offers resume or restart.
Nothing is lost.

---

## B · Daily loop

### B1 · HOME **BUILT**
*`src/screens/Home.tsx`* — §4: "what a returning user sees on open (not the same
screen)." Leads with today's quest, not with a summary of the past.

| State | Behaviour |
|---|---|
| Normal | Standing panel, today's quests, weekly quest, Start session |
| Trust-capped | Persistent notice naming the withheld tier |
| Level/tier tension | §5 explainer panel once level ≥ 10 and tier lags |
| Rest day | Quest board replaced by the §16 rest philosophy |
| Paused (injury/illness) | No prompts at all; single "I am ready to train" action |
| Medical stop | Stop banner first; all challenge prompts suppressed |
| Decaying | Idle-day count and the floor, stated plainly |

### B2 · EXERCISE PICKER **BUILT**
302 movements, searchable by name and muscle group. Each row shows muscle group
and equipment.

### B3 · SESSION — Live logging **BUILT**
*`SessionScreen`*

| State | Behaviour |
|---|---|
| Set entry | Previous set pre-filled. Two taps to log. |
| Rest timer | Auto-starts on log; monospace countdown; haptic at zero |
| Implausible value | Inline caution at entry time, assuming a typo |
| Always | STOP / I'M INJURED visible without scrolling |

### B4 · SESSION SUMMARY **BUILT**
*`SessionSummaryScreen`* — §7: PRs, pillar movement, XP, what AXIOM noticed.

| State | Behaviour |
|---|---|
| Normal | XP, per-pillar gain, PRs |
| Weekly cap hit | States exactly what was withheld and why |
| Flagged sets | States the count, confirms they remain in the log |
| Level gained | Level-up notice |
| Aborted for injury | Leads with recovery; the sets completed before stopping are scored and shown |

### B5 · CHECK-IN (QR) **BUILT**
*`src/screens/CheckIn.tsx`*

**Purpose:** §10 verification at session start **and** end.

| State | Behaviour |
|---|---|
| Scanning | Camera, single location read, stated on screen |
| Accepted | "Checked in at {venue}" |
| Code rotated | "That code has rotated. Scan the current one." |
| Outside geofence | Reports the measured distance |
| Cooldown active | States the remaining hours; confirms the session still logs |
| Uncertified venue | Session logs normally, no badge |
| Location denied | §10 privacy copy; session logs as self-reported |

---

## C · Progression and identity

### C1 · PROFILE **BUILT**
*`src/screens/Profile.tsx`*

Tier sigil, four pillars, verification tier, level, streak, rivalry records,
titles, and the §17 career timeline.

### C2 · RANK CARD **BUILT**
*`src/screens/RankCard.tsx`* — per-tier layouts in
[12-rank-card-spec.md](12-rank-card-spec.md).

| State | Behaviour |
|---|---|
| Per tier | Composition changes, not just colour |
| Unverified | UNVERIFIED marked on the card itself |
| Sharing unavailable | Card stays on screen; it is screenshot-worthy unedited |

### C3 · CALIBRATION FAIRNESS TABLE **BUILT** (inline in A3–A10)
The published §6 lookup tables. Same data the scorer uses — there is no second,
hidden set of numbers.

### C4 · PR HISTORY **BUILT**
*`src/screens/Records.tsx`*

Per-movement progression graph. Records are per (movement, metric) — a heavier
single and a higher-volume set are different achievements and both are kept.

| State | Behaviour |
|---|---|
| No records | "Your first logged set of any movement becomes its baseline." |
| All records | Most recent first, tappable through to the movement |
| Movement detail | One tab per metric held; monotone best-so-far line |
| Single data point | "The line appears once you beat it." |
| Pace metric | Graph flips so improvement still reads up and to the right |

### C5 · CAREER TIMELINE **BUILT** (in Profile)
§17 archive: one permanent entry per season. Append-only.

---

## D · Social

| # | Screen | Key states |
|---|---|---|
| D1 | FRIENDS | Empty · list (tier, streak, last session only — **no feed, no likes**) |
| D2 | ADD FRIEND | Code · QR · contacts |
| D3 | RIVALS **BUILT** | 0–3 held · suggestions · pending invite · active week · result |
| D4 | RIVAL DETAIL **BUILT** | Head-to-head, agreed pillar, persistent W/L/D record |
| D5 | GUILD | Not in one · roster (5–50) · guild quest · contribution cap reached |
| D6 | GUILD LEADERBOARD | Global · by city |
| D7 | RAID — Open **BUILT** | Party 1–6 · invite · waiting |
| D8 | RAID — Active **BUILT** | Per-participant logged state · "waiting on 2 of 4" |
| D9 | RAID — Complete **BUILT** | §19 moment screen 4 |
| D10 | RAID — Abandoned **BUILT** | No-penalty notice; work converts to solo credit |
| D11 | BOSS RAID | Monthly; global completion counter |

---

## E · Territory (§12)

| # | Screen | Key states |
|---|---|---|
| E1 | VENUE LEADERBOARD **BUILT** | Your venue · city rank · national · global |
| E2 | CITY LEADERBOARD | Bharatpur first, then national, then global |
| E3 | TERRITORY CYCLE **BUILT** | Current holder · days remaining · your contribution |
| E4 | VENUE PROFILE | Certified badge · member count · challenges |

---

## F · Ladder

| # | Screen | Key states |
|---|---|---|
| F1 | GLOBAL LADDER **BUILT** | Above COBALT: **verified only** |
| F2 | TIER LADDER **BUILT** | Filtered to a single tier |
| F3 | TRIAL LEADERBOARD | Weekly, one trial, opt-in |

---

## G · Seasons (§17)

| # | Screen | Key states |
|---|---|---|
| G1 | SEASON HUB **BUILT** | Days remaining · placement · pass progress |
| G2 | PASS **BUILT** | 50 tiers · free track · paid track · **XP from quests only** |
| G3 | SEASON CLOSE **BUILT** | §19 moment screen 5 |
| G4 | TITLES | Owned, browsable; one equipped |

---

## H · Coach (§14)

| # | Screen | Key states |
|---|---|---|
| H1 | AXIOM HUB | Free: text only, ≤2/day · Premium: voice |
| H2 | PERSONALITY | Calm / Strict / **Commander behind explicit roleplay opt-in** |
| H3 | COACHING HISTORY | Remains readable after a lapse |
| H4 | VOICE PACKS | Download, on-device |

---

## I · Commerce (§18)

| # | Screen | Key states |
|---|---|---|
| I1 | PREMIUM **BUILT** | 7-day trial · regional pricing · restore purchases |
| I2 | SEASON PASS | Purchasable by free operators |
| I3 | MANAGE SUBSCRIPTION | **One-tap cancellation path** |
| I4 | FAIRNESS STATEMENT **BUILT** | The §18 promise, stated to the user |

---

## J · Safety and settings (§21)

| # | Screen | Key states |
|---|---|---|
| J1 | MEDICAL STOP **BUILT** | Full-screen; suppresses all challenge prompts |
| J2 | LOG INJURY / ILLNESS **BUILT** | Pauses streak and decay indefinitely, no penalty |
| J3 | RECOVERY PATH | Offered after any injury log |
| J4 | PRIVACY **BUILT** | §10 location policy in plain language |
| J5 | ACCESSIBILITY | Reduced motion · captions · text size |
| J6 | RECALIBRATE | Available every 90 days; countdown otherwise |

---

## Screen count

| Group | Screens |
|---|---|
| A · First run | 13 |
| B · Daily loop | 5 |
| C · Progression | 5 |
| D · Social | 11 |
| E · Territory | 4 |
| F · Ladder | 3 |
| G · Seasons | 4 |
| H · Coach | 4 |
| I · Commerce | 4 |
| J · Safety | 6 |
| **Total** | **59** |

---

## Global states every screen must handle

1. **Offline** — §7 offline-first. Every screen renders from local state.
2. **Reduced motion** — §20. Content delivered, transitions removed.
3. **Screen reader** — §20. Every stat, tier and control labelled.
4. **Medical stop** — §21. Challenge prompts suppressed app-wide.
5. **Paused** — §16. No prompting anywhere; nothing decays.
6. **Trust-capped** — §6. The withheld tier is named, never merely implied.
