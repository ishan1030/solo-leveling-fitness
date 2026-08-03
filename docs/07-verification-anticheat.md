# 7 · Verification and anti-cheat logic

> "Make trust the product's moat." — §2 FAILURE 2

Implemented in `src/engine/verification.ts`.

---

## The four trust tiers

Always visible on the profile. Ascending.

| # | Tier | How it is earned | Ladder effect |
|---|---|---|---|
| 1 | `SELF_REPORTED` | Default. Calibration and unscanned sessions. | **Hard-capped at COBALT** |
| 2 | `QR_CHECK_IN` | Rotating venue code, scanned at session start **and** end | Cap lifted |
| 3 | `TRAINER_CONFIRM` | A verified trainer signs off on the session | Cap lifted |
| 4 | `EQUIPMENT_TAP` | Partner-gym machine or NFC tag | Cap lifted |

### Where the cap is applied

Not at write time. Inside `computeStanding()` — the single function every tier
badge, ladder row and rank card resolves through.

```ts
export function computeStanding(profile, config): Standing {
  const cps = computeCps(profile.pillars, config);
  const uncappedTier = tierForCps(cps, config);
  const tier = applyTrustCap(uncappedTier, profile.verification, config);
  return { cps, tier, uncappedTier, trustCapped: tier !== uncappedTier, ... };
}
```

Two consequences worth stating:

1. **No call site can forget the cap.** There is no code path that renders a tier
   without passing through it.
2. **The uncapped tier is retained.** The operator is shown exactly what is being
   withheld, which turns the cap from a punishment into an invitation. §6 requires
   this framing and the copy is written for it.

**Profile verification lapses.** `resolveProfileVerification()` returns the
highest tier earned in the trailing **30 days**. Stop verifying and the cap comes
back. This is what keeps the top of the ladder honest over time rather than only
at the moment of first check-in.

---

## QR check-in

### Code derivation

```
code = base32( HMAC-SHA256( venue.codeSecret, floor(unixSeconds / 60) ) )[0..7]
```

- Rotates every **60 seconds**
- `codeSecret` is server-held and **never sent to a client**
- The venue display polls for its current code; the client submits what it scanned

`src/engine/verification.ts` ships a deterministic FNV-based stand-in
(`deriveVenueCode`) so the engine stays pure and testable. The production
construction is the HMAC above — the validation logic around it is unchanged.

### Validation order

```
1. venue.certified?            → venue_not_certified   (session still logs)
2. location present?           → no_location
3. distance ≤ 120 m?           → outside_geofence      (reports measured distance)
4. code in accepted window?    → code_expired
5. ≥ 4 h since last verified?  → cooldown_active
   ↓
   ACCEPTED → grants QR_CHECK_IN
```

**Accepted window.** The current window, the previous one, and a ±15 s skew
tolerance. A scan that lands one second after rotation is not punished for the
user's reaction time.

**Why `code_expired` covers wrong codes too.** Distinguishing "expired" from
"invalid" would leak information about the code space. Both report as expired,
which is also the overwhelmingly common case.

### What each rule defeats

| Attack | Defeated by |
|---|---|
| Screenshot the code, send to a friend across town | Geofence — the code is valid but the location is not |
| Screenshot the code, use it later | 60 s rotation |
| Sit outside the gym and scan through the window | 120 m geofence, tuned to a building not a block |
| Scan in, leave immediately | Check-in required at start **and** end |
| Scan repeatedly to farm verified sessions | 4-hour cooldown |
| Reverse-engineer the code from observed samples | Server-held HMAC secret |

### The cooldown is not a lockout

§21 forbids penalising extra training. A cooling-down operator sees:

> You already have a verified session in the last 4 hours. Train if you want to —
> it logs normally, and the next verified slot opens in 2.5 h.

Tested: the message must contain "logs normally".

---

## Leaderboard eligibility

> "Leaderboards above COBALT display verified operators only."

```ts
isLeaderboardEligible(tier, verification, boardMinimumTier = 'STORM')
  = tierIndex(tier) < tierIndex(boardMinimumTier)   // lower boards open to all
    || isVerified(verification)
```

Applied as a **filter on the query**, not a post-hoc hide, so an unverified
operator never occupies a rank slot they would then be stripped from.

---

## Statistical implausibility review

> "Statistically implausible progression is auto-flagged for review, not
> auto-punished."

### Detectors

