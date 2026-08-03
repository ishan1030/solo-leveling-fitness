# 15 · Technical architecture (§22)

> "Recommend a stack that a small team can actually operate, and justify each
> choice in one line. Flag anything that will become expensive at 100k users."

---

## Stack

| Layer | Choice | Justification (one line) |
|---|---|---|
| Client | **React Native + Expo (SDK 54)** | One codebase for both stores, and Expo's managed native modules mean no iOS build engineer on a small team. |
| Language | **TypeScript, strict** | The §18 fairness rule and the §10 no-auto-punish rule are enforced by the type system; without strict TS they are just comments. |
| State | **Zustand + AsyncStorage** | Synchronous, no provider tree, and persistence is one middleware — offline-first without a sync framework. |
| Navigation | **Phase switch, no navigator** | The first-run path has no back-navigable history, so a stack router would add a dependency and startup cost for nothing. |
| Backend | **Supabase (Postgres + Auth + Realtime + Edge Functions)** | One managed service covers auth, relational data, realtime raids and serverless verification, which is the entire backend a team of three can operate. |
| Database | **Postgres** | Leaderboards are ranking queries over indexed integers; this is exactly what a relational database is for and exactly what a document store is not. |
| Auth | **Supabase Auth** — Apple, Google, email | Apple Sign-In is mandatory on iOS given the other two; email covers Android users without a Google account, which matters in the launch market. |
| Realtime | **Supabase Realtime** (Postgres CDC) | Raids need 2–6 subscribers on one row; a full socket infrastructure is unjustifiable at that fan-out. |
| Push | **Expo Push → APNs/FCM** | One API for both platforms, and the §14 cap of 2/day means volume is trivially low. |
| TTS | **On-device (`expo-speech`)** | Zero marginal cost, works offline, and no audio leaves the device — which also removes a privacy surface. |
| Media | **Supabase Storage + CDN** | Rank cards are generated client-side; storage only holds shares. |
| Analytics | **PostHog (self-hosted or cloud)** | Event-based, no per-seat pricing, and self-hostable if the data-residency question in §14 resolves that way. |
| CI | **GitHub Actions + EAS Build** | Test suite runs in seconds; EAS removes the need for a Mac in CI. |

---

## Why not the obvious alternatives

**Firebase.** Leaderboards are the product. Ranking 100k operators by ladder
points with tier and verification filters is a `SELECT ... ORDER BY ... WHERE` in
Postgres and a client-side nightmare in Firestore, where you would end up
maintaining denormalised rank documents and paying per read to compute what an
index gives you free.

**A custom Node backend.** Three people cannot operate auth, realtime, storage,
and a database and also ship the product. Supabase is Postgres with the
operational burden removed; if it ever becomes the constraint, the data is
already in Postgres and the migration is a connection string.

**Server-driven UI.** The §4 target is under 90 seconds from open to rank reveal
with zero network dependency. Every screen in the first-run path renders from
bundled data.

---

## Offline-first sync

> §7: "Offline-first. Everything logs without connection and syncs later."

### The rule that makes it tractable

**Clients assert what was logged. Servers assert what it means.**

A client uploads sessions and sets. It never uploads a CPS, a tier, or a level —
those are recomputed server-side from the session history. A client cannot claim
a rank; it can only claim work. That single constraint is what makes the §10
anti-cheat possible, because there is exactly one authority and it is the log.

### Mechanics

| Concern | Approach |
|---|---|
| Queue | `pendingSync: string[]` in the store, persisted with everything else |
| Idempotency | Every session carries a `clientGeneratedId`; the server upserts on it |
| Replay safety | Sessions are append-only and immutable once written |
| Ordering | Not required — scoring is commutative over a window |
| Backoff | Exponential, capped at 5 minutes |

### Conflict resolution

