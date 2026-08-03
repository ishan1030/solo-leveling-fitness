import { round2 } from './progression';
import { PILLARS, type Pillar, type VerificationTier, isVerified } from './types';

/**
 * §9 — RAIDS. The primary retention mechanic, and the feature §2 FAILURE 3 is
 * defeated with.
 *
 * "A RAID is a workout that requires 2–6 operators to be physically present
 * together, or verifiably training in the same window."
 */

export const RAID_MIN_PARTY = 2;
export const RAID_MAX_PARTY = 6;

/** §9 anti-abuse: the shared window inside which participation counts. */
export const RAID_SHARED_WINDOW_MINUTES = 90;
/** Metres. Proximity tolerance when co-location is the verification path. */
export const RAID_PROXIMITY_METRES = 150;
/** §9 anti-abuse: cooldown between raids credited to the same pairing. */
export const RAID_PAIR_COOLDOWN_HOURS = 20;

export type RaidStatus = 'OPEN' | 'ACTIVE' | 'COMPLETE' | 'FAILED' | 'ABANDONED';

export interface RaidParticipant {
  operatorId: string;
  /** The pillar this operator is contributing, used for the diversity bonus. */
  contributingPillar: Pillar;
  verification: VerificationTier;
  /** §9: "Raid completion requires every participant to log their portion." */
  loggedPortion: boolean;
  /** ISO datetime of their session start, for shared-window validation. */
  sessionStartedAt: string | null;
  /** Null when the raid is not proximity-verified. */
  location: { lat: number; lon: number } | null;
  droppedOut: boolean;
}

export interface Raid {
  id: string;
  hostOperatorId: string;
  status: RaidStatus;
  participants: RaidParticipant[];
  /** True for the monthly §9 Boss Raid, which has a global completion counter. */
  isBossRaid: boolean;
  openedAt: string;
  /** Set when proximity rather than shared-window verification is used. */
  requiresProximity: boolean;
}

// ---------------------------------------------------------------------------
// §9 — Reward scaling
// ---------------------------------------------------------------------------

/**
 * "Raid rewards scale with party size and with the pillar diversity of the
 * party — a runner plus a lifter completing a raid together earns more than two
 * lifters."
 *
 * Both multipliers are deliberately modest. A raid must be worth organising
 * without becoming the only rational way to train, or solo operators are
 * pushed out of the ladder.
 */
export function partySizeMultiplier(size: number): number {
  if (size < RAID_MIN_PARTY) return 0;
  const clamped = Math.min(RAID_MAX_PARTY, size);
  // 2 -> 1.10, 3 -> 1.20, 4 -> 1.30, 5 -> 1.40, 6 -> 1.50
  return round2(1 + (clamped - 1) * 0.1);
}

/**
 * Diversity is measured as distinct contributing pillars over party size, so a
 * mixed pair beats a matched pair, and a four-pillar party of four is the
 * ceiling.
 */
export function pillarDiversityMultiplier(participants: RaidParticipant[]): number {
  const active = participants.filter((p) => !p.droppedOut);
  if (active.length === 0) return 1;

  const distinct = new Set(active.map((p) => p.contributingPillar)).size;
  const maxPossible = Math.min(active.length, PILLARS.length);
  const ratio = maxPossible <= 1 ? 0 : (distinct - 1) / (maxPossible - 1);
  // 1.0 for a fully matched party, up to 1.4 for maximal diversity.
  return round2(1 + ratio * 0.4);
}

export function raidRewardMultiplier(raid: Raid): number {
  const active = raid.participants.filter((p) => !p.droppedOut);
  const base = partySizeMultiplier(active.length) * pillarDiversityMultiplier(active);
  // The monthly Boss Raid is worth showing up for.
  return round2(raid.isBossRaid ? base * 1.5 : base);
}

// ---------------------------------------------------------------------------
// §9 — Anti-abuse
// ---------------------------------------------------------------------------

export type RaidRejectionCode =
  | 'party_too_small'
  | 'party_too_large'
  | 'outside_shared_window'
  | 'outside_proximity'
  | 'pair_cooldown_active'
  | 'unverified_participant'
  | 'portion_not_logged';

export interface RaidValidation {
  valid: boolean;
  rejections: { code: RaidRejectionCode; operatorId: string | null; detail: string }[];
}

