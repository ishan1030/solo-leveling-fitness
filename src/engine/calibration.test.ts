import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_TABLES,
  ageBandFor,
  benchmarkFor,
  canRecalibrate,
  resolveReadiness,
  runCalibration,
  scoreAgainstBenchmark,
  scorePillar,
} from './calibration';
import { NO_READINESS_FLAGS, type ReadinessFlags } from './types';

const flags = (overrides: Partial<ReadinessFlags> = {}): ReadinessFlags => ({
  ...NO_READINESS_FLAGS,
  ...overrides,
});

describe('published tables — §6 legibility', () => {
  it('every table has ascending, same-length benchmark ladders', () => {
    for (const table of CALIBRATION_TABLES) {
      for (const bandId of Object.keys(table.byAgeBand)) {
        for (const sex of ['female', 'male'] as const) {
          const b = table.byAgeBand[bandId as keyof typeof table.byAgeBand][sex];
          expect(b.points.length, `${table.id}/${bandId}/${sex} length`).toBe(b.scores.length);
          for (let i = 1; i < b.scores.length; i++) {
            expect(b.scores[i]!, `${table.id} scores ascending`).toBeGreaterThan(b.scores[i - 1]!);
          }
        }
      }
    }
  });

  it('every pillar has input weights summing to 1', () => {
    for (const pillar of ['strength', 'endurance', 'consistency', 'mobility'] as const) {
      const sum = CALIBRATION_TABLES.filter((t) => t.pillar === pillar).reduce(
        (acc, t) => acc + t.weight,
        0,
      );
      expect(sum, `${pillar} weights`).toBeCloseTo(1, 9);
    }
  });

  it('covers all four pillars', () => {
    const pillars = new Set(CALIBRATION_TABLES.map((t) => t.pillar));
    expect(pillars).toEqual(new Set(['strength', 'endurance', 'consistency', 'mobility']));
  });
});

describe('ageBandFor', () => {
  it.each([
    [16, '16-19'],
    [19, '16-19'],
    [20, '20-29'],
    [35, '30-39'],
    [45, '40-49'],
    [55, '50-59'],
    [60, '60+'],
    [92, '60+'],
  ])('age %s is band %s', (age, band) => {
    expect(ageBandFor(age)).toBe(band);
  });
});

