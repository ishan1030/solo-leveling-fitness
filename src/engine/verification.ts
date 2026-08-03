import { round1 } from './progression';
import {
  type Tier,
  type VerificationTier,
  isVerified,
  tierIndex,
  verificationRank,
} from './types';

/**
 * §10 — VERIFICATION NETWORK & ANTI-CHEAT. The moat, and the answer to §2
 * FAILURE 2: "Ranks are meaningless because they're self-reported."
 */

// ---------------------------------------------------------------------------
// §10 — QR check-in
// ---------------------------------------------------------------------------

/** "QR codes rotate every 60 seconds." */
export const QR_ROTATION_SECONDS = 60;
/** Tolerance for clock skew between the venue display and the operator's phone. */
export const QR_CLOCK_SKEW_TOLERANCE_SECONDS = 15;
/** "and are geofenced to the venue's coordinates." */
export const VENUE_GEOFENCE_METRES = 120;
/** "Maximum one verified session per operator per 4 hours." */
export const VERIFIED_SESSION_COOLDOWN_HOURS = 4;

export interface Venue {
  id: string;
  name: string;
  cityId: string;
  lat: number;
  lon: number;
  certified: boolean;
  /** Server-held secret used to derive rotating codes. Never leaves the backend. */
  codeSecret: string;
}

/**
 * The rotating code is derived from (venue secret, time window), so a code
 * screenshotted and sent to a friend across town fails on both the time check
 * and the geofence.
 *
 * The real derivation is HMAC-SHA256 server-side; this deterministic stand-in
 * keeps the engine pure and testable. `docs/07-verification-anticheat.md`
 * specifies the production construction.
 */
export function windowIndexFor(now: Date): number {
  return Math.floor(now.getTime() / 1000 / QR_ROTATION_SECONDS);
}

