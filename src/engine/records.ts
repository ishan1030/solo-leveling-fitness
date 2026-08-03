import { round1, round2 } from './progression';
import type { ScoredSet, SessionScore } from './scoring';
import type { LoggedSet, SetKind } from './types';

/**
 * §7 — "PR history per movement with a simple progression graph."
 *
 * A personal record is a factual claim about something the operator did. This
 * module is deliberately conservative about what counts as one:
 *
 *  - A flagged set (§7 implausible input) can never set a record. It scored
 *    nothing, so it proves nothing.
 *  - A record must strictly beat the previous best. Equalling it is not a PR;
 *    telling someone they set a record when they repeated last week's number
 *    devalues every real one.
 *  - Records are per (movement, metric), not per movement. A heavier single and
 *    a higher-volume set are different achievements and both are worth having.
 */

/**
 * What is being recorded. Several metrics can apply to one movement — a barbell
 * squat has a best load, a best estimated single, and a best set volume, and an
 * operator legitimately cares about all three.
 */
export type RecordMetric =
  | 'load'      // heaviest load moved for any rep count, kg
  | 'e1rm'      // best estimated one-rep max, kg
  | 'volume'    // most load × reps in a single set, kg
  | 'reps'      // most reps in a single set
  | 'duration'  // longest hold or effort, seconds
  | 'distance'  // furthest single effort, metres
  | 'pace';     // fastest pace over ≥ 400 m, seconds per km (lower is better)

export interface PersonalRecord {
  exerciseId: string;
  metric: RecordMetric;
  value: number;
  unit: string;
  /** ISO datetime of the session that set it. */
  achievedAt: string;
  sessionId: string;
}

/** Keyed `exerciseId::metric`. */
export type RecordBook = Record<string, PersonalRecord>;

export function recordKey(exerciseId: string, metric: RecordMetric): string {
  return `${exerciseId}::${metric}`;
}

/** §7: pace is the one metric where a lower number is the better one. */
export function lowerIsBetter(metric: RecordMetric): boolean {
  return metric === 'pace';
}

export const METRIC_UNITS: Record<RecordMetric, string> = {
  load: 'kg',
  e1rm: 'kg',
  volume: 'kg',
  reps: 'reps',
  duration: 's',
  distance: 'm',
  pace: 's/km',
};

export const METRIC_LABELS: Record<RecordMetric, string> = {
  load: 'Heaviest load',
  e1rm: 'Estimated single',
  volume: 'Best set volume',
  reps: 'Most reps',
  duration: 'Longest effort',
  distance: 'Furthest',
  pace: 'Fastest pace',
};

// ---------------------------------------------------------------------------
// Candidate extraction
// ---------------------------------------------------------------------------

/**
 * Epley formula. Used only for display and for the `e1rm` record — never for
 * scoring, which reads measured values directly (§2 FAILURE 1).
 *
 * Deliberately not computed above 12 reps: the formula's error grows fast past
 * that point, and a "record" derived from a bad estimate is worse than no record.
 */
export function estimatedOneRepMax(reps: number, loadKg: number): number | null {
  if (reps < 1 || reps > 12 || loadKg <= 0) return null;
  if (reps === 1) return round1(loadKg);
  return round1(loadKg * (1 + reps / 30));
}

/** Minimum distance before a pace record is meaningful. */
const MIN_PACE_DISTANCE_M = 400;

