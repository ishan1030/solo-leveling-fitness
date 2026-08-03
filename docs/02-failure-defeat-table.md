# 2 · How each of the four failures is defeated

§2 requires showing **where** each failure is defeated. Every row below points at
a specific file and a specific test, because a design claim that is not enforced
somewhere is just an intention.

---

## FAILURE 1 — "It's a habit tracker wearing a costume"

> XP bars laid over a checklist. Two users who both "complete" a workout must
> gain different amounts based on what they actually did.

**Defeated in:** `src/engine/scoring.ts`

There is no code path anywhere in the product that converts "session completed"
into progression. `scoreSession()` accepts only measured quantities — reps, load
in kg, duration in seconds, distance in metres — and converts them into
dimensionless *work units* before any pillar point is awarded.

| Mechanism | Where |
|---|---|
| Tonnage scaled by √load, so heavy work outranks equal-tonnage light work | `workUnitsForSet`, `reps_load` branch |
| Bodyweight movements scored against the operator's actual mass | `reps_load`→`reps_bodyweight` branch |
| Distance scored with a pace factor, so a 5 km at 4:30/km beats 7:00/km | `distance` branch |
| Diminishing returns via √volume, so junk reps cannot out-score hard ones | all branches |
| An empty session scores exactly zero | `scoreSession` |

**Proof:** `src/engine/systems.test.ts` → `§2 FAILURE 1 — progression is driven
by performance, not completion`

```
✓ two operators completing the same movement gain different amounts
✓ rewards a faster run over a slower one at the same distance
✓ gives diminishing returns on volume so junk reps do not out-score hard ones
✓ scores bodyweight movements against the operators own mass
```

The first test constructs two identical "completed" sessions differing only in
load and asserts the pillar gain differs. If someone reintroduces
completion-based scoring, that test fails.

---

## FAILURE 2 — "Ranks are meaningless because they're self-reported"

> This is the single biggest killer in the category.

**Defeated in:** `src/engine/progression.ts` and `src/engine/verification.ts`

The trust cap is not a validation rule applied at write time — it is applied
inside `computeStanding()`, the single function every tier badge, ladder row and
rank card in the app resolves through. **There is no way to render a tier without
passing through the cap.**

| Mechanism | Where |
|---|---|
| Self-reported profiles hard-capped at COBALT on every read | `applyTrustCap`, called by `computeStanding` |
| The uncapped tier is retained and shown, so the user sees what is withheld | `Standing.uncappedTier`, `Standing.trustCapped` |
| Leaderboards above COBALT filter to verified operators at query time | `isLeaderboardEligible` |
| Codes rotate every 60 s and are geofenced to venue coordinates | `validateCheckIn` |
| Max one verified session per operator per 4 hours | `VERIFIED_SESSION_COOLDOWN_HOURS` |
| Profile verification lapses after 30 days without a verified session | `resolveProfileVerification` |
| Implausible progression is flagged, never auto-punished | `reviewProgression` returns `autoPunished: false` as a **literal type** |

**Proof:** `src/engine/progression.test.ts` → `applyTrustCap — §6, the product spine`

```
✓ caps self-reported operators at COBALT
✓ onboarding alone can never produce an ECLIPSE
✓ does not cap QR_CHECK_IN / TRAINER_CONFIRM / EQUIPMENT_TAP operators
```

The decisive test feeds a *perfect* self-reported calibration — every pillar at
100, CPS 100, uncapped tier ECLIPSE — and asserts the rendered tier is COBALT.

The `autoPunished: false` literal type is worth calling out: nothing downstream
can set that field to `true` without editing `verification.ts` and confronting
the comment explaining why it exists.

---

## FAILURE 3 — "Nothing social, so nothing sticky"

> A user should have a standing obligation to at least one other human being by
> the end of week one.

**Defeated in:** `src/engine/raids.ts` and `src/engine/rivals.ts`

The word doing the work is *obligation*. A leaderboard is not an obligation — a
raid partner waiting on your portion is.