export function deriveVenueCode(secret: string, windowIndex: number): string {
  let hash = 2166136261;
  const input = `${secret}:${windowIndex}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
}

export type CheckInRejection =
  | 'code_expired'
  | 'code_invalid'
  | 'outside_geofence'
  | 'cooldown_active'
  | 'venue_not_certified'
  | 'no_location';

export interface CheckInAttempt {
  operatorId: string;
  venue: Venue;
  submittedCode: string;
  operatorLocation: { lat: number; lon: number } | null;
  /** ISO datetime of the operator's previous verified session, if any. */
  lastVerifiedSessionAt: string | null;
  now: Date;
}

export interface CheckInResult {
  accepted: boolean;
  rejection: CheckInRejection | null;
  /** Copy shown to the operator. Plain language, never accusatory. */
  message: string;
  grantedTier: VerificationTier | null;
}

function metresBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * §10: validated at session START and again at session END. This function runs
 * for both; the caller records which one it was.
 *
 * §10 PRIVACY: the operator's location is read once, here, compared, and
 * discarded. It is never stored on the session record — only the venue id is.
 */
export function validateCheckIn(attempt: CheckInAttempt): CheckInResult {
  const { venue, submittedCode, operatorLocation, now } = attempt;

  if (!venue.certified) {
    return {
      accepted: false,
      rejection: 'venue_not_certified',
      message: 'This venue is not part of the verification network yet. Your session still logs — it just will not carry a verified badge.',
      grantedTier: null,
    };
  }

  if (!operatorLocation) {
    return {
      accepted: false,
      rejection: 'no_location',
      message: 'We need a single location reading to confirm you are at the venue. Nothing is tracked afterwards.',
      grantedTier: null,
    };
  }

  const metres = metresBetween(operatorLocation, { lat: venue.lat, lon: venue.lon });
  if (metres > VENUE_GEOFENCE_METRES) {
    return {
      accepted: false,
      rejection: 'outside_geofence',
      message: `You read as ${metres} m from ${venue.name}. Move inside and scan again.`,
      grantedTier: null,
    };
  }

  // Accept the current window and the previous one, so a scan that lands a
  // second after rotation is not punished for the user's reaction time.
  const currentWindow = windowIndexFor(now);
  const skewWindows = Math.ceil(QR_CLOCK_SKEW_TOLERANCE_SECONDS / QR_ROTATION_SECONDS);
  const acceptable: string[] = [];
  for (let offset = -1 - skewWindows; offset <= skewWindows; offset++) {
    acceptable.push(deriveVenueCode(venue.codeSecret, currentWindow + offset));
  }

  if (!acceptable.includes(submittedCode)) {
    // We cannot distinguish an expired code from a wrong one without leaking
    // information about the code space, so both report as expired — which is
    // also the overwhelmingly common case.
    return {
      accepted: false,
      rejection: 'code_expired',
      message: 'That code has rotated. Scan the current one on the venue display.',
      grantedTier: null,
    };
  }

  if (attempt.lastVerifiedSessionAt) {
    const hours = (now.getTime() - new Date(attempt.lastVerifiedSessionAt).getTime()) / 3_600_000;
    if (hours < VERIFIED_SESSION_COOLDOWN_HOURS) {
      const remaining = round1(VERIFIED_SESSION_COOLDOWN_HOURS - hours);
      return {
        accepted: false,
        rejection: 'cooldown_active',
        message: `You already have a verified session in the last ${VERIFIED_SESSION_COOLDOWN_HOURS} hours. Train if you want to — it logs normally, and the next verified slot opens in ${remaining} h.`,
        grantedTier: null,
      };
    }
  }

  return {
    accepted: true,
    rejection: null,
    message: `Checked in at ${venue.name}.`,
    grantedTier: 'QR_CHECK_IN',
  };
}

// ---------------------------------------------------------------------------
// §10 — Leaderboard eligibility
// ---------------------------------------------------------------------------

/**
 * "Leaderboards above COBALT display verified operators only."
 *
 * Applied as a filter on the query, not as a post-hoc hide, so an unverified
 * operator never occupies a rank slot they would then be stripped from.
 */
export function isLeaderboardEligible(
  tier: Tier,
  verification: VerificationTier,
  boardMinimumTier: Tier = 'STORM',
): boolean {
  if (tierIndex(tier) < tierIndex(boardMinimumTier)) return true;
  return isVerified(verification);
}

// ---------------------------------------------------------------------------
// §10 — Statistical implausibility review
// ---------------------------------------------------------------------------

export type ReviewStatus = 'CLEAR' | 'FLAGGED_FOR_REVIEW' | 'UNDER_APPEAL' | 'CONFIRMED_CLEAN' | 'CONFIRMED_INVALID';

export interface ProgressionSample {
  /** CPS gained in the window. */
  cpsDelta: number;
  windowDays: number;
  verifiedSessionCount: number;
  totalSessionCount: number;
}

export interface ReviewFlag {
  flagged: boolean;
  reasons: string[];
  status: ReviewStatus;
  /** §10: "auto-flagged for review, not auto-punished." Always false here. */
  autoPunished: false;
  operatorCopy: string | null;
}

/**
 * §10: "Statistically implausible progression is auto-flagged for review, not
 * auto-punished."
 *
 * Note the invariant baked into the return type: `autoPunished` is typed as the
 * literal `false`. Nothing downstream can set it, so no future change can turn
 * this detector into an enforcement action without a deliberate type change and
 * a review of this comment.
 */
export function reviewProgression(sample: ProgressionSample): ReviewFlag {
  const reasons: string[] = [];

  // The §5 cap allows at most 2.0 points per pillar per 7 days, which bounds CPS
  // gain at 2.0 per week. Anything meaningfully above that implies the cap was
  // bypassed — a client bug, a replay, or a compromised account.
  const maxPlausibleCps = (sample.windowDays / 7) * 2.0;
  if (sample.cpsDelta > maxPlausibleCps * 1.05) {
    reasons.push(
      `CPS moved ${round1(sample.cpsDelta)} in ${sample.windowDays} days; the weekly cap allows at most ${round1(maxPlausibleCps)}.`,
    );
  }

  // A rapid climb built entirely from unverified sessions is the classic
  // self-report inflation pattern §2 FAILURE 2 describes.
  if (sample.cpsDelta > 5 && sample.verifiedSessionCount === 0 && sample.totalSessionCount > 0) {
    reasons.push('Significant progression with no verified session in the window.');
  }

  if (reasons.length === 0) {
    return { flagged: false, reasons: [], status: 'CLEAR', autoPunished: false, operatorCopy: null };
  }

  return {
    flagged: true,
    reasons,
    status: 'FLAGGED_FOR_REVIEW',
    autoPunished: false,
    operatorCopy:
      'Some recent progression is being reviewed by a person before it counts toward the ladder. Your rank, your log, and your streak are untouched while that happens. You can add context or appeal at any time.',
  };
}

// ---------------------------------------------------------------------------
// §10 — Appeals, human in the loop
// ---------------------------------------------------------------------------

export interface Appeal {
  id: string;
  operatorId: string;
  flagReasons: string[];
  operatorStatement: string;
  status: 'SUBMITTED' | 'IN_REVIEW' | 'UPHELD' | 'OVERTURNED';
  /** Never null once resolved. §10: "Appeals flow with a human in the loop." */
  reviewedByHumanId: string | null;
  submittedAt: string;
  resolvedAt: string | null;
}

export function resolveAppeal(
  appeal: Appeal,
  decision: 'UPHELD' | 'OVERTURNED',
  humanReviewerId: string,
  now: Date,
): Appeal {
  if (!humanReviewerId) {
    throw new Error('appeals require a human reviewer — §10 forbids automated resolution');
  }
  return {
    ...appeal,
    status: decision,
    reviewedByHumanId: humanReviewerId,
    resolvedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// §10 — Trust tier resolution
// ---------------------------------------------------------------------------

/**
 * An operator's profile verification tier is the highest tier they have earned
 * from a session inside the trailing window. It decays back toward
 * SELF_REPORTED if they stop verifying, which is what keeps the top of the
 * ladder honest over time rather than only at the moment of first check-in.
 */
export const VERIFICATION_VALIDITY_DAYS = 30;

export function resolveProfileVerification(
  sessions: { verification: VerificationTier; startedAt: string }[],
  now: Date,
): VerificationTier {
  const cutoff = now.getTime() - VERIFICATION_VALIDITY_DAYS * 86_400_000;
  let best: VerificationTier = 'SELF_REPORTED';

  for (const session of sessions) {
    if (new Date(session.startedAt).getTime() < cutoff) continue;
    if (verificationRank(session.verification) > verificationRank(best)) {
      best = session.verification;
    }
  }
  return best;
}
