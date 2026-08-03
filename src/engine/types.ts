/**
 * Core domain types.
 *
 * Everything in src/engine is pure TypeScript: no React, no React Native, no
 * network, no clock reads except through an explicitly passed `now`. That is
 * what makes the ladder auditable — every number a user sees can be recomputed
 * from stored inputs and replayed in a test.
 */

// ---------------------------------------------------------------------------
// §5 — Pillars and tiers
// ---------------------------------------------------------------------------

export const PILLARS = ['strength', 'endurance', 'consistency', 'mobility'] as const;
export type Pillar = (typeof PILLARS)[number];

export type PillarScores = Record<Pillar, number>;

export const TIERS = ['ASH', 'IRON', 'COBALT', 'STORM', 'SOLAR', 'ECLIPSE'] as const;
export type Tier = (typeof TIERS)[number];

/** Ascending index, so tiers can be compared arithmetically. ASH = 0. */
export function tierIndex(tier: Tier): number {
  return TIERS.indexOf(tier);
}

export function tierFromIndex(index: number): Tier {
  const clamped = Math.max(0, Math.min(TIERS.length - 1, Math.round(index)));
  // TIERS is a non-empty const tuple; the clamp guarantees a hit.
  return TIERS[clamped] as Tier;
}

// ---------------------------------------------------------------------------
// §10 — Verification / trust
// ---------------------------------------------------------------------------

/**
 * Ascending trust. The numeric values matter: §6 hard-caps SELF_REPORTED
 * profiles at COBALT, and §10 restricts leaderboards above COBALT to verified
 * operators, so both rules are expressed as comparisons on this scale.
 */
export const VERIFICATION_TIERS = [
  'SELF_REPORTED',
  'QR_CHECK_IN',
  'TRAINER_CONFIRM',
  'EQUIPMENT_TAP',
] as const;
export type VerificationTier = (typeof VERIFICATION_TIERS)[number];

export function verificationRank(tier: VerificationTier): number {
  return VERIFICATION_TIERS.indexOf(tier);
}

/** Anything above SELF_REPORTED counts as a verified session. */
export function isVerified(tier: VerificationTier): boolean {
  return verificationRank(tier) > 0;
}

// ---------------------------------------------------------------------------
// Operator
// ---------------------------------------------------------------------------

export type Sex = 'female' | 'male' | 'unspecified';

export interface ReadinessFlags {
  chestPain: boolean;
  dizzinessOrFainting: boolean;
  jointInjury: boolean;
  pregnancy: boolean;
  cardiacHistory: boolean;
  medication: boolean;
}

export const NO_READINESS_FLAGS: ReadinessFlags = {
  chestPain: false,
  dizzinessOrFainting: false,
  jointInjury: false,
  pregnancy: false,
  cardiacHistory: false,
  medication: false,
};

export function hasAnyReadinessFlag(flags: ReadinessFlags): boolean {
  return Object.values(flags).some(Boolean);
}

/**
 * §21: a logged report of chest pain, dizziness or fainting is the subset that
 * triggers the "stop and seek medical attention" state and suppresses all
 * challenge prompts. Joint injury and medication warrant conservative loading
 * but not an alarm state.
 */
export function requiresMedicalStop(flags: ReadinessFlags): boolean {
  return flags.chestPain || flags.dizzinessOrFainting || flags.cardiacHistory;
}

export type PauseReason = 'injury' | 'illness' | null;

export interface OperatorProfile {
  id: string;
  displayName: string;
  ageYears: number;
  sex: Sex;

  pillars: PillarScores;
  level: number;
  xpIntoLevel: number;

  verification: VerificationTier;
  readiness: ReadinessFlags;

  /** ISO date (yyyy-mm-dd) of the most recent logged session, or null. */
  lastSessionDate: string | null;
  /** Highest CPS ever reached. Used to floor decay at one tier below peak. */
  careerPeakCps: number;
  /** Highest tier reached in the current season. Used by the §17 soft reset. */
  seasonPeakTier: Tier;

  /** Non-null while a §16 pause is active. Decay and streak loss are suspended. */
  pausedFor: PauseReason;

  homeVenueId: string | null;
  cityId: string | null;
}

// ---------------------------------------------------------------------------
// §7 — Logging
// ---------------------------------------------------------------------------

export type SetKind = 'reps_load' | 'reps_bodyweight' | 'time' | 'distance' | 'hold';

export interface LoggedSet {
  exerciseId: string;
  kind: SetKind;
  reps?: number;
  /** kg. */
  loadKg?: number;
  /** seconds. */
  durationSec?: number;
  /** metres. */
  distanceM?: number;
  /** 0–10 rating of perceived exertion, optional. */
  rpe?: number;
}

export interface LoggedSession {
  id: string;
  operatorId: string;
  /** ISO datetime. */
  startedAt: string;
  endedAt: string;
  sets: LoggedSet[];
  verification: VerificationTier;
  venueId: string | null;
  /** Set by the §15 STOP / I'M INJURED control. Scores nothing, penalises nothing. */
  abortedForInjury?: boolean;
}

// ---------------------------------------------------------------------------
// Derived, read-only view of an operator's standing
// ---------------------------------------------------------------------------

export interface Standing {
  cps: number;
  /** Tier after every cap and floor in §5/§6 has been applied. */
  tier: Tier;
  /** Tier the raw CPS would have earned, before the trust cap. */
  uncappedTier: Tier;
  /** True when §6's UNVERIFIED cap is actively holding the operator down. */
  trustCapped: boolean;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  verification: VerificationTier;
}
