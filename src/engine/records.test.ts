import { describe, expect, it } from 'vitest';
import {
  candidatesForSet,
  detectRecords,
  estimatedOneRepMax,
  formatRecord,
  progressionSeries,
  recentRecords,
  recordKey,
  recordsForExercise,
  recordsWorthCelebrating,
  type RecordBook,
} from './records';
import { scoreSession, type ExerciseScoringProfile } from './scoring';
import type { LoggedSession, LoggedSet } from './types';

const squat: ExerciseScoringProfile = {
  id: 'back_squat',
  pillar: 'strength',
  secondaryPillar: null,
  intensityFactor: 1.2,
  limits: { maxReps: 100, maxLoadKg: 500 },
};

const pushup: ExerciseScoringProfile = {
  id: 'push_up',
  pillar: 'strength',
  secondaryPillar: null,
  intensityFactor: 0.85,
  limits: { maxReps: 200 },
};

const run: ExerciseScoringProfile = {
  id: 'run',
  pillar: 'endurance',
  secondaryPillar: null,
  intensityFactor: 1,
  limits: { maxDistanceM: 100_000, maxSpeedMps: 12 },
};

const plank: ExerciseScoringProfile = {
  id: 'plank',
  pillar: 'mobility',
  secondaryPillar: null,
  intensityFactor: 0.8,
  limits: { maxDurationSec: 900 },
};

const lookup = (id: string) =>
  ({ back_squat: squat, push_up: pushup, run, plank })[id];

function session(sets: LoggedSet[], overrides: Partial<LoggedSession> = {}): LoggedSession {
  return {
    id: 's1',
    operatorId: 'op1',
    startedAt: '2026-03-01T09:00:00Z',
    endedAt: '2026-03-01T10:00:00Z',
    sets,
    verification: 'QR_CHECK_IN',
    venueId: 'v1',
    ...overrides,
  };
}

function detect(sets: LoggedSet[], book: RecordBook = {}, overrides: Partial<LoggedSession> = {}) {
  const logged = session(sets, overrides);
  const score = scoreSession(logged, lookup, 75);
  return detectRecords(score, logged.id, logged.startedAt, book);
}

describe('estimatedOneRepMax', () => {
  it('returns the load itself for a single', () => {
    expect(estimatedOneRepMax(1, 140)).toBe(140);
  });

  it('applies Epley for multi-rep sets', () => {
    // 100 * (1 + 5/30) = 116.7
    expect(estimatedOneRepMax(5, 100)).toBe(116.7);
  });

  it('refuses to estimate past 12 reps, where the formula degrades', () => {
    expect(estimatedOneRepMax(13, 100)).toBeNull();
    expect(estimatedOneRepMax(30, 60)).toBeNull();
  });

  it('rejects nonsense input', () => {
    expect(estimatedOneRepMax(0, 100)).toBeNull();
    expect(estimatedOneRepMax(5, 0)).toBeNull();
  });
});

describe('candidatesForSet', () => {
  it('yields load, volume and e1rm for a loaded set', () => {
    const metrics = candidatesForSet({
      exerciseId: 'back_squat',
      kind: 'reps_load',
      reps: 5,
      loadKg: 100,
    }).map((c) => c.metric);
    expect(metrics).toEqual(expect.arrayContaining(['load', 'volume', 'e1rm']));
  });

  it('yields reps for a bodyweight set', () => {
    const candidates = candidatesForSet({
      exerciseId: 'push_up',
      kind: 'reps_bodyweight',
      reps: 42,
    });
    expect(candidates).toEqual([{ metric: 'reps', value: 42 }]);
  });

  it('yields duration for a hold', () => {
    const candidates = candidatesForSet({
      exerciseId: 'plank',
      kind: 'hold',
      durationSec: 180,
    });
    expect(candidates).toEqual([{ metric: 'duration', value: 180 }]);
  });

  it('yields distance and pace for a timed run', () => {
    const metrics = candidatesForSet({
      exerciseId: 'run',
      kind: 'distance',
      distanceM: 5000,
      durationSec: 1500,
    }).map((c) => c.metric);
    expect(metrics).toEqual(['distance', 'pace']);
  });

  it('computes pace as seconds per kilometre', () => {
    const pace = candidatesForSet({
      exerciseId: 'run',
      kind: 'distance',
      distanceM: 5000,
      durationSec: 1500,
    }).find((c) => c.metric === 'pace')!;
    expect(pace.value).toBe(300);
  });

  it('does not record a pace over a trivially short distance', () => {
    const metrics = candidatesForSet({
      exerciseId: 'run',
      kind: 'distance',
      distanceM: 50,
      durationSec: 6,
    }).map((c) => c.metric);
    expect(metrics).not.toContain('pace');
  });

  it('yields nothing for an empty set', () => {
    expect(candidatesForSet({ exerciseId: 'back_squat', kind: 'reps_load' })).toEqual([]);
  });
});

