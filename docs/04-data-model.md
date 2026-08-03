# 4 · Full data model

Entities, fields, relationships. Types marked **live** exist in `src/engine/types.ts`
and are the authority; this document is the full model including server-side
entities the client does not hold.

---

## Entity relationship overview

```
                    ┌─────────┐
                    │  City   │
                    └────┬────┘
                         │ 1:N
                    ┌────▼────┐         ┌──────────────┐
                    │  Venue  │────1:N──│ VenueCode    │ (rotating, server only)
                    └────┬────┘         └──────────────┘
                         │ N:1 home venue
                    ┌────▼─────────┐
         ┌──────────│   Operator   │──────────┐
         │          └──┬───┬───┬───┘          │
         │ 1:N         │   │   │ 1:N          │ 1:N
    ┌────▼────┐        │   │   │         ┌────▼──────┐
    │ Session │        │   │   └────────►│  Rivalry  │
    └────┬────┘        │   │             └───────────┘
         │ 1:N         │   │ N:1
    ┌────▼────┐        │   └──────────►┌─────────┐
    │   Set   │        │               │  Guild  │
    └────┬────┘        │ 1:N           └─────────┘
         │ N:1    ┌────▼──────┐
    ┌────▼──────┐ │QuestState │
    │ Exercise  │ └───────────┘
    └───────────┘
                    ┌──────────────┐
       Session ─N:M─│     Raid     │  via RaidParticipant
                    └──────────────┘
                    ┌──────────────┐
      Operator ─1:N─│ SeasonArchive│
                    └──────────────┘
```

---

## Core entities

### Operator **live**

The player. `src/engine/types.ts` → `OperatorProfile`.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `op_*` |
| `displayName` | string | 2–24 chars |
| `ageYears` | number | ≥ 16 (§21) |
| `sex` | `female \| male \| unspecified` | Selects the §6 lookup band |
| `pillars` | `PillarScores` | Four 0–100 floats |
| `level` | number | 1–100 |
| `xpIntoLevel` | number | Resets on level-up |
| `verification` | `VerificationTier` | Derived; lapses after 30 days |
| `readiness` | `ReadinessFlags` | Six booleans |
| `lastSessionDate` | string \| null | ISO date; drives decay |
| `careerPeakCps` | number | Floors decay one tier below |
| `seasonPeakTier` | `Tier` | Drives the §17 soft reset |
| `pausedFor` | `injury \| illness \| null` | Suspends decay and streak loss |
| `homeVenueId` | string \| null | §12 territory attribution |
| `cityId` | string \| null | §12 |

**Server-only additions**

| Field | Type | Notes |
|---|---|---|
| `email` | string \| null | Collected *after* the reveal |
| `authProvider` | enum | apple · google · email |
| `ladderPoints` | number | Season-scoped; reset at rollover |
| `referredByOperatorId` | string \| null | §13 attribution |
| `entitlements` | `EntitlementState` | §18 |
| `createdAt` / `updatedAt` | timestamp | |

**Deliberately absent:** any calorie, body-fat, BMI or weight-goal field.
§21 forbids them, and `src/data/design.test.ts` scans the source tree for those
identifiers. `bodyweightKg` exists as a **scoring input only** — one current
value, no history, never graphed, never a target.

**Indexes:** `(cityId, ladderPoints DESC)`, `(homeVenueId, ladderPoints DESC)`,
`(verification, ladderPoints DESC)` — the last one serves the §10 rule that
boards above COBALT show verified operators only.

---

### Session **live**

| Field | Type | Notes |
|---|---|---|
| `id` | string | `sess_*` |
| `operatorId` | string | FK |
| `startedAt` / `endedAt` | ISO datetime | |
| `sets` | `LoggedSet[]` | Denormalised; a session is written once |
| `verification` | `VerificationTier` | Per-session, not per-profile |
| `venueId` | string \| null | |
| `abortedForInjury` | boolean | §15; scores zero, penalises nothing |

**Server-only:** `checkInAt`, `checkOutAt`, `syncedAt`, `clientGeneratedId`
(idempotency key for offline replay), `reviewStatus`.

**Indexes:** `(operatorId, startedAt DESC)`, `(venueId, startedAt DESC)`.

---

### LoggedSet **live**

| Field | Type |
|---|---|
| `exerciseId` | string |
| `kind` | `reps_load \| reps_bodyweight \| time \| distance \| hold` |
| `reps` / `loadKg` / `durationSec` / `distanceM` / `rpe` | optional numbers |

Sets are embedded in the session document rather than stored as rows: they are
written once, always read together, and never queried independently.

---

### Exercise **live**

`src/data/exercises.ts`. 302 entries, generated from 44 base movements.

| Field | Type |
|---|---|
| `id` · `name` | string |
| `pillar` · `secondaryPillar` | `Pillar` \| null |
| `muscleGroup` | `MuscleGroup` |
| `equipment` | `Equipment` |
| `setKinds` | `SetKind[]` |
| `formCue` · `commonMistake` | string (§7) |
| `intensityFactor` | number |
| `limits` | `SetLimits` (§7 plausibility ceilings) |
| `lowImpact` | boolean (§6 conservative loading) |

Ships in the bundle. No network call to log a set.

---

## Verification (§10)

### Venue

