import { DEFAULT_PROGRESSION, type ProgressionConfig } from './config';
import { applyTrustCap, computeCps, round1, tierForCps } from './progression';
import {
  type PillarScores,
  type ReadinessFlags,
  type Sex,
  type Standing,
  type Tier,
  hasAnyReadinessFlag,
  requiresMedicalStop,
} from './types';

/**
 * §6 — CALIBRATION.
 *
 * "Each raw input maps to a 0–100 pillar score through published lookup tables
 * banded by age and sex. Show the user the table. Fairness must be legible, or
 * the ladder loses credibility on day one."
 *
 * The tables below ARE the published tables — `CALIBRATION_TABLES` is rendered
 * directly by the Calibration Fairness screen. There is no second, hidden set of
 * numbers. If a band changes here, the user-facing table changes with it.
 */

// ---------------------------------------------------------------------------
// Age and sex banding
// ---------------------------------------------------------------------------

export const AGE_BANDS = [
  { id: '16-19', min: 16, max: 19 },
  { id: '20-29', min: 20, max: 29 },
  { id: '30-39', min: 30, max: 39 },
  { id: '40-49', min: 40, max: 49 },
  { id: '50-59', min: 50, max: 59 },
  { id: '60+', min: 60, max: 200 },
] as const;

export type AgeBandId = (typeof AGE_BANDS)[number]['id'];

export function ageBandFor(ageYears: number): AgeBandId {
  const band = AGE_BANDS.find((b) => ageYears >= b.min && ageYears <= b.max);
  // Below the §21 minimum age the signup gate has already refused; clamping to
  // the youngest band keeps the scorer total rather than throwing mid-flow.
  return band ? band.id : '16-19';
}

/**
 * Norm keys. `unspecified` is a first-class option, not a fallback: an operator
 * who declines to state sex is scored against the midpoint of the male and
 * female reference curves rather than being forced into one.
 */
export type NormKey = Sex;

/**
 * A benchmark ladder. `points` are the raw performance values that earn the
 * corresponding `score` on the 0–100 pillar scale. Values between two rungs are
 * linearly interpolated, so there are no cliff edges where one extra rep jumps
 * a user 15 points.
 */
export interface Benchmark {
  /** Raw input values, strictly ascending. */
  points: number[];
  /** Pillar scores for those values, strictly ascending. Same length. */
  scores: number[];
}

export interface TableEntry {
  female: Benchmark;
  male: Benchmark;
}

/**
 * Reference ladders. Anchors are set so that the median recreational trainee in
 * each band lands near 45–50 (COBALT territory) and the top rung represents
 * genuinely competitive performance for that band. These are reference curves
 * for a game ladder, not clinical norms.
 */
const SCORE_RUNGS = [0, 15, 30, 45, 60, 75, 90, 100];

function benchmark(femalePoints: number[], malePoints: number[]): TableEntry {
  return {
    female: { points: femalePoints, scores: SCORE_RUNGS },
    male: { points: malePoints, scores: SCORE_RUNGS },
  };
}

export interface CalibrationTable {
  id: string;
  label: string;
  unit: string;
  /** Which pillar this input feeds. */
  pillar: keyof PillarScores;
  /** Relative weight of this input inside its pillar. Weights per pillar sum to 1. */
  weight: number;
  /** True for inputs where a LOWER raw value is better (e.g. run time). */
  lowerIsBetter: boolean;
  optional: boolean;
  byAgeBand: Record<AgeBandId, TableEntry>;
}

/** Builds an age-banded table by scaling a 20-29 reference by an age factor. */
function agedTable(
  base: TableEntry,
  factors: Record<AgeBandId, number>,
): Record<AgeBandId, TableEntry> {
  const scale = (b: Benchmark, factor: number): Benchmark => ({
    points: b.points.map((p) => round1(p * factor)),
    scores: b.scores,
  });
  return {
    '16-19': { female: scale(base.female, factors['16-19']), male: scale(base.male, factors['16-19']) },
    '20-29': { female: scale(base.female, factors['20-29']), male: scale(base.male, factors['20-29']) },
    '30-39': { female: scale(base.female, factors['30-39']), male: scale(base.male, factors['30-39']) },
    '40-49': { female: scale(base.female, factors['40-49']), male: scale(base.male, factors['40-49']) },
    '50-59': { female: scale(base.female, factors['50-59']), male: scale(base.male, factors['50-59']) },
    '60+': { female: scale(base.female, factors['60+']), male: scale(base.male, factors['60+']) },
  };
}