| Mechanism | Where | Why it obliges |
|---|---|---|
| Raid completion requires **every** participant to log | `validateRaid` → `portion_not_logged` names the operator | Your absence is visible to 1–5 named people |
| Raid streaks tracked **per pairing** | `updatePairStreak` | The streak belongs to a relationship, not to you |
| 10-day pairing grace | `PAIR_STREAK_GRACE_DAYS` | Long enough that a holiday does not end a friendship |
| Rivals capped at 3, within ±1 tier | `MAX_RIVALS`, `isEligibleRival` | Scarcity makes each one matter |
| Weekly head-to-head on an agreed pillar | `resolveRivalWeek` | A recurring appointment with a person |
| Rival suggestions weighted to same venue, then same city | `suggestRivals` | The person is someone you might actually meet |
| Records persist across seasons | `Rivalry.record` in the §17 `persists` group | A years-long score with one human |

**Proof:** `src/engine/systems.test.ts` → `§9 — raid anti-abuse`, `§11 — rivals`

```
✓ refuses to complete when one participant has not logged — nobody gets carried
✓ ranks same-venue candidates first, then same-city
✓ splits points on a draw rather than voiding them
```

**Anti-pattern deliberately avoided:** raid rewards top out at 1.5 × 1.4 = 2.1×.
A raid is worth organising and never worth *only* raiding, so solo operators are
not pushed off the ladder — which would have replaced FAILURE 3 with a worse one.

---

## FAILURE 4 — "It looks like the same borrowed anime UI as everything else"

> Blue holograms, same tier letters, same borrowed vocabulary. Nothing
> memorable, and legally exposed on top.

**Defeated in:** `src/design/tokens.ts`, `src/design/components/TierSigil.tsx`

| Mechanism | Where |
|---|---|
| Original tier vocabulary: ASH · IRON · COBALT · STORM · SOLAR · ECLIPSE | `tierVisuals` |
| Six original sigils built from instrument geometry, not heraldry | `TierSigil.tsx` |
| Each sigil legible in monochrome, so colour is never the sole carrier | `monochrome` prop |
| Near-black warm base, no blue hologram palette | `palette.base = #0A0B0D` |
| Exactly one gradient in the entire app, on ECLIPSE only | `tierVisuals.ECLIPSE.gradient`, all others `null` |
| No drop shadows, no glassmorphism, no purple gradient buttons | enforced by source scan |
| Monospace numerals set at 64px — numbers as the hero | `type.dataHero` |
| Mechanical motion, 150–250 ms, no springs | `motion`, cubic ease with no overshoot |

**Proof:** `src/data/design.test.ts` → `§19 — surface language, enforced across
the source tree`

```
✓ uses no drop shadows anywhere
✓ uses no glassmorphism
✓ declares a gradient only in the ECLIPSE sigil and the tier token
✓ never references an existing franchise — §3 originality rule
```

These are **filesystem scans**, not unit tests. They read every `.ts`/`.tsx` file
in `src/` and fail the build on a `shadowColor`, a `BlurView`, or a
`LinearGradient` outside the two allowed files. This is the only mechanism that
actually survives eighteen months of feature work — "we agreed not to use
shadows" does not.

The franchise scan strips comments first, so a doc comment citing the rule is not
mistaken for a violation of it.

---

## Summary

| Failure | Primary defence | Enforced by | Would break if… |
|---|---|---|---|
| 1 · Costume habit tracker | Measured-performance scoring | 5 unit tests | anyone added a completion bonus |
| 2 · Meaningless self-reported ranks | Cap applied on read, inside the only read function | 8 unit tests + literal types | anyone rendered `tierForCps` directly |
| 3 · Not sticky | Per-pairing obligations, everyone must log | 12 unit tests | raids allowed one person to carry |
| 4 · Borrowed aesthetic | Original vocabulary + source-tree scans | 4 filesystem scans | anyone shipped a shadow or a gradient |