| Field | Type | Notes |
|---|---|---|
| `id` · `name` | string | |
| `cityId` | string | FK |
| `lat` · `lon` | number | Geofence centre |
| `certified` | boolean | Set by the partner programme |
| `codeSecret` | string | **Server only.** Never sent to a client. |

### VenueCode — server only
Derived, not stored: `HMAC-SHA256(codeSecret, floor(unixSeconds / 60))`,
truncated to 7 base32 characters.

### CheckIn — server only

| Field | Type |
|---|---|
| `operatorId` · `venueId` · `sessionId` | string |
| `phase` | `start \| end` |
| `acceptedAt` | timestamp |
| `distanceMetres` | number |

**§10 privacy:** the operator's raw coordinates are **never persisted**. Only the
computed distance is kept, and only to defend an appeal.

### ReviewFlag / Appeal — server only
`reviewProgression()` output, plus `operatorStatement`, `status`, and
`reviewedByHumanId` — non-null on every resolution, enforced by `resolveAppeal`.

---

## Social

### Rivalry **live**

| Field | Type | Season behaviour |
|---|---|---|
| `id` · `operatorId` · `rivalOperatorId` | string | persists |
| `pillar` | `Pillar` | agreed by both |
| `status` | `PENDING \| ACTIVE \| ENDED` | persists |
| `record` | `{wins, losses, draws}` | **persists across seasons** (§17) |
| `currentWeekStartedAt` | ISO | resets weekly |

### Guild — server only
5–50 members. `contributionCapPerMember` prevents one power user carrying the
roster. Roles: `LEADER \| OFFICER \| MEMBER`.

### Raid **live**

| Field | Type |
|---|---|
| `id` · `hostOperatorId` | string |
| `status` | `OPEN \| ACTIVE \| COMPLETE \| FAILED \| ABANDONED` |
| `participants` | `RaidParticipant[]` |
| `isBossRaid` | boolean |
| `requiresProximity` | boolean |

`RaidParticipant`: `operatorId`, `contributingPillar`, `verification`,
`loggedPortion`, `sessionStartedAt`, `location`, `droppedOut`.

**`location` is transient** — held in memory for validation, never written.

### PairStreak **live**
`pairKey` (sorted `a|b`), `count`, `lastCompletedAt`.

---

## Progression

### QuestState — server-mirrored

| Field | Type |
|---|---|
| `questId` · `operatorId` | string |
| `kind` | `DAILY_PRIMARY \| DAILY_OPTIONAL \| WEEKLY \| ANOMALY \| TRIAL` |
| `progress` · `target` | number |
| `completedAt` \| null | timestamp |
| `expiresAt` | timestamp |

Quests are **generated deterministically** from `(operatorId, date, pillars,
capacity)` rather than stored on creation, so an offline client produces the same
board the server would.

### Season / SeasonArchive **live**

`SeasonArchiveEntry`: `seasonNumber`, `endedAt`, `tier`, `level`, `cps`,
`placement`, `titleIds`. **Append-only** — `appendToArchive` refuses duplicates
and never rewrites.

### PassProgress
`seasonNumber`, `questXpThisSeason`, `ownsPaidTrack`, `claimedTiers[]`.
There is no field through which purchased XP could enter (§17).

---

## Entitlements (§18) **live**

`EntitlementState`: `subscription`, `ownsSeasonPass`, `trialEndsAt`.

**The architectural guarantee:** `entitlementsFor()` returns
`Set<FreeCapability | PaidCapability>`. `CompetitiveCapability` — XP multipliers,
stat bonuses, ladder points, extra quest slots, faster verification, decay
immunity, tier-cap bypass — is a **separate union that the return type does not
contain**. Selling one would not typecheck.

---

## Territory (§12)

### City
`id`, `name`, `countryCode`, `timezone`.

### TerritoryCycle — server only
`cycleId`, `cityId`, `holdingVenueId`, `startedAt`, `endsAt`, `points`.
Recomputed nightly from verified sessions.

---

## Client-only state

`src/state/store.ts`, persisted to AsyncStorage under `meridian-state-v1`.

| Field | Purpose |
|---|---|
| `phase` | Routing. Persisted as `ACTIVE` if a crash occurs mid-reveal. |
| `calibrationDraft` | §4 abandoned-calibration resume |
| `rollingGain` · `rollingWindowStart` | §5 weekly cap window |
| `streak` | §16 |
| `activeSession` | In-progress session, survives a force-quit |
| `pendingSync` | Offline queue, drained when connectivity returns |

---

## Offline sync and conflict resolution (§22)

**Sessions are append-only and idempotent.** Each carries a
`clientGeneratedId`; the server upserts on it, so replaying the queue is safe.

**Derived state is never synced.** CPS, tier and level are recomputed
server-side from the session log. A client cannot assert a rank — it can only
assert what was logged. This is what makes the §10 anti-cheat tractable: there is
one authority, and it is the session history.

**Conflicts:**

| Conflict | Resolution |
|---|---|
| Same session logged twice | Idempotency key; second write is a no-op |
| Client and server pillars disagree | **Server wins**, always. Recomputed from log. |
| Quest completed offline after expiry | Honoured if the *session* timestamp is inside the window |
| Streak diverges | Recomputed server-side from session dates |
| Two devices, same operator | Last-write-wins on profile fields, union on sessions |