describe('scoreAgainstBenchmark', () => {
  const ladder = { points: [0, 10, 20, 30], scores: [0, 30, 60, 90] };

  it('returns exact rung values', () => {
    expect(scoreAgainstBenchmark(0, ladder, false)).toBe(0);
    expect(scoreAgainstBenchmark(10, ladder, false)).toBe(30);
    expect(scoreAgainstBenchmark(30, ladder, false)).toBe(90);
  });

  it('interpolates between rungs so there are no cliff edges', () => {
    expect(scoreAgainstBenchmark(5, ladder, false)).toBe(15);
    expect(scoreAgainstBenchmark(15, ladder, false)).toBe(45);
  });

  it('clamps beyond the top rung rather than extrapolating', () => {
    expect(scoreAgainstBenchmark(999, ladder, false)).toBe(90);
  });

  it('clamps below the bottom rung', () => {
    expect(scoreAgainstBenchmark(-50, ladder, false)).toBe(0);
  });

  it('inverts correctly when lower is better', () => {
    const time = { points: [600, 450, 300], scores: [0, 50, 100] };
    expect(scoreAgainstBenchmark(600, time, true)).toBe(0);
    expect(scoreAgainstBenchmark(450, time, true)).toBe(50);
    expect(scoreAgainstBenchmark(300, time, true)).toBe(100);
    // Faster than the top rung is still capped at 100.
    expect(scoreAgainstBenchmark(200, time, true)).toBe(100);
    // Slower than the bottom rung floors at 0.
    expect(scoreAgainstBenchmark(900, time, true)).toBe(0);
  });

  it('is monotonic across the whole range', () => {
    let previous = -1;
    for (let raw = 0; raw <= 30; raw += 0.5) {
      const score = scoreAgainstBenchmark(raw, ladder, false);
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });
});

describe('benchmarkFor', () => {
  it('blends the two curves for unspecified sex', () => {
    const table = CALIBRATION_TABLES.find((t) => t.id === 'pushups')!;
    const female = benchmarkFor(table, 25, 'female');
    const male = benchmarkFor(table, 25, 'male');
    const blended = benchmarkFor(table, 25, 'unspecified');

    for (let i = 0; i < blended.points.length; i++) {
      const expected = (female.points[i]! + male.points[i]!) / 2;
      expect(blended.points[i]!).toBeCloseTo(expected, 1);
    }
  });

  it('scales benchmarks down for older bands', () => {
    const table = CALIBRATION_TABLES.find((t) => t.id === 'pushups')!;
    const young = benchmarkFor(table, 25, 'male');
    const older = benchmarkFor(table, 65, 'male');
    // The same rep count earns more in the older band, which is the point of banding.
    expect(older.points[5]!).toBeLessThan(young.points[5]!);
  });
});

describe('scorePillar — skipped optional inputs', () => {
  it('redistributes weight instead of scoring a skip as zero', () => {
    const withBench = scorePillar(
      'strength',
      { pushups: 30, pullups: 8, squats: 50, bench: 1.2 },
      25,
      'male',
    );
    const withoutBench = scorePillar(
      'strength',
      { pushups: 30, pullups: 8, squats: 50 },
      25,
      'male',
    );

    // Skipping the optional bench must not tank the pillar.
    expect(withoutBench.score).toBeGreaterThan(withBench.score * 0.75);
    // And the answered inputs' weights must now sum to 1.
    const answeredWeight = withoutBench.contributions
      .filter((c) => !c.skipped)
      .reduce((sum, c) => sum + c.effectiveWeight, 0);
    expect(answeredWeight).toBeCloseTo(1, 1);
  });

  it('marks skipped inputs explicitly for the reveal breakdown', () => {
    const result = scorePillar('strength', { pushups: 20, pullups: 5, squats: 40 }, 25, 'male');
    const bench = result.contributions.find((c) => c.tableId === 'bench')!;
    expect(bench.skipped).toBe(true);
    expect(bench.raw).toBeNull();
    expect(bench.effectiveWeight).toBe(0);
  });

  it('shows its working — one contribution per input', () => {
    const result = scorePillar('mobility', { sit_reach: 5, overhead_squat: 3, shoulder_rotation: 2 }, 30, 'female');
    expect(result.contributions).toHaveLength(3);
    for (const c of result.contributions) {
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveReadiness — §6 / §21', () => {
  it('never locks anyone out, whatever they report', () => {
    const everyFlag = flags({
      chestPain: true,
      dizzinessOrFainting: true,
      jointInjury: true,
      pregnancy: true,
      cardiacHistory: true,
      medication: true,
    });
    expect(resolveReadiness(everyFlag).receivesFullProfile).toBe(true);
  });

  it('applies conservative loading and the calm coach on any flag', () => {
    const outcome = resolveReadiness(flags({ jointInjury: true }));
    expect(outcome.conservativeLoading).toBe(true);
    expect(outcome.defaultPersonality).toBe('CALM_MENTOR');
    expect(outcome.showPhysicianBanner).toBe(true);
    expect(outcome.medicalStopState).toBe(false);
  });

  it('escalates to the medical-stop state for cardiac and syncope reports', () => {
    expect(resolveReadiness(flags({ chestPain: true })).medicalStopState).toBe(true);
    expect(resolveReadiness(flags({ dizzinessOrFainting: true })).medicalStopState).toBe(true);
    expect(resolveReadiness(flags({ cardiacHistory: true })).medicalStopState).toBe(true);
  });

  it('does not escalate for medication or joint injury alone', () => {
    expect(resolveReadiness(flags({ medication: true })).medicalStopState).toBe(false);
    expect(resolveReadiness(flags({ jointInjury: true })).medicalStopState).toBe(false);
  });

  it('leaves an unflagged operator with no banner', () => {
    const outcome = resolveReadiness(NO_READINESS_FLAGS);
    expect(outcome.showPhysicianBanner).toBe(false);
    expect(outcome.bannerCopy).toBeNull();
    expect(outcome.conservativeLoading).toBe(false);
  });

  it('writes banner copy free of shame and appearance references — §21', () => {
    const banned = /lazy|fat|weight|shame|excuse|failure|body fat|overweight|calorie/i;
    for (const f of [flags({ chestPain: true }), flags({ medication: true })]) {
      const copy = resolveReadiness(f).bannerCopy;
      if (copy) expect(copy).not.toMatch(banned);
    }
  });
});

describe('runCalibration', () => {
  const beginnerInputs = {
    pushups: 5,
    pullups: 0,
    squats: 15,
    run_pace: 480,
    run_distance: 1,
    sessions_per_week: 1,
    months_training: 1,
    sit_reach: -10,
    overhead_squat: 1,
    shoulder_rotation: 1,
  };

  const eliteInputs = {
    pushups: 90,
    pullups: 35,
    squats: 130,
    bench: 2.2,
    run_pace: 235,
    run_distance: 30,
    resting_hr: 44,
    sessions_per_week: 6,
    months_training: 84,
    sit_reach: 22,
    overhead_squat: 4,
    shoulder_rotation: 4,
  };

  it('produces a full profile for a beginner', () => {
    const result = runCalibration({
      inputs: beginnerInputs,
      ageYears: 24,
      sex: 'male',
      readiness: NO_READINESS_FLAGS,
    });
    expect(result.tier).toBe('ASH');
    expect(result.cps).toBeGreaterThanOrEqual(0);
    expect(result.standing.level).toBe(1);
    expect(result.standing.verification).toBe('SELF_REPORTED');
  });

  it('caps even a maximal self-reported calibration at COBALT — §6 spine', () => {
    const result = runCalibration({
      inputs: eliteInputs,
      ageYears: 25,
      sex: 'male',
      readiness: NO_READINESS_FLAGS,
    });
    expect(result.uncappedTier).toBe('ECLIPSE');
    expect(result.tier).toBe('COBALT');
    expect(result.trustCapped).toBe(true);
  });

  it('always reports SELF_REPORTED verification out of onboarding', () => {
    const result = runCalibration({
      inputs: eliteInputs,
      ageYears: 30,
      sex: 'female',
      readiness: NO_READINESS_FLAGS,
    });
    expect(result.standing.verification).toBe('SELF_REPORTED');
  });

  it('gives a readiness-flagged operator the same scores as an unflagged one', () => {
    // §6: "Never make the flagged experience feel like a lesser version."
    const clean = runCalibration({
      inputs: beginnerInputs,
      ageYears: 40,
      sex: 'female',
      readiness: NO_READINESS_FLAGS,
    });
    const flagged = runCalibration({
      inputs: beginnerInputs,
      ageYears: 40,
      sex: 'female',
      readiness: flags({ cardiacHistory: true }),
    });
    expect(flagged.pillars).toEqual(clean.pillars);
    expect(flagged.cps).toBe(clean.cps);
    expect(flagged.tier).toBe(clean.tier);
    // Only the coaching posture differs.
    expect(flagged.readiness.conservativeLoading).toBe(true);
    expect(clean.readiness.conservativeLoading).toBe(false);
  });

  it('returns a four-pillar breakdown that can be rendered on the reveal', () => {
    const result = runCalibration({
      inputs: beginnerInputs,
      ageYears: 24,
      sex: 'male',
      readiness: NO_READINESS_FLAGS,
    });
    expect(result.breakdown.map((b) => b.pillar)).toEqual([
      'strength',
      'endurance',
      'consistency',
      'mobility',
    ]);
  });

  it('scores an older operator fairly against their own band', () => {
    const inputs = { ...beginnerInputs, pushups: 25, pullups: 5, squats: 45 };
    const young = runCalibration({
      inputs,
      ageYears: 25,
      sex: 'male',
      readiness: NO_READINESS_FLAGS,
    });
    const older = runCalibration({
      inputs,
      ageYears: 62,
      sex: 'male',
      readiness: NO_READINESS_FLAGS,
    });
    // Identical performance scores higher in the older band.
    expect(older.pillars.strength).toBeGreaterThan(young.pillars.strength);
  });
});

describe('canRecalibrate — §6, every 90 days', () => {
  const base = new Date('2026-01-01T00:00:00Z');

  it('refuses before 90 days', () => {
    expect(canRecalibrate(base, new Date('2026-03-01T00:00:00Z'))).toBe(false);
  });

  it('allows at 90 days and beyond', () => {
    expect(canRecalibrate(base, new Date('2026-04-01T00:00:00Z'))).toBe(true);
    expect(canRecalibrate(base, new Date('2027-01-01T00:00:00Z'))).toBe(true);
  });
});
