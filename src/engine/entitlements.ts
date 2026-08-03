/**
 * §18 — MONETIZATION, and the fairness rule.
 *
 * "FAIRNESS RULE — enforce this at the architecture level, not just in copy:
 *    No paid tier may grant XP multipliers, stat bonuses, ladder points, extra
 *    quest slots, faster verification, or any competitive advantage whatsoever.
 *    Paid value is voice, coaching, analytics, and cosmetics. The ladder stays
 *    purely performance-based."
 *
 * This module is the architectural enforcement. Entitlements are split into two
 * disjoint sets by TYPE, not by convention:
 *
 *   - `CompetitiveCapability` — everything that can move the ladder. There is no
 *     mechanism anywhere in this file by which a purchase grants one.
 *   - `PaidCapability` — voice, analytics, cosmetics. Purchasable.
 *
 * `entitlementsFor()` cannot return a competitive capability, because its return
 * type does not contain one. A future change that tried to sell an XP multiplier
 * would not typecheck without editing this file, which is exactly the review
 * gate the spec is asking for.
 */

// ---------------------------------------------------------------------------
// The two disjoint capability sets
// ---------------------------------------------------------------------------

/**
 * Capabilities that affect the ladder. Listed here ONLY so the fairness test can
 * assert that no entitlement grants one. Nothing purchasable references this type.
 */
export const COMPETITIVE_CAPABILITIES = [
  'XP_MULTIPLIER',
  'STAT_BONUS',
  'LADDER_POINTS',
  'EXTRA_QUEST_SLOT',
  'FASTER_VERIFICATION',
  'RAID_REWARD_BONUS',
  'DECAY_IMMUNITY',
  'TIER_CAP_BYPASS',
] as const;
export type CompetitiveCapability = (typeof COMPETITIVE_CAPABILITIES)[number];

/** Capabilities that money may buy. Every one is voice, coaching, analytics or cosmetic. */
export const PAID_CAPABILITIES = [
  'VOICE_COACH',
  'VOICE_PERSONALITY_STRICT',
  'VOICE_PERSONALITY_COMMANDER',
  'ADAPTIVE_PROGRAMMING',
  'DEEP_ANALYTICS',
  'UNLIMITED_RANK_CARD_STYLES',
  'EXTENDED_HISTORY',
  'PRIORITY_EVENT_ENTRY',
  'PASS_PAID_TRACK',
  'COSMETIC_SIGILS',
] as const;
export type PaidCapability = (typeof PAID_CAPABILITIES)[number];

/** Capabilities every operator has, forever, for free. §18: "The competitive game is entirely free." */
export const FREE_CAPABILITIES = [
  'LEVELING',
  'CORE_QUESTS',
  'LOGGING',
  'RANKINGS',
  'FRIENDS',
  'RIVALS',
  'GUILDS',
  'RAIDS',
  'ACHIEVEMENTS',
  'TEXT_NOTIFICATIONS',
  'CALIBRATION',
  'VERIFICATION',
  'RANK_CARD',
  'SEASONS',
  'TERRITORY',
  'PASS_FREE_TRACK',
] as const;
export type FreeCapability = (typeof FREE_CAPABILITIES)[number];

export type Capability = FreeCapability | PaidCapability;

// ---------------------------------------------------------------------------
// Subscription state
// ---------------------------------------------------------------------------

export type SubscriptionStatus = 'NONE' | 'TRIAL' | 'ACTIVE' | 'LAPSED' | 'CANCELLED_ACTIVE';

export interface EntitlementState {
  subscription: SubscriptionStatus;
  /** §17: sold per season, independent of subscription. Free users may buy it. */
  ownsSeasonPass: boolean;
  /** §18: 7-day premium trial. */
  trialEndsAt: string | null;
}

export const PREMIUM_TRIAL_DAYS = 7;

function subscriptionIsCurrent(state: EntitlementState, now: Date): boolean {
  if (state.subscription === 'ACTIVE' || state.subscription === 'CANCELLED_ACTIVE') return true;
  if (state.subscription === 'TRIAL') {
    if (!state.trialEndsAt) return false;
    return new Date(state.trialEndsAt).getTime() > now.getTime();
  }
  return false;
}

/**
 * The single source of truth for what an operator can do.
 *
 * Return type is `Set<Capability>` — a union of FREE and PAID only. The
 * competitive set is structurally unreachable from here.
 */
export function entitlementsFor(state: EntitlementState, now: Date): Set<Capability> {
  const granted = new Set<Capability>(FREE_CAPABILITIES);

  if (subscriptionIsCurrent(state, now)) {
    for (const capability of PAID_CAPABILITIES) {
      // The paid track is gated on the pass purchase, not the subscription.
      if (capability === 'PASS_PAID_TRACK') continue;
      granted.add(capability);
    }
  }

  if (state.ownsSeasonPass) {
    granted.add('PASS_PAID_TRACK');
    granted.add('COSMETIC_SIGILS');
  }

  return granted;
}