| Signal | Threshold | Reasoning |
|---|---|---|
| CPS gain vs. the §5 cap | > (windowDays / 7) × 2.0 × 1.05 | The cap bounds gain at 2.0/week. Exceeding it means the cap was bypassed — a client bug, a replay, or a compromised account. |
| Fast climb, zero verified sessions | ΔCPS > 5 with 0 verified | The classic self-report inflation pattern §2 FAILURE 2 describes |

### The architectural guarantee

```ts
export interface ReviewFlag {
  flagged: boolean;
  reasons: string[];
  status: ReviewStatus;
  autoPunished: false;   // ← literal type, not boolean
  operatorCopy: string | null;
}
```

`autoPunished` is typed as the **literal `false`**. Nothing downstream can set it
to `true`. A future change that turned this detector into an enforcement action
would require deliberately editing the type and confronting the comment
explaining why it is written that way.

### What the operator sees

> Some recent progression is being reviewed by a person before it counts toward
> the ladder. Your rank, your log, and your streak are untouched while that
> happens. You can add context or appeal at any time.

Tested to contain "untouched". Nothing is removed, nothing is hidden, no badge of
suspicion appears on the public profile.

---

## Appeals — human in the loop

```ts
export function resolveAppeal(appeal, decision, humanReviewerId, now): Appeal {
  if (!humanReviewerId) {
    throw new Error('appeals require a human reviewer — §10 forbids automated resolution');
  }
  ...
}
```

The function **throws** on an empty reviewer id. There is no automated resolution
path, and there is no way to add one without removing that guard.

| Status | Meaning |
|---|---|
| `SUBMITTED` | Operator has filed |
| `IN_REVIEW` | A human has picked it up |
| `UPHELD` | Flag stands; the progression in question does not count |
| `OVERTURNED` | Flag cleared; progression credited in full |

---

## Impossible-input handling (§7)

Distinct from anti-cheat, and deliberately so. A user typing `900` into a kg
field is almost always a typo, not an attack.

### The three-part policy

1. **Never silently discard.** The set is logged exactly as entered — the
   operator's training log is theirs.
2. **Never accuse.** Copy assumes a typo, because it almost always is.
3. **Score zero.** Excluded from pillar points, PRs, and every leaderboard until
   corrected.

### Detectors

| Code | Trigger |
|---|---|
| `reps_exceed_limit` | Above the movement's per-set rep ceiling |
| `load_exceeds_limit` | Above the movement's load ceiling |
| `load_exceeds_world_record_ratio` | Above 6× bodyweight, any movement |
| `duration_exceeds_limit` | Longer than one entry can represent |
| `distance_exceeds_limit` | Beyond the scoring range |
| `speed_exceeds_limit` | distance / time exceeds the movement's max speed |
| `negative_value` | Any negative quantity |

### Copy

> 900 kg is above the range we score for this movement. Check the number —
> pounds entered as kilos is the usual cause.

> That is more than 6× your bodyweight. We have left it in your log, but it will
> not count toward your score until you confirm it.

Tested against `/cheat|lying|liar|fake|fraud|banned/i`. None of these messages
may accuse.

---

## Partner gym programme

```
Gym applies
   → document verification (registration, address, photos)
   → admin review
   → QR provisioning (codeSecret generated, never leaves the server)
   → venue marked certified
```

**Certified venues receive**

- A listing in venue search
- A venue badge on member profiles
- A members-only challenge tool
- Placement on the venue leaderboard: city → country → global

---

## Privacy (§10)

> "Location is used solely to validate a check-in and for opt-in leaderboards.
> Never continuously tracked. Never sold. State this in-product, in plain
> language."

**Implemented as:**

| Guarantee | Mechanism |
|---|---|
| Single read, at scan time only | `validateCheckIn` takes location as an argument; nothing polls |
| Never stored | Only the computed `distanceMetres` is persisted, and only to defend an appeal |
| No background tracking | `ACCESS_BACKGROUND_LOCATION` is in `blockedPermissions` in `app.config.ts` |
| Stated in plain language | `STATIC_COPY.privacyLocation`, tested for "not track" and "sell" |

The in-product statement:

> We read your location once, at the moment you scan into a venue, to confirm you
> are there. We do not track you in the background, we do not build a location
> history, and we do not sell it. Leaderboards outside your venue are opt-in.

The blocked Android permission is worth emphasising: the app **cannot** track in
the background, because the capability is not compiled into it.
