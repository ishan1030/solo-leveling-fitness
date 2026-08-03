import { round1, round2 } from './progression';
import type { LoggedSession, LoggedSet, Pillar, PillarScores, SetKind } from './types';

/**
 * §7 — "Explicitly specify: how a set converts into pillar points, and how the
 * app handles a user who logs an obviously impossible number."
 *
 * This module is the answer to §2 FAILURE 1. A session's value is computed from
 * what was measured — load, volume, pace, range, duration — never from the fact
 * that a session was marked complete. Two operators who both "finish" the same
 * template earn different amounts, and that difference is computed here.
 */

// ---------------------------------------------------------------------------
// Exercise metadata the scorer needs
// ---------------------------------------------------------------------------

export interface ExerciseScoringProfile {
  id: string;
  /** Primary pillar this movement feeds. */
  pillar: Pillar;
  /**
   * Secondary pillar, credited at SECONDARY_SHARE. A weighted pull-up is mostly
   * strength but genuinely trains grip endurance; a loaded carry is both.
   */
  secondaryPillar: Pillar | null;
  /**
   * Difficulty multiplier. A barbell squat moves more total system load than a
   * lateral raise and is scored accordingly.
   */
  intensityFactor: number;
  /** Plausibility ceiling for a single set. See detectImplausible. */
  limits: SetLimits;
}

export interface SetLimits {
  maxReps?: number;
  /** kg */
  maxLoadKg?: number;
  /** seconds */
  maxDurationSec?: number;
  /** metres */
  maxDistanceM?: number;
  /** m/s — used to catch a 3-minute marathon. */
  maxSpeedMps?: number;
}

const SECONDARY_SHARE = 0.35;

/**
 * Scaling constant. Chosen so that a solid but unremarkable hour of training —
 * roughly 12 working sets at moderate intensity — lands near 1.0–1.5 raw pillar
 * points, which the §5 weekly cap of 2.0 then bounds. That means a committed
 * operator hits their weekly ceiling in about two good sessions, and a casual
 * one progresses visibly without ever feeling capped.
 */
const POINTS_PER_WORK_UNIT = 0.0016;

// ---------------------------------------------------------------------------
// Work units — the common currency across set kinds
// ---------------------------------------------------------------------------

/**
 * Converts one set into a dimensionless "work unit" so that a 5×5 squat and a
 * 5 km run can be compared on the same scale.
 *
 * The formulas deliberately reward measured effort with diminishing returns:
 * volume is scaled by sqrt so that grinding out 40 junk reps does not out-score
 * 5 hard ones.
 */
export function workUnitsForSet(
  set: LoggedSet,
  profile: ExerciseScoringProfile,
  bodyweightKg: number,
): number {
  const intensity = profile.intensityFactor;

  switch (set.kind) {
    case 'reps_load': {
      const reps = set.reps ?? 0;
      const load = set.loadKg ?? 0;
      // Tonnage, damped: heavier loads count more per rep than light ones.
      const tonnage = reps * load;
      return round2(Math.sqrt(tonnage) * Math.sqrt(load) * intensity * 0.6);
    }

    case 'reps_bodyweight': {
      const reps = set.reps ?? 0;
      // Bodyweight movements are scored against the operator's own mass, so a
      // heavier operator doing the same reps has done more work — which is true.
      const tonnage = reps * bodyweightKg;
      return round2(Math.sqrt(tonnage) * Math.sqrt(bodyweightKg) * intensity * 0.45);
    }

    case 'distance': {
      const metres = set.distanceM ?? 0;
      const seconds = set.durationSec ?? 0;
      if (seconds <= 0) {
        // Distance with no time still counts, just without the pace bonus.
        return round2(metres * 0.35 * intensity);
      }
      // Pace matters: a 5 km at 4:30/km scores above a 5 km at 7:00/km.
      const speedMps = metres / seconds;
      const paceFactor = clampFactor(speedMps / 3.0, 0.5, 2.0);
      return round2(metres * 0.35 * paceFactor * intensity);
    }

    case 'time': {
      const seconds = set.durationSec ?? 0;
      return round2(seconds * 1.2 * intensity);
    }

    case 'hold': {
      const seconds = set.durationSec ?? 0;
      // Isometric holds are dense per second but plateau fast.
      return round2(Math.sqrt(seconds) * 14 * intensity);
    }

    default:
      return assertNeverSetKind(set.kind);
  }
}