/** Metres between two coordinates, via the haversine formula. */
export function distanceMetres(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export interface RaidValidationContext {
  raid: Raid;
  /** Most recent completed raid timestamp per "a|b" pairing key, ISO. */
  lastRaidByPair: Record<string, string>;
  now: Date;
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/**
 * §9: "Specify the anti-abuse rules: proximity or shared-window verification,
 * cooldowns, and what happens when one participant drops mid-raid."
 *
 * Every rule reports which operator failed it, so the raid screen can show
 * "waiting on 1 of 4" rather than a blank failure.
 */
export function validateRaid(ctx: RaidValidationContext): RaidValidation {
  const { raid, now } = ctx;
  const rejections: RaidValidation['rejections'] = [];
  const active = raid.participants.filter((p) => !p.droppedOut);

  if (active.length < RAID_MIN_PARTY) {
    rejections.push({
      code: 'party_too_small',
      operatorId: null,
      detail: `A raid needs at least ${RAID_MIN_PARTY} operators still in.`,
    });
  }
  if (active.length > RAID_MAX_PARTY) {
    rejections.push({
      code: 'party_too_large',
      operatorId: null,
      detail: `A raid caps at ${RAID_MAX_PARTY} operators.`,
    });
  }

  for (const participant of active) {
    // §9: "One person cannot carry the group."
    if (!participant.loggedPortion) {
      rejections.push({
        code: 'portion_not_logged',
        operatorId: participant.operatorId,
        detail: 'Has not logged their portion yet.',
      });
    }

    // A raid is only worth ladder credit if the sessions inside it are verified.
    if (!isVerified(participant.verification)) {
      rejections.push({
        code: 'unverified_participant',
        operatorId: participant.operatorId,
        detail: 'Session is self-reported, so it cannot be credited to the raid.',
      });
    }
  }

  // Shared-window check: every participant must have started inside the window.
  const starts = active
    .map((p) => p.sessionStartedAt)
    .filter((s): s is string => s !== null)
    .map((s) => new Date(s).getTime());

  if (starts.length === active.length && starts.length > 1) {
    const spreadMinutes = (Math.max(...starts) - Math.min(...starts)) / 60_000;
    if (spreadMinutes > RAID_SHARED_WINDOW_MINUTES) {
      rejections.push({
        code: 'outside_shared_window',
        operatorId: null,
        detail: `Sessions span ${Math.round(spreadMinutes)} minutes; the raid window is ${RAID_SHARED_WINDOW_MINUTES}.`,
      });
    }
  }

  // Proximity check, when the raid was opened as an in-person raid.
  if (raid.requiresProximity) {
    const anchor = active.find((p) => p.location !== null)?.location ?? null;
    if (anchor) {
      for (const participant of active) {
        if (!participant.location) {
          rejections.push({
            code: 'outside_proximity',
            operatorId: participant.operatorId,
            detail: 'No location recorded for an in-person raid.',
          });
          continue;
        }
        const metres = distanceMetres(anchor, participant.location);
        if (metres > RAID_PROXIMITY_METRES) {
          rejections.push({
            code: 'outside_proximity',
            operatorId: participant.operatorId,
            detail: `${metres} m from the party; the limit is ${RAID_PROXIMITY_METRES} m.`,
          });
        }
      }
    }
  }

  // Pair cooldown: the same two people cannot farm each other for repeat credit.
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const key = pairKey(active[i]!.operatorId, active[j]!.operatorId);
      const last = ctx.lastRaidByPair[key];
      if (!last) continue;
      const hours = (now.getTime() - new Date(last).getTime()) / 3_600_000;
      if (hours < RAID_PAIR_COOLDOWN_HOURS) {
        rejections.push({
          code: 'pair_cooldown_active',
          operatorId: active[j]!.operatorId,
          detail: `This pairing raided ${Math.round(hours)} h ago; the cooldown is ${RAID_PAIR_COOLDOWN_HOURS} h.`,
        });
      }
    }
  }

  return { valid: rejections.length === 0, rejections };
}

/**
 * §9: "what happens when one participant drops mid-raid."
 *
 * The remaining party is NOT punished. If enough operators remain to still form
 * a legal raid, it continues at the recomputed (smaller) multiplier. If it drops
 * below two, everyone who did log their portion keeps that session's normal solo
 * credit — the work was still done — and the raid closes as ABANDONED with no
 * penalty to anyone, including the operator who left. People have lives.
 */
export interface DropOutResult {
  raid: Raid;
  outcome: 'continues' | 'abandoned';
  newMultiplier: number;
  /** Operators whose logged work converts to solo credit. */
  refundedToSoloCredit: string[];
  noticeCopy: string;
}

export function handleDropOut(raid: Raid, leavingOperatorId: string): DropOutResult {
  const participants = raid.participants.map((p) =>
    p.operatorId === leavingOperatorId ? { ...p, droppedOut: true } : p,
  );
  const remaining = participants.filter((p) => !p.droppedOut);

  if (remaining.length >= RAID_MIN_PARTY) {
    const next: Raid = { ...raid, participants, status: 'ACTIVE' };
    return {
      raid: next,
      outcome: 'continues',
      newMultiplier: raidRewardMultiplier(next),
      refundedToSoloCredit: [],
      noticeCopy: `Party is down to ${remaining.length}. Raid continues at ${raidRewardMultiplier(next)}×.`,
    };
  }

  const next: Raid = { ...raid, participants, status: 'ABANDONED' };
  return {
    raid: next,
    outcome: 'abandoned',
    newMultiplier: 1,
    refundedToSoloCredit: participants.filter((p) => p.loggedPortion).map((p) => p.operatorId),
    noticeCopy:
      'Raid closed early. Everything you logged still counts as a normal session. No penalty, for anyone.',
  };
}

// ---------------------------------------------------------------------------
// §9 — Raid streaks per pairing
// ---------------------------------------------------------------------------

export interface PairStreak {
  pairKey: string;
  count: number;
  lastCompletedAt: string;
}

/**
 * "Raid streaks tracked per pairing, creating standing social obligation."
 *
 * A streak survives a gap of up to 10 days, which is long enough that a holiday
 * does not destroy a months-old partnership — the obligation should feel like a
 * friendship, not a subscription.
 */
export const PAIR_STREAK_GRACE_DAYS = 10;

export function updatePairStreak(
  existing: PairStreak | undefined,
  key: string,
  completedAt: Date,
): PairStreak {
  if (!existing) {
    return { pairKey: key, count: 1, lastCompletedAt: completedAt.toISOString() };
  }

  const gapDays =
    (completedAt.getTime() - new Date(existing.lastCompletedAt).getTime()) / 86_400_000;

  return {
    pairKey: key,
    count: gapDays <= PAIR_STREAK_GRACE_DAYS ? existing.count + 1 : 1,
    lastCompletedAt: completedAt.toISOString(),
  };
}