| Conflict | Resolution |
|---|---|
| Same session uploaded twice | Idempotency key; second write is a no-op |
| Client and server pillars disagree | **Server wins.** Always. Recomputed from the log. |
| Quest completed offline after expiry | Honoured if the *session* timestamp falls inside the window |
| Streak diverges | Recomputed server-side from session dates |
| Two devices, one operator | Last-write-wins on profile fields, set union on sessions |
| Clock skew / device time manipulation | Session timestamps are validated against server receipt time; a session claiming to precede the previous sync is flagged for §10 review, not rejected |

---

## Leaderboard computation at scale

This is the part that gets expensive, so it is designed rather than assumed.

### Boards required

| Board | Scope | Cardinality |
|---|---|---|
| Global ladder | All operators, verified above COBALT | 100k+ |
| Tier ladder | Per tier | ~6 × N/6 |
| City ladder | Per city | ~50–5 000 |
| Venue ladder | Per venue | ~50–500 |
| Guild ladder | Per guild, and guilds globally | 5–50 members |
| Trial leaderboard | Weekly, opt-in | ~5% of active |

### Approach

**Not** computed on read. A materialised view refreshed on a schedule:

```sql
CREATE MATERIALIZED VIEW ladder_global AS
SELECT
  operator_id, display_name, tier, ladder_points, verification, city_id, venue_id,
  ROW_NUMBER() OVER (ORDER BY ladder_points DESC, updated_at ASC) AS rank
FROM operators
WHERE season_id = current_season()
  -- §10: boards above COBALT show verified operators only
  AND (tier_index < 3 OR verification <> 'SELF_REPORTED');

CREATE UNIQUE INDEX ON ladder_global (operator_id);
CREATE INDEX ON ladder_global (rank);
CREATE INDEX ON ladder_global (city_id, rank);
CREATE INDEX ON ladder_global (venue_id, rank);
```

| Board | Refresh cadence | Why |
|---|---|---|
| Global | 15 minutes | Nobody is watching global rank move in real time |
| City / venue | 15 minutes | Same |
| Guild | 15 minutes | Same |
| **Rival head-to-head** | **On write** | Two people, one row — this one genuinely is live |
| **Raid state** | **On write, via Realtime** | 2–6 subscribers waiting on each other |
| Trial | 5 minutes during an active trial | The clock is the point |

**The operator's own rank is served separately** and is always live, because
"where am I?" is the only ranking question anyone asks about themselves:

```sql
SELECT COUNT(*) + 1 FROM operators
WHERE season_id = $1 AND ladder_points > $2;
```

Indexed, sub-millisecond, and it does not require the materialised view to be
fresh.

---

## Verification pipeline (§10)

```
Client                    Edge Function              Postgres
  │                            │                        │
  ├─ scan code ───────────────►│                        │
  │  + single location read    │                        │
  │                            ├─ load venue secret ───►│
  │                            │◄───────────────────────┤
  │                            │                        │
  │                            ├─ HMAC(secret, window)  │
  │                            ├─ compare ± skew        │
  │                            ├─ haversine ≤ 120 m     │
  │                            ├─ cooldown ≥ 4 h ──────►│
  │                            │                        │
  │◄── accepted / rejection ───┤                        │
  │                            ├─ write check_in ──────►│
  │                            │  (distance only,       │
  │                            │   NEVER coordinates)   │
```

`codeSecret` never leaves the server. The client sends what it scanned and where
it is; the function returns a verdict. **The operator's coordinates are never
persisted** — only the computed distance, and only to defend an appeal.

---

## What gets expensive at 100k users

Flagged, as §22 requires.

### 1 · Materialised view refresh — **the first thing to break**

`REFRESH MATERIALIZED VIEW CONCURRENTLY` over 100k rows every 15 minutes is fine.
Over 1M rows with six board variants it is not.

**Mitigation path:** partition by season (already scoped), then move city and
venue boards to incrementally-maintained tables updated by trigger on
`ladder_points` change. Do not do this before it is needed — the view is simpler
and correct.