describe('detectRecords', () => {
  it('records a first-ever effort as a baseline, not an improvement', () => {
    const { records } = detect([
      { exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 30 },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]!.isFirst).toBe(true);
    expect(records[0]!.previous).toBeNull();
    expect(records[0]!.improvement).toBe(0);
  });

  it('detects an improvement over a previous best', () => {
    const first = detect([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 30 }]);
    const second = detect(
      [{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 36 }],
      first.book,
    );

    expect(second.records).toHaveLength(1);
    expect(second.records[0]!.isFirst).toBe(false);
    expect(second.records[0]!.improvement).toBe(6);
    expect(second.records[0]!.previous!.value).toBe(30);
  });

  it('does not report a record for equalling the previous best', () => {
    const first = detect([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 30 }]);
    const second = detect(
      [{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 30 }],
      first.book,
    );
    expect(second.records).toHaveLength(0);
  });

  it('does not report a record for a worse effort', () => {
    const first = detect([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 30 }]);
    const second = detect(
      [{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 22 }],
      first.book,
    );
    expect(second.records).toHaveLength(0);
  });

  it('treats a lower pace as an improvement', () => {
    const first = detect([
      { exerciseId: 'run', kind: 'distance', distanceM: 5000, durationSec: 1800 },
    ]);
    const faster = detect(
      [{ exerciseId: 'run', kind: 'distance', distanceM: 5000, durationSec: 1500 }],
      first.book,
    );
    const paceRecord = faster.records.find((r) => r.record.metric === 'pace')!;
    expect(paceRecord.record.value).toBe(300);
    expect(paceRecord.improvement).toBe(60);
  });

  it('does not report a pace record for a slower run', () => {
    const first = detect([
      { exerciseId: 'run', kind: 'distance', distanceM: 5000, durationSec: 1500 },
    ]);
    const slower = detect(
      [{ exerciseId: 'run', kind: 'distance', distanceM: 5000, durationSec: 1800 }],
      first.book,
    );
    expect(slower.records.map((r) => r.record.metric)).not.toContain('pace');
  });

  it('reports one record per metric, not one per set', () => {
    // Three progressively heavier singles in one session is one load record.
    const { records } = detect([
      { exerciseId: 'back_squat', kind: 'reps_load', reps: 1, loadKg: 120 },
      { exerciseId: 'back_squat', kind: 'reps_load', reps: 1, loadKg: 130 },
      { exerciseId: 'back_squat', kind: 'reps_load', reps: 1, loadKg: 140 },
    ]);
    const loadRecords = records.filter((r) => r.record.metric === 'load');
    expect(loadRecords).toHaveLength(1);
    expect(loadRecords[0]!.record.value).toBe(140);
  });

  it('tracks load and volume as separate achievements', () => {
    const first = detect([
      { exerciseId: 'back_squat', kind: 'reps_load', reps: 1, loadKg: 140 },
    ]);
    // Lighter but far more volume — a real achievement the load record misses.
    const second = detect(
      [{ exerciseId: 'back_squat', kind: 'reps_load', reps: 10, loadKg: 100 }],
      first.book,
    );
    const metrics = second.records.map((r) => r.record.metric);
    expect(metrics).toContain('volume');
    expect(metrics).not.toContain('load');
  });

  it('keeps records for different movements independent', () => {
    const first = detect([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 40 }]);
    const second = detect(
      [{ exerciseId: 'back_squat', kind: 'reps_load', reps: 5, loadKg: 100 }],
      first.book,
    );
    expect(second.book[recordKey('push_up', 'reps')]!.value).toBe(40);
    expect(second.book[recordKey('back_squat', 'load')]!.value).toBe(100);
  });

  it('never sets a record from a flagged set — §7', () => {
    // 900 kg trips the implausibility ceiling, so it scores nothing.
    const { records, book } = detect([
      { exerciseId: 'back_squat', kind: 'reps_load', reps: 1, loadKg: 900 },
    ]);
    expect(records).toHaveLength(0);
    expect(Object.keys(book)).toHaveLength(0);
  });

  it('never sets a record from an unknown movement', () => {
    const { records } = detect([
      { exerciseId: 'not_a_real_exercise', kind: 'reps_load', reps: 5, loadKg: 100 },
    ]);
    expect(records).toHaveLength(0);
  });

  it('still records a PR from a session ended for injury — §21', () => {
    // The lift happened before the operator stopped. Refusing to record it
    // would be a penalty for getting hurt.
    const { records } = detect(
      [{ exerciseId: 'back_squat', kind: 'reps_load', reps: 1, loadKg: 150 }],
      {},
      { abortedForInjury: true },
    );
    expect(records.length).toBeGreaterThan(0);
  });

  it('sorts genuine improvements ahead of first-ever entries', () => {
    const first = detect([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 30 }]);
    const second = detect(
      [
        { exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 40 },
        { exerciseId: 'plank', kind: 'hold', durationSec: 90 },
      ],
      first.book,
    );
    expect(second.records[0]!.isFirst).toBe(false);
    expect(second.records[second.records.length - 1]!.isFirst).toBe(true);
  });

  it('leaves the input book untouched', () => {
    const first = detect([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 30 }]);
    const snapshot = JSON.stringify(first.book);
    detect([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 50 }], first.book);
    expect(JSON.stringify(first.book)).toBe(snapshot);
  });
});

