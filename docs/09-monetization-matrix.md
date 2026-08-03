# 9 · Monetization and entitlement matrix

Implemented in `src/engine/entitlements.ts`.

---

## The fairness rule

> **§18:** "No paid tier may grant XP multipliers, stat bonuses, ladder points,
> extra quest slots, faster verification, or any competitive advantage
> whatsoever. Paid value is voice, coaching, analytics, and cosmetics. The ladder
> stays purely performance-based. This rule is the reason the ladder is worth
> climbing. Do not compromise it."
>
> "**enforce this at the architecture level, not just in copy**"

### How it is enforced architecturally

Capabilities are split into **disjoint unions by type**:

```ts
type CompetitiveCapability =
  | 'XP_MULTIPLIER' | 'STAT_BONUS' | 'LADDER_POINTS' | 'EXTRA_QUEST_SLOT'
  | 'FASTER_VERIFICATION' | 'RAID_REWARD_BONUS' | 'DECAY_IMMUNITY'
  | 'TIER_CAP_BYPASS';

type Capability = FreeCapability | PaidCapability;   // ← no Competitive

export function entitlementsFor(state, now): Set<Capability>
```

**`entitlementsFor` cannot return a competitive capability, because its return
type does not contain one.** Selling an XP multiplier would not typecheck. The
`CompetitiveCapability` union exists solely so the violation has a name and so
the audit below can assert against it.

A runtime audit runs at app start, alongside the progression config check:

```ts
export function assertNoCompetitiveAdvantageIsSold(): void {
  // throws if any COMPETITIVE_CAPABILITIES member appears in
  // PAID_CAPABILITIES or FREE_CAPABILITIES
}
```

Called from `src/state/store.ts` at module load, so the check runs in production
and not only in CI.

---

## The matrix

### Free — the entire competitive game

| Capability | Free | Premium | Pass |
|---|:--:|:--:|:--:|
| Calibration | ● | ● | ● |
| Levelling | ● | ● | ● |
| All core quests | ● | ● | ● |
| Logging (302 movements, offline) | ● | ● | ● |
| Rankings and leaderboards | ● | ● | ● |
| Friends | ● | ● | ● |
| **Rivals** | ● | ● | ● |
| **Guilds** | ● | ● | ● |
| **Raids** | ● | ● | ● |
| Achievements | ● | ● | ● |
| Verification | ● | ● | ● |
| Rank card | ● | ● | ● |
| Seasons | ● | ● | ● |
| Territory | ● | ● | ● |
| Season pass — free track | ● | ● | ● |
| Text notifications (≤2/day) | ● | ● | ● |

### Premium — voice, coaching, analytics

| Capability | Free | Premium | Pass | Category |
|---|:--:|:--:|:--:|---|
| AXIOM voice coach | ○ | ● | ○ | voice |
| Strict Trainer personality | ○ | ● | ○ | voice |
| Elite Commander personality | ○ | ● | ○ | voice |
| Adaptive programming | ○ | ● | ○ | analytics |
| Deep analytics | ○ | ● | ○ | analytics |
| Extended history | ○ | ● | ○ | analytics |
| Unlimited rank card styles | ○ | ● | ○ | cosmetic |
| Priority event entry | ○ | ● | ○ | cosmetic |

### Season pass — cosmetics and titles only

| Capability | Free | Premium | Pass | Category |
|---|:--:|:--:|:--:|---|
| Pass paid track | ○ | ○ | ● | cosmetic |
| Cosmetic sigils | ○ | ● | ● | cosmetic |

**Never sold, at any price**

| Capability | Status |
|---|---|
| XP multiplier | Structurally unsellable |
| Stat bonus | Structurally unsellable |
| Ladder points | Structurally unsellable |
| Extra quest slot | Structurally unsellable |
| Faster verification | Structurally unsellable |
| Raid reward bonus | Structurally unsellable |
| Decay immunity | Structurally unsellable |
| Tier cap bypass | Structurally unsellable |

---

## Subscription states

| State | Paid capabilities | Notes |
|---|:--:|---|
| `NONE` | ○ | Free operator. Full competitive game. |
| `TRIAL` | ● | 7-day premium trial, expires on `trialEndsAt` |
| `ACTIVE` | ● | Paying |
| `CANCELLED_ACTIVE` | ● | Cancelled but inside the paid period |
| `LAPSED` | ○ | See below |

**The season pass is independent of the subscription.** A free operator can buy
the pass; a subscriber does not get it for free. Both are asserted.

---

## What lapsing does

> **§14:** "On lapsed subscription: voice reverts to text, all coaching history
> stays readable, nothing earned is ever removed."

```ts
export interface LapseOutcome {
  voiceRevertsToText: boolean;
  coachingHistoryRemainsReadable: true;   // literal
  earnedContentRemoved: false;            // literal
  ladderPositionAffected: false;          // literal
  message: string;
}
```

Three of the four fields are **literal types**, so the guarantees are compile-time
facts rather than test assertions someone could delete.

The message:

> Your subscription has ended. AXIOM will write instead of speak. Every session,
> every title, every rank you earned stays exactly where it is.

---

## Pass mechanics (§17)

| Property | Value |
|---|---|
| Tiers | 50 |
| XP per tier | 1 000 |
| Source of tier XP | **Quests only** |
| Purchasable XP | **None** |
| Free track | Cosmetics, titles, XP |
| Paid track | Cosmetics and titles **exclusively** |
| Sold | Per season, independent of subscription |

```ts
export function passTierForXp(questXpThisSeason: number): number
```

The signature enforces §17's rule: there is **no parameter through which
purchased XP could enter**. Adding one would require changing this function,
which would surface in review.

---

## Pricing — NOT CONFIRMED

§18 specifies `{{price}}/mo`, `{{price}}/yr`, `{{price}}/season`. The master
prompt instructs: *"Where a value appears as {{LIKE_THIS}}, ask me to confirm it.
Do not invent it."*

These three values are **unconfirmed** and are listed in
[14-open-questions.md](14-open-questions.md).

What is specified, because the brief fixes it:

| Requirement | Status |
|---|---|
| 7-day premium trial | Specified, implemented (`PREMIUM_TRIAL_DAYS`) |
| Regional pricing for Nepal | Required — store price tiers, not a custom system |
| Restore purchases | Required |
| **One-tap cancellation path** | Required, screen I3 |
| Store-compliant subscription disclosure | Required — full price, period, and renewal terms adjacent to the purchase button |

---

## Why the fairness rule is the business model

The temptation in this genre is to sell an XP boost. It converts well and it kills
the product, because the moment a rank can be bought, §2 FAILURE 2 returns through
a different door — the ladder becomes fiction again, just with a receipt attached.

MERIDIAN's proposition is that an ECLIPSE operator scanned into a real gym and did
the work. Every purchasable competitive advantage is a hole in that claim.

So the rule is not a constraint on the business model. It **is** the business
model: the ladder is worth climbing because it cannot be bought, and people pay
for the voice, the coaching and the cosmetics that surround something worth
climbing.