export function can(state: EntitlementState, capability: Capability, now: Date): boolean {
  return entitlementsFor(state, now).has(capability);
}

// ---------------------------------------------------------------------------
// §14 — Lapse behaviour
// ---------------------------------------------------------------------------

export interface LapseOutcome {
  voiceRevertsToText: boolean;
  coachingHistoryRemainsReadable: true;
  /** §14: "nothing earned is ever removed." */
  earnedContentRemoved: false;
  ladderPositionAffected: false;
  message: string;
}

/**
 * §14: "On lapsed subscription: voice reverts to text, all coaching history
 * stays readable, nothing earned is ever removed."
 *
 * Three of the four fields are literal types, so the guarantees are compile-time
 * facts rather than test assertions that could be deleted.
 */
export function describeLapse(): LapseOutcome {
  return {
    voiceRevertsToText: true,
    coachingHistoryRemainsReadable: true,
    earnedContentRemoved: false,
    ladderPositionAffected: false,
    message:
      'Your subscription has ended. AXIOM will write instead of speak. Every session, every title, every rank you earned stays exactly where it is.',
  };
}

// ---------------------------------------------------------------------------
// The entitlement matrix — §24 deliverable 9
// ---------------------------------------------------------------------------

export interface MatrixRow {
  capability: Capability;
  free: boolean;
  premium: boolean;
  pass: boolean;
  /** Present so the matrix can be rendered with the reason, per §18. */
  category: 'competitive_core' | 'voice' | 'analytics' | 'cosmetic';
}

const CATEGORY: Record<Capability, MatrixRow['category']> = {
  LEVELING: 'competitive_core',
  CORE_QUESTS: 'competitive_core',
  LOGGING: 'competitive_core',
  RANKINGS: 'competitive_core',
  FRIENDS: 'competitive_core',
  RIVALS: 'competitive_core',
  GUILDS: 'competitive_core',
  RAIDS: 'competitive_core',
  ACHIEVEMENTS: 'competitive_core',
  TEXT_NOTIFICATIONS: 'competitive_core',
  CALIBRATION: 'competitive_core',
  VERIFICATION: 'competitive_core',
  RANK_CARD: 'competitive_core',
  SEASONS: 'competitive_core',
  TERRITORY: 'competitive_core',
  PASS_FREE_TRACK: 'competitive_core',
  VOICE_COACH: 'voice',
  VOICE_PERSONALITY_STRICT: 'voice',
  VOICE_PERSONALITY_COMMANDER: 'voice',
  ADAPTIVE_PROGRAMMING: 'analytics',
  DEEP_ANALYTICS: 'analytics',
  UNLIMITED_RANK_CARD_STYLES: 'cosmetic',
  EXTENDED_HISTORY: 'analytics',
  PRIORITY_EVENT_ENTRY: 'cosmetic',
  PASS_PAID_TRACK: 'cosmetic',
  COSMETIC_SIGILS: 'cosmetic',
};

export function entitlementMatrix(): MatrixRow[] {
  const rows: MatrixRow[] = [];

  for (const capability of FREE_CAPABILITIES) {
    rows.push({ capability, free: true, premium: true, pass: true, category: CATEGORY[capability] });
  }
  for (const capability of PAID_CAPABILITIES) {
    const isPassOnly = capability === 'PASS_PAID_TRACK';
    rows.push({
      capability,
      free: false,
      premium: !isPassOnly,
      pass: isPassOnly || capability === 'COSMETIC_SIGILS',
      category: CATEGORY[capability],
    });
  }

  return rows;
}

/**
 * §18: "No paid tier may grant ... any competitive advantage whatsoever."
 *
 * Runtime audit, so the invariant is checked in production and not only in CI.
 * Called at app start alongside assertConfigValid.
 */
export function assertNoCompetitiveAdvantageIsSold(): void {
  const paid = new Set<string>(PAID_CAPABILITIES);
  for (const competitive of COMPETITIVE_CAPABILITIES) {
    if (paid.has(competitive)) {
      throw new Error(
        `§18 fairness rule violated: ${competitive} appears in PAID_CAPABILITIES. The ladder must stay purely performance-based.`,
      );
    }
  }

  const free = new Set<string>(FREE_CAPABILITIES);
  for (const competitive of COMPETITIVE_CAPABILITIES) {
    if (free.has(competitive)) {
      throw new Error(
        `${competitive} is a ladder-affecting capability and must not be modelled as an entitlement at all.`,
      );
    }
  }
}