describe('recordsWorthCelebrating', () => {
  it('excludes first-ever entries from the moment screen', () => {
    const { records } = detect([
      { exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 30 },
    ]);
    expect(records).toHaveLength(1);
    expect(recordsWorthCelebrating(records)).toHaveLength(0);
  });

  it('includes genuine improvements', () => {
    const first = detect([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 30 }]);
    const second = detect(
      [{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 45 }],
      first.book,
    );
    expect(recordsWorthCelebrating(second.records)).toHaveLength(1);
  });
});

describe('progressionSeries — §7 graph', () => {
  const built = (sets: LoggedSet[], id: string, startedAt: string) => {
    const logged = session(sets, { id, startedAt });
    return { id, startedAt, score: scoreSession(logged, lookup, 75) };
  };

  const history = [
    built([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 20 }], 's1', '2026-01-01T09:00:00Z'),
    built([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 26 }], 's2', '2026-01-08T09:00:00Z'),
    // A worse session — should not appear in a progression series.
    built([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 22 }], 's3', '2026-01-15T09:00:00Z'),
    built([{ exerciseId: 'push_up', kind: 'reps_bodyweight', reps: 31 }], 's4', '2026-01-22T09:00:00Z'),
  ];

  it('returns a monotone best-so-far series', () => {
    const series = progressionSeries(history, 'push_up', 'reps');
    expect(series.map((p) => p.value)).toEqual([20, 26, 31]);
  });

  it('orders by date regardless of input order', () => {
    const series = progressionSeries([...history].reverse(), 'push_up', 'reps');
    expect(series.map((p) => p.value)).toEqual([20, 26, 31]);
  });

  it('returns nothing for a movement never logged', () => {
    expect(progressionSeries(history, 'back_squat', 'load')).toEqual([]);
  });

  it('descends for pace, where lower is better', () => {
    const runs = [
      built([{ exerciseId: 'run', kind: 'distance', distanceM: 5000, durationSec: 1800 }], 'r1', '2026-01-01T09:00:00Z'),
      built([{ exerciseId: 'run', kind: 'distance', distanceM: 5000, durationSec: 1650 }], 'r2', '2026-01-08T09:00:00Z'),
      built([{ exerciseId: 'run', kind: 'distance', distanceM: 5000, durationSec: 1700 }], 'r3', '2026-01-15T09:00:00Z'),
    ];
    const series = progressionSeries(runs, 'run', 'pace');
    expect(series.map((p) => p.value)).toEqual([360, 330]);
  });
});

describe('record queries and formatting', () => {
  const book = detect([
    { exerciseId: 'back_squat', kind: 'reps_load', reps: 5, loadKg: 100 },
    { exerciseId: 'run', kind: 'distance', distanceM: 5000, durationSec: 1500 },
    { exerciseId: 'plank', kind: 'hold', durationSec: 185 },
  ]).book;

  it('lists every metric held for a movement', () => {
    const squatRecords = recordsForExercise(book, 'back_squat');
    expect(squatRecords.map((r) => r.metric).sort()).toEqual(['e1rm', 'load', 'volume']);
  });

  it('returns the most recent records first', () => {
    expect(recentRecords(book, 2)).toHaveLength(2);
  });

  it('formats pace as minutes per kilometre', () => {
    const pace = Object.values(book).find((r) => r.metric === 'pace')!;
    expect(formatRecord(pace)).toBe('5:00 /km');
  });

  it('formats a long hold in minutes and seconds', () => {
    const hold = Object.values(book).find((r) => r.metric === 'duration')!;
    expect(formatRecord(hold)).toBe('3m 05s');
  });

  it('formats a long distance in kilometres', () => {
    const distance = Object.values(book).find((r) => r.metric === 'distance')!;
    expect(formatRecord(distance)).toBe('5 km');
  });

  it('formats load with its unit', () => {
    const load = Object.values(book).find((r) => r.metric === 'load')!;
    expect(formatRecord(load)).toBe('100 kg');
  });
});