function clampFactor(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertNeverSetKind(kind: never): number {
  throw new Error(`unhandled set kind: ${String(kind)}`);
}

// ---------------------------------------------------------------------------
// §7 — Implausible input handling
// ---------------------------------------------------------------------------

export type ImplausibilityCode =
  | 'reps_exceed_limit'
  | 'load_exceeds_limit'
  | 'duration_exceeds_limit'
  | 'distance_exceeds_limit'
  | 'speed_exceeds_limit'
  | 'negative_value'
  | 'load_exceeds_world_record_ratio';

export interface ImplausibilityFinding {
  code: ImplausibilityCode;
  field: string;
  logged: number;
  /** The ceiling that was breached. */
  limit: number;
  /** Shown inline, at the moment of entry. */
  message: string;
}

/**
 * Absolute ceiling on load as a multiple of bodyweight, across all movements.
 * Above this, the entry is almost certainly a typo (a misplaced decimal, or
 * pounds entered into a kg field) rather than a claim.
 */
const ABSOLUTE_LOAD_BODYWEIGHT_RATIO = 6;

/**
 * §7: "how the app handles a user who logs an obviously impossible number."
 *
 * The policy, in three parts:
 *
 *  1. NEVER silently discard. The set is logged exactly as entered — it stays in
 *     the operator's own history, because their training log is theirs.
 *  2. NEVER accuse. The copy assumes a typo, because it almost always is.
 *  3. The set scores ZERO pillar points and is excluded from PRs and from every
 *     leaderboard until corrected.
 *
 * This is the same philosophy as §10's anti-cheat: flag for review, don't
 * auto-punish. A user who really did log 300 reps is one confirmation away from
 * having it count; a user who fat-fingered a zero loses nothing.
 */
export function detectImplausible(
  set: LoggedSet,
  profile: ExerciseScoringProfile,
  bodyweightKg: number,
): ImplausibilityFinding[] {
  const findings: ImplausibilityFinding[] = [];
  const limits = profile.limits;

  const negatives: [string, number | undefined][] = [
    ['reps', set.reps],
    ['loadKg', set.loadKg],
    ['durationSec', set.durationSec],
    ['distanceM', set.distanceM],
  ];
  for (const [field, value] of negatives) {
    if (typeof value === 'number' && value < 0) {
      findings.push({
        code: 'negative_value',
        field,
        logged: value,
        limit: 0,
        message: `That reads as a negative ${field}. Want to check it?`,
      });
    }
  }

  if (limits.maxReps !== undefined && (set.reps ?? 0) > limits.maxReps) {
    findings.push({
      code: 'reps_exceed_limit',
      field: 'reps',
      logged: set.reps ?? 0,
      limit: limits.maxReps,
      message: `${set.reps} reps in one set is past what we can score. Typo, or a real set to split up?`,
    });
  }

  if (limits.maxLoadKg !== undefined && (set.loadKg ?? 0) > limits.maxLoadKg) {
    findings.push({
      code: 'load_exceeds_limit',
      field: 'loadKg',
      logged: set.loadKg ?? 0,
      limit: limits.maxLoadKg,
      message: `${set.loadKg} kg is above the range we score for this movement. Check the number — pounds entered as kilos is the usual cause.`,
    });
  }

  const ratioLimit = round1(bodyweightKg * ABSOLUTE_LOAD_BODYWEIGHT_RATIO);
  if ((set.loadKg ?? 0) > ratioLimit) {
    findings.push({
      code: 'load_exceeds_world_record_ratio',
      field: 'loadKg',
      logged: set.loadKg ?? 0,
      limit: ratioLimit,
      message: `That is more than ${ABSOLUTE_LOAD_BODYWEIGHT_RATIO}× your bodyweight. We have left it in your log, but it will not count toward your score until you confirm it.`,
    });
  }

  if (limits.maxDurationSec !== undefined && (set.durationSec ?? 0) > limits.maxDurationSec) {
    findings.push({
      code: 'duration_exceeds_limit',
      field: 'durationSec',
      logged: set.durationSec ?? 0,
      limit: limits.maxDurationSec,
      message: 'That duration is longer than we can score in a single entry.',
    });
  }

  if (limits.maxDistanceM !== undefined && (set.distanceM ?? 0) > limits.maxDistanceM) {
    findings.push({
      code: 'distance_exceeds_limit',
      field: 'distanceM',
      logged: set.distanceM ?? 0,
      limit: limits.maxDistanceM,
      message: 'That distance is past our scoring range for one entry.',
    });
  }

  if (limits.maxSpeedMps !== undefined && (set.distanceM ?? 0) > 0 && (set.durationSec ?? 0) > 0) {
    const speed = (set.distanceM ?? 0) / (set.durationSec ?? 1);
    if (speed > limits.maxSpeedMps) {
      findings.push({
        code: 'speed_exceeds_limit',
        field: 'distanceM',
        logged: round2(speed),
        limit: limits.maxSpeedMps,
        message: `That pace works out to ${round1(speed * 3.6)} km/h. Check the distance and time.`,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Session scoring
// ---------------------------------------------------------------------------

export interface ScoredSet {
  set: LoggedSet;
  workUnits: number;
  pillarPoints: Partial<PillarScores>;
  findings: ImplausibilityFinding[];
  /** True when findings caused this set to score nothing. */
  excluded: boolean;
}

export interface SessionScore {
  sets: ScoredSet[];
  /** Raw pillar points before the §5 weekly cap is applied. */
  proposedPillarPoints: PillarScores;
  totalWorkUnits: number;
  xp: number;
  flaggedSetCount: number;
  /** True if the session was ended by the §15 injury control. */
  scoredAsAborted: boolean;
}

export type ExerciseLookup = (exerciseId: string) => ExerciseScoringProfile | undefined;

const EMPTY_PILLARS: PillarScores = {
  strength: 0,
  endurance: 0,
  consistency: 0,
  mobility: 0,
};

/**
 * §16 / §21: a session ended via STOP / I'M INJURED is logged with no penalty.
 * It does not score, but it also does not break a streak and does not count as
 * an idle day for decay. The operator keeps the record of having shown up.
 */
export function scoreSession(
  session: LoggedSession,
  lookup: ExerciseLookup,
  bodyweightKg: number,
): SessionScore {
  const scored: ScoredSet[] = [];
  const proposed: PillarScores = { ...EMPTY_PILLARS };
  let totalWorkUnits = 0;
  let flaggedSetCount = 0;

  for (const set of session.sets) {
    const profile = lookup(set.exerciseId);

    if (!profile) {
      // An unknown movement (a custom exercise, or a library entry removed after
      // the session was logged offline) is kept but not scored.
      scored.push({ set, workUnits: 0, pillarPoints: {}, findings: [], excluded: true });
      continue;
    }

    const findings = detectImplausible(set, profile, bodyweightKg);
    if (findings.length > 0) {
      flaggedSetCount += 1;
      scored.push({ set, workUnits: 0, pillarPoints: {}, findings, excluded: true });
      continue;
    }

    const workUnits = workUnitsForSet(set, profile, bodyweightKg);
    const primaryPoints = round2(workUnits * POINTS_PER_WORK_UNIT);
    const pillarPoints: Partial<PillarScores> = {
      [profile.pillar]: primaryPoints,
    };

    if (profile.secondaryPillar) {
      pillarPoints[profile.secondaryPillar] = round2(primaryPoints * SECONDARY_SHARE);
    }

    for (const [pillar, points] of Object.entries(pillarPoints)) {
      proposed[pillar as Pillar] = round2(proposed[pillar as Pillar] + (points ?? 0));
    }

    totalWorkUnits = round2(totalWorkUnits + workUnits);
    scored.push({ set, workUnits, pillarPoints, findings: [], excluded: false });
  }

  if (session.abortedForInjury) {
    return {
      sets: scored,
      proposedPillarPoints: { ...EMPTY_PILLARS },
      totalWorkUnits,
      xp: 0,
      flaggedSetCount,
      scoredAsAborted: true,
    };
  }

  return {
    sets: scored,
    proposedPillarPoints: proposed,
    totalWorkUnits,
    xp: xpForWork(totalWorkUnits),
    flaggedSetCount,
    scoredAsAborted: false,
  };
}

/**
 * XP is the "time and effort invested" currency of §5, so it tracks total work
 * with far less damping than pillar points do — a long easy session should still
 * feel like it moved the level bar even when it barely moves capability.
 */
export function xpForWork(workUnits: number): number {
  return Math.round(workUnits * 0.35);
}

/**
 * §7: "Two users who both 'complete' a workout must gain different amounts based
 * on what they actually did."
 *
 * Exposed as a named helper so the claim is directly testable and so the
 * post-session summary can explain the delta to the operator.
 */
export function comparePerformance(
  a: SessionScore,
  b: SessionScore,
): { differ: boolean; workUnitRatio: number } {
  const ratio = b.totalWorkUnits === 0 ? Infinity : a.totalWorkUnits / b.totalWorkUnits;
  return { differ: a.totalWorkUnits !== b.totalWorkUnits, workUnitRatio: round2(ratio) };
}

export type { SetKind };