/** Strength and mobility decline gently with age; the ladder mirrors that. */
const STRENGTH_AGE_FACTORS: Record<AgeBandId, number> = {
  '16-19': 0.92,
  '20-29': 1.0,
  '30-39': 0.95,
  '40-49': 0.87,
  '50-59': 0.77,
  '60+': 0.65,
};

const ENDURANCE_AGE_FACTORS: Record<AgeBandId, number> = {
  '16-19': 0.95,
  '20-29': 1.0,
  '30-39': 0.96,
  '40-49': 0.9,
  '50-59': 0.82,
  '60+': 0.72,
};

const MOBILITY_AGE_FACTORS: Record<AgeBandId, number> = {
  '16-19': 1.02,
  '20-29': 1.0,
  '30-39': 0.97,
  '40-49': 0.93,
  '50-59': 0.88,
  '60+': 0.82,
};

/** Age-neutral: showing up is showing up. */
const FLAT_AGE_FACTORS: Record<AgeBandId, number> = {
  '16-19': 1,
  '20-29': 1,
  '30-39': 1,
  '40-49': 1,
  '50-59': 1,
  '60+': 1,
};

export const CALIBRATION_TABLES: CalibrationTable[] = [
  {
    id: 'pushups',
    label: 'Push-ups, best unbroken set',
    unit: 'reps',
    pillar: 'strength',
    weight: 0.3,
    lowerIsBetter: false,
    optional: false,
    byAgeBand: agedTable(
      benchmark([0, 3, 8, 14, 22, 32, 45, 60], [0, 5, 12, 22, 35, 50, 68, 90]),
      STRENGTH_AGE_FACTORS,
    ),
  },
  {
    id: 'pullups',
    label: 'Pull-ups, best unbroken set',
    unit: 'reps',
    pillar: 'strength',
    weight: 0.3,
    lowerIsBetter: false,
    optional: false,
    byAgeBand: agedTable(
      benchmark([0, 1, 2, 4, 7, 11, 16, 22], [0, 1, 4, 8, 13, 19, 26, 35]),
      STRENGTH_AGE_FACTORS,
    ),
  },
  {
    id: 'squats',
    label: 'Bodyweight squats, best unbroken set',
    unit: 'reps',
    pillar: 'strength',
    weight: 0.2,
    lowerIsBetter: false,
    optional: false,
    byAgeBand: agedTable(
      benchmark([0, 10, 20, 32, 45, 62, 85, 110], [0, 12, 24, 38, 55, 75, 100, 130]),
      STRENGTH_AGE_FACTORS,
    ),
  },
  {
    id: 'bench',
    label: 'Bench press, best single, as a multiple of bodyweight',
    unit: '× bodyweight',
    pillar: 'strength',
    weight: 0.2,
    lowerIsBetter: false,
    optional: true,
    byAgeBand: agedTable(
      benchmark([0, 0.3, 0.45, 0.6, 0.8, 1.0, 1.25, 1.5], [0, 0.5, 0.7, 0.95, 1.2, 1.5, 1.8, 2.2]),
      STRENGTH_AGE_FACTORS,
    ),
  },
  {
    id: 'run_pace',
    label: 'Best recent run pace',
    unit: 'sec / km',
    pillar: 'endurance',
    weight: 0.5,
    lowerIsBetter: true,
    optional: false,
    byAgeBand: agedTable(
      // Descending raw values because faster is better; the scorer handles the
      // direction via `lowerIsBetter`.
      benchmark(
        [600, 510, 450, 405, 360, 320, 285, 255],
        [560, 480, 420, 375, 335, 300, 265, 235],
      ),
      // A slower runner needs MORE seconds, so the age factor inverts.
      {
        '16-19': 1 / ENDURANCE_AGE_FACTORS['16-19'],
        '20-29': 1 / ENDURANCE_AGE_FACTORS['20-29'],
        '30-39': 1 / ENDURANCE_AGE_FACTORS['30-39'],
        '40-49': 1 / ENDURANCE_AGE_FACTORS['40-49'],
        '50-59': 1 / ENDURANCE_AGE_FACTORS['50-59'],
        '60+': 1 / ENDURANCE_AGE_FACTORS['60+'],
      },
    ),
  },
  {
    id: 'run_distance',
    label: 'Longest continuous run in the last 3 months',
    unit: 'km',
    pillar: 'endurance',
    weight: 0.35,
    lowerIsBetter: false,
    optional: false,
    byAgeBand: agedTable(
      benchmark([0, 1, 2.5, 5, 8, 12, 18, 25], [0, 1, 3, 5, 10, 15, 21, 30]),
      ENDURANCE_AGE_FACTORS,
    ),
  },
  {
    id: 'resting_hr',
    label: 'Resting heart rate',
    unit: 'bpm',
    pillar: 'endurance',
    weight: 0.15,
    lowerIsBetter: true,
    optional: true,
    byAgeBand: agedTable(
      benchmark([90, 82, 76, 70, 64, 58, 52, 46], [88, 80, 74, 68, 62, 56, 50, 44]),
      FLAT_AGE_FACTORS,
    ),
  },
  {
    id: 'sessions_per_week',
    label: 'Training sessions per week, right now',
    unit: 'sessions',
    pillar: 'consistency',
    weight: 0.6,
    lowerIsBetter: false,
    optional: false,
    byAgeBand: agedTable(
      benchmark([0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7]),
      FLAT_AGE_FACTORS,
    ),
  },
  {
    id: 'months_training',
    label: 'Months of continuous training',
    unit: 'months',
    pillar: 'consistency',
    weight: 0.4,
    lowerIsBetter: false,
    optional: false,
    byAgeBand: agedTable(
      benchmark([0, 1, 3, 6, 12, 24, 48, 84], [0, 1, 3, 6, 12, 24, 48, 84]),
      FLAT_AGE_FACTORS,
    ),
  },
  {
    id: 'sit_reach',
    label: 'Sit-and-reach band',
    unit: 'cm past toes',
    pillar: 'mobility',
    weight: 0.4,
    lowerIsBetter: false,
    optional: false,
    byAgeBand: agedTable(
      benchmark([-20, -12, -6, 0, 6, 12, 18, 25], [-25, -16, -9, -3, 3, 9, 15, 22]),
      MOBILITY_AGE_FACTORS,
    ),
  },
  {
    id: 'overhead_squat',
    label: 'Overhead squat self-check',
    unit: '0–4 scale',
    pillar: 'mobility',
    weight: 0.3,
    lowerIsBetter: false,
    optional: false,
    byAgeBand: agedTable(
      benchmark([0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.5, 4], [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.5, 4]),
      FLAT_AGE_FACTORS,
    ),
  },
  {
    id: 'shoulder_rotation',
    label: 'Shoulder rotation check',
    unit: '0–4 scale',
    pillar: 'mobility',
    weight: 0.3,
    lowerIsBetter: false,
    optional: false,
    byAgeBand: agedTable(
      benchmark([0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.5, 4], [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.5, 4]),
      FLAT_AGE_FACTORS,
    ),
  },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Maps a raw value onto a benchmark ladder with linear interpolation between
 * rungs. Clamped at both ends: beating the top rung earns 100, not more.
 */
export function scoreAgainstBenchmark(
  raw: number,
  benchmark: Benchmark,
  lowerIsBetter: boolean,
): number {
  const { points, scores } = benchmark;
  if (points.length === 0) return 0;

  // Normalise to an ascending-is-better ladder so one interpolation covers both.
  const ladder = lowerIsBetter
    ? points.map((p) => -p)
    : points.slice();
  const value = lowerIsBetter ? -raw : raw;

  if (value <= ladder[0]!) return scores[0]!;
  const last = ladder.length - 1;
  if (value >= ladder[last]!) return scores[last]!;

  for (let i = 0; i < last; i++) {
    const lo = ladder[i]!;
    const hi = ladder[i + 1]!;
    if (value >= lo && value <= hi) {
      const span = hi - lo;
      const t = span === 0 ? 0 : (value - lo) / span;
      const scoreLo = scores[i]!;
      const scoreHi = scores[i + 1]!;
      return round1(scoreLo + t * (scoreHi - scoreLo));
    }
  }
  return scores[last]!;
}

/** Resolves the benchmark for an operator, blending the two curves for `unspecified`. */
export function benchmarkFor(
  table: CalibrationTable,
  ageYears: number,
  sex: NormKey,
): Benchmark {
  const entry = table.byAgeBand[ageBandFor(ageYears)];
  if (sex === 'female') return entry.female;
  if (sex === 'male') return entry.male;

  // §20 / §6 fairness: an operator who declines to state sex is scored against
  // the midpoint of both reference curves rather than defaulted into one.
  return {
    points: entry.female.points.map((p, i) => round1((p + (entry.male.points[i] ?? p)) / 2)),
    scores: entry.female.scores,
  };
}

export type CalibrationInputs = Record<string, number | undefined>;

export interface PillarBreakdown {
  pillar: keyof PillarScores;
  score: number;
  /** Per-input contributions, so the reveal can show its working. */
  contributions: {
    tableId: string;
    label: string;
    raw: number | null;
    score: number;
    /** Weight after redistribution of any skipped optional inputs. */
    effectiveWeight: number;
    skipped: boolean;
  }[];
}

/**
 * Scores one pillar. Optional inputs the operator skipped have their weight
 * redistributed across the answered inputs rather than counted as zero — a user
 * without a barbell must not be scored as though they failed the bench press.
 */
export function scorePillar(
  pillar: keyof PillarScores,
  inputs: CalibrationInputs,
  ageYears: number,
  sex: NormKey,
): PillarBreakdown {
  const tables = CALIBRATION_TABLES.filter((t) => t.pillar === pillar);

  const answered = tables.filter((t) => typeof inputs[t.id] === 'number');
  const answeredWeight = answered.reduce((sum, t) => sum + t.weight, 0);

  const contributions: PillarBreakdown['contributions'] = [];
  let score = 0;

  for (const table of tables) {
    const raw = inputs[table.id];
    const skipped = typeof raw !== 'number';

    if (skipped) {
      contributions.push({
        tableId: table.id,
        label: table.label,
        raw: null,
        score: 0,
        effectiveWeight: 0,
        skipped: true,
      });
      continue;
    }

    const effectiveWeight = answeredWeight > 0 ? table.weight / answeredWeight : 0;
    const inputScore = scoreAgainstBenchmark(
      raw,
      benchmarkFor(table, ageYears, sex),
      table.lowerIsBetter,
    );
    score += inputScore * effectiveWeight;

    contributions.push({
      tableId: table.id,
      label: table.label,
      raw,
      score: inputScore,
      effectiveWeight: round1(effectiveWeight * 100) / 100,
      skipped: false,
    });
  }

  return { pillar, score: round1(score), contributions };
}

// ---------------------------------------------------------------------------
// Readiness — §6, §21
// ---------------------------------------------------------------------------

export type CoachPersonality = 'CALM_MENTOR' | 'STRICT_TRAINER' | 'ELITE_COMMANDER';

export interface ReadinessOutcome {
  /** §6: "Never lock them out." Always true. Present so the invariant is testable. */
  receivesFullProfile: true;
  conservativeLoading: boolean;
  /** §14: flagged operators default to the lowest-intensity personality. */
  defaultPersonality: CoachPersonality;
  /** Drives the persistent, non-blocking banner. */
  showPhysicianBanner: boolean;
  /** §21: the harder state — suppresses all challenge prompts. */
  medicalStopState: boolean;
  bannerCopy: string | null;
}

/**
 * §6: "Any positive → user still receives a full profile and rank, but the app
 * assigns conservative loading, defaults the coach to its lowest-intensity
 * personality, and surfaces a persistent 'clear this with a physician' state.
 * Never lock them out. Never make the flagged experience feel like a lesser
 * version of the product."
 *
 * Note what this function does NOT do: it never reduces a pillar score, never
 * caps a tier, and never removes a feature. The flag changes prescription and
 * tone only. A flagged operator can reach ECLIPSE.
 */
export function resolveReadiness(flags: ReadinessFlags): ReadinessOutcome {
  const flagged = hasAnyReadinessFlag(flags);
  const stop = requiresMedicalStop(flags);

  if (stop) {
    return {
      receivesFullProfile: true,
      conservativeLoading: true,
      defaultPersonality: 'CALM_MENTOR',
      showPhysicianBanner: true,
      medicalStopState: true,
      bannerCopy:
        'You told us about chest pain, fainting, or a cardiac history. Please get clearance from a doctor before training. Your rank and profile stay exactly as they are while you do.',
    };
  }

  if (flagged) {
    return {
      receivesFullProfile: true,
      conservativeLoading: true,
      defaultPersonality: 'CALM_MENTOR',
      showPhysicianBanner: true,
      medicalStopState: false,
      bannerCopy:
        'Based on your readiness answers, AXIOM is starting you with conservative loading. Worth clearing with a physician. Nothing in the app is locked.',
    };
  }

  return {
    receivesFullProfile: true,
    conservativeLoading: false,
    defaultPersonality: 'STRICT_TRAINER',
    showPhysicianBanner: false,
    medicalStopState: false,
    bannerCopy: null,
  };
}

// ---------------------------------------------------------------------------
// The calibration result
// ---------------------------------------------------------------------------

export interface CalibrationResult {
  pillars: PillarScores;
  breakdown: PillarBreakdown[];
  cps: number;
  /** Tier the raw score earned, before §6's trust cap. */
  uncappedTier: Tier;
  /** Tier actually awarded. Always ≤ COBALT out of calibration. */
  tier: Tier;
  trustCapped: boolean;
  readiness: ReadinessOutcome;
  standing: Standing;
}

/**
 * Runs the full calibration. Always produces a complete profile — there is no
 * failure path that leaves an operator without a rank.
 */
export function runCalibration(
  args: {
    inputs: CalibrationInputs;
    ageYears: number;
    sex: NormKey;
    readiness: ReadinessFlags;
  },
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): CalibrationResult {
  const { inputs, ageYears, sex, readiness } = args;

  const breakdown = [
    scorePillar('strength', inputs, ageYears, sex),
    scorePillar('endurance', inputs, ageYears, sex),
    scorePillar('consistency', inputs, ageYears, sex),
    scorePillar('mobility', inputs, ageYears, sex),
  ];

  const pillars: PillarScores = {
    strength: breakdown[0]!.score,
    endurance: breakdown[1]!.score,
    consistency: breakdown[2]!.score,
    mobility: breakdown[3]!.score,
  };

  const cps = computeCps(pillars, config);
  const uncappedTier = tierForCps(cps, config);
  // Calibration output is SELF_REPORTED by definition — §6.
  const tier = applyTrustCap(uncappedTier, 'SELF_REPORTED', config);

  return {
    pillars,
    breakdown,
    cps,
    uncappedTier,
    tier,
    trustCapped: tier !== uncappedTier,
    readiness: resolveReadiness(readiness),
    standing: {
      cps,
      tier,
      uncappedTier,
      trustCapped: tier !== uncappedTier,
      level: 1,
      xpIntoLevel: 0,
      xpForNextLevel: config.xp.base,
      verification: 'SELF_REPORTED',
    },
  };
}

/** §6: re-testable every 90 days. */
export const RECALIBRATION_INTERVAL_DAYS = 90;

export function canRecalibrate(lastCalibratedAt: Date, now: Date): boolean {
  const elapsedDays = (now.getTime() - lastCalibratedAt.getTime()) / 86_400_000;
  return elapsedDays >= RECALIBRATION_INTERVAL_DAYS;
}