### 2 · Realtime connections — **the most expensive per-user cost**

Supabase Realtime bills on concurrent connections. If every open app holds one,
100k DAU with 5% concurrency is 5 000 connections.

**Mitigation:** subscribe **only during an active raid**. Nothing else in the
product needs a live connection — leaderboards poll on view, quests are generated
locally, and rival results resolve weekly. This should be enforced in code
review, because the natural instinct is to open a socket on app launch.

### 3 · Session storage growth

100k operators × 4 sessions/week × 15 sets ≈ **312M sets/year**.

**Mitigation:** sets are embedded as JSONB in the session row rather than stored
as rows, so this is ~4M session rows/year, not 312M set rows. Partition sessions
by month; archive beyond the §18 extended-history window to cold storage.

### 4 · Push notification fan-out

Season start and Boss Raid open are the only true broadcasts.

**Mitigation:** the §14 cap of 2/day for free operators bounds ordinary volume to
~200k/day, which is well inside Expo's free tier envelope. Broadcasts should be
staggered over 30 minutes by timezone bucket — which the §14 quiet-hours rule
requires anyway.

### 5 · Rank card image storage

Only shares are stored; generation is client-side via `react-native-view-shot`.

**Mitigation:** 30-day TTL on stored cards. The card is regenerable from the
profile at any time, so retention is a convenience and not a durability
requirement.

### 6 · The thing that will *not* get expensive

Scoring, quest generation, tier derivation and decay are pure functions running
on the client. At 100k users the server does zero progression computation on
read — it recomputes on write and stores the result. This is deliberate, and it is
why the materialised view is the first constraint rather than the tenth.

---

## Analytics events

| Event | Properties | Why |
|---|---|---|
| `calibration_started` | — | Funnel top |
| `calibration_question_answered` | `tableId`, `stepIndex`, `skipped` | Per-question drop-off |
| `calibration_abandoned` | `stepIndex` | §4 resume design |
| `calibration_completed` | `tier`, `cps`, `durationMs` | **Is it under 90 s?** |
| `reveal_skipped` | `atStage` | Is the cinematic too long? |
| `account_created` | `secondsAfterReveal` | Does having a rank convert? |
| `session_logged` | `setCount`, `verification`, `workUnits`, `flaggedSetCount` | Core loop |
| `set_flagged_implausible` | `code` | Are the §7 limits calibrated correctly? |
| `injury_logged` | — | Safety-critical. Watch the rate. |
| `verification_earned` | `tier`, `venueId` | Moat conversion |
| `trust_cap_seen` | `uncappedTier` | Does naming the cap convert to a check-in? |
| `rival_accepted` | `sameVenue`, `sameCity` | **The strongest churn predictor** |
| `raid_completed` | `partySize`, `diversity`, `multiplier` | Retention |
| `raid_abandoned` | `remainingCount` | Is the drop-out handling working? |
| `tier_changed` | `from`, `to`, `direction` | |
| `quest_completed` | `kind`, `pillar` | Generation quality |
| `anomaly_discovered` | `trigger` | Are they findable? |
| `subscription_started` | `plan`, `fromTrial` | |
| `subscription_cancelled` | `daysHeld`, `reason` | |

**Deliberately not collected:** location coordinates, anything derivable about
body composition, and any per-session health data beyond what the operator logged
as training.

---

## Environments

| Environment | Purpose |
|---|---|
| `local` | Expo dev client, Supabase local, seeded venues in Bharatpur |
| `staging` | EAS preview builds, separate Supabase project, synthetic ladder |
| `production` | EAS production, Supabase production |

**Progression config is remote-deliverable.** `ProgressionConfig` is data with an
invariant check (`assertConfigValid`), so tier thresholds, the XP curve, decay
rates and gain caps can be tuned from staging without a client release — which is
exactly the tuning that will be needed in the first month after launch.