/** Every record a single set could plausibly set. */
export function candidatesForSet(set: LoggedSet): { metric: RecordMetric; value: number }[] {
  const candidates: { metric: RecordMetric; value: number }[] = [];
  const kind: SetKind = set.kind;

  if (kind === 'reps_load') {
    const reps = set.reps ?? 0;
    const load = set.loadKg ?? 0;
    if (load > 0) candidates.push({ metric: 'load', value: round1(load) });
    if (reps > 0 && load > 0) {
      candidates.push({ metric: 'volume', value: round1(reps * load) });
      const e1rm = estimatedOneRepMax(reps, load);
      if (e1rm !== null) candidates.push({ metric: 'e1rm', value: e1rm });
    }
  }

  if (kind === 'reps_bodyweight' && (set.reps ?? 0) > 0) {
    candidates.push({ metric: 'reps', value: set.reps! });
  }

  if ((kind === 'hold' || kind === 'time') && (set.durationSec ?? 0) > 0) {
    candidates.push({ metric: 'duration', value: set.durationSec! });
  }

  if (kind === 'distance') {
    const metres = set.distanceM ?? 0;
    const seconds = set.durationSec ?? 0;
    if (metres > 0) candidates.push({ metric: 'distance', value: round1(metres) });
    // A pace record over 50 m is noise, not an achievement.
    if (metres >= MIN_PACE_DISTANCE_M && seconds > 0) {
      candidates.push({ metric: 'pace', value: round1((seconds / metres) * 1000) });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export interface DetectedRecord {
  record: PersonalRecord;
  /** null the first time a metric is recorded for a movement. */
  previous: PersonalRecord | null;
  /** Signed improvement, always positive in the direction that is better. */
  improvement: number;
  /** True when this is the first time this metric has been logged at all. */
  isFirst: boolean;
}

export interface RecordDetectionResult {
  /** New records, best-improvement first, so the moment screen leads with the biggest. */
  records: DetectedRecord[];
  /** The record book with every new record applied. */
  book: RecordBook;
}

/**
 * Detects records set by a scored session.
 *
 * Takes `SessionScore` rather than the raw session so that flagged sets are
 * already marked: §7 requires implausible entries to be excluded from PRs, and
 * reading the scored output means that exclusion cannot be forgotten here.
 *
 * An aborted-for-injury session still sets records. The sets were completed and
 * the lift happened; refusing to record it would be a penalty for getting hurt,
 * which §21 forbids.
 */
export function detectRecords(
  score: SessionScore,
  sessionId: string,
  achievedAt: string,
  book: RecordBook,
): RecordDetectionResult {
  const nextBook: RecordBook = { ...book };
  const detected: DetectedRecord[] = [];

  // Best candidate per (exercise, metric) within this session, so a session
  // containing three progressively heavier singles reports one record, not three.
  const bestInSession = new Map<string, { set: ScoredSet; metric: RecordMetric; value: number }>();

  for (const scoredSet of score.sets) {
    // §7: a flagged or unscored set proves nothing.
    if (scoredSet.excluded) continue;

    for (const candidate of candidatesForSet(scoredSet.set)) {
      const key = recordKey(scoredSet.set.exerciseId, candidate.metric);
      const existing = bestInSession.get(key);
      const better =
        existing === undefined ||
        (lowerIsBetter(candidate.metric)
          ? candidate.value < existing.value
          : candidate.value > existing.value);

      if (better) {
        bestInSession.set(key, { set: scoredSet, metric: candidate.metric, value: candidate.value });
      }
    }
  }

  for (const [key, best] of bestInSession) {
    const previous = nextBook[key] ?? null;

    // Strictly better. Equalling a record is not setting one.
    const beatsPrevious =
      previous === null ||
      (lowerIsBetter(best.metric) ? best.value < previous.value : best.value > previous.value);

    if (!beatsPrevious) continue;

    const record: PersonalRecord = {
      exerciseId: best.set.set.exerciseId,
      metric: best.metric,
      value: best.value,
      unit: METRIC_UNITS[best.metric],
      achievedAt,
      sessionId,
    };

    nextBook[key] = record;
    detected.push({
      record,
      previous,
      improvement:
        previous === null
          ? 0
          : round2(
              lowerIsBetter(best.metric)
                ? previous.value - best.value
                : best.value - previous.value,
            ),
      isFirst: previous === null,
    });
  }

  // A first-ever entry is not a "record" worth a full-screen moment — it is just
  // a baseline. Genuine improvements sort first, largest first.
  detected.sort((a, b) => {
    if (a.isFirst !== b.isFirst) return a.isFirst ? 1 : -1;
    return b.improvement - a.improvement;
  });

  return { records: detected, book: nextBook };
}

/**
 * The subset worth interrupting the operator for with the §19 moment-3 screen.
 *
 * First-ever entries are excluded: every movement's first log would otherwise
 * fire a celebration, and a PR that everyone gets on their first session is not
 * a PR. The records still enter the book and appear in history.
 */
export function recordsWorthCelebrating(records: DetectedRecord[]): DetectedRecord[] {
  return records.filter((r) => !r.isFirst);
}

// ---------------------------------------------------------------------------
// History — §7's "simple progression graph"
// ---------------------------------------------------------------------------

export interface HistoryPoint {
  achievedAt: string;
  value: number;
}

/**
 * Builds the series for one movement and metric from the session log.
 *
 * Returns a **monotone best-so-far series**, not every logged value: §7 asks for
 * a progression graph, and a scatter of every set an operator has ever done is a
 * different chart answering a different question. The line only ever moves in
 * the improving direction.
 */
export function progressionSeries(
  sessions: { id: string; startedAt: string; score: SessionScore }[],
  exerciseId: string,
  metric: RecordMetric,
): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  let best: number | null = null;

  const ordered = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );

  for (const session of ordered) {
    let sessionBest: number | null = null;

    for (const scoredSet of session.score.sets) {
      if (scoredSet.excluded) continue;
      if (scoredSet.set.exerciseId !== exerciseId) continue;

      for (const candidate of candidatesForSet(scoredSet.set)) {
        if (candidate.metric !== metric) continue;
        if (
          sessionBest === null ||
          (lowerIsBetter(metric) ? candidate.value < sessionBest : candidate.value > sessionBest)
        ) {
          sessionBest = candidate.value;
        }
      }
    }

    if (sessionBest === null) continue;

    const improved =
      best === null || (lowerIsBetter(metric) ? sessionBest < best : sessionBest > best);

    if (improved) {
      best = sessionBest;
      points.push({ achievedAt: session.startedAt, value: sessionBest });
    }
  }

  return points;
}

/** Every metric an operator holds a record in, for a given movement. */
export function recordsForExercise(book: RecordBook, exerciseId: string): PersonalRecord[] {
  return Object.values(book)
    .filter((record) => record.exerciseId === exerciseId)
    .sort((a, b) => a.metric.localeCompare(b.metric));
}

/** Most recent records across all movements, for the profile. */
export function recentRecords(book: RecordBook, limit = 10): PersonalRecord[] {
  return Object.values(book)
    .sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
    .slice(0, limit);
}

export function formatRecord(record: PersonalRecord): string {
  if (record.metric === 'pace') {
    const totalSeconds = Math.round(record.value);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')} /km`;
  }
  if (record.metric === 'duration' && record.value >= 60) {
    const minutes = Math.floor(record.value / 60);
    const seconds = Math.round(record.value % 60);
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  if (record.metric === 'distance' && record.value >= 1000) {
    return `${round2(record.value / 1000)} km`;
  }
  return `${record.value} ${record.unit}`;
}
