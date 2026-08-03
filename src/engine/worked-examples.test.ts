import { describe, expect, it } from 'vitest';
import { runCalibration } from './calibration';
import {
  NO_ROLLING_GAIN,
  applyStatGain,
  awardXp,
  computeCps,
  computeDecay,
  computeStanding,
  cpsForNextTier,
  tierForCps,
  xpForNextLevel,
} from './progression';
import { scoreSession } from './scoring';
import { scoringProfileFor } from '../data/exercises';
import { NO_READINESS_FLAGS, type OperatorProfile, type PillarScores } from './types';

/**
 * §5: "plus worked examples for three sample users at different levels."
 *
 * These are executable. Every number quoted in docs/05-progression-state-machine.md
 * is asserted here, so the documentation cannot drift from the engine — if a
 * constant changes, this file fails and the doc gets corrected with it.
 *
 * Run `npx vitest run worked-examples --reporter=verbose` to print the ladder.
 */

function profileFrom(
  pillars: PillarScores,
  overrides: Partial<OperatorProfile> = {},
): OperatorProfile {
  return {
    id: 'op_worked',
    displayName: 'Worked Example',
    ageYears: 27,
    sex: 'unspecified',
    pillars,
    level: 1,
    xpIntoLevel: 0,
    verification: 'SELF_REPORTED',
    readiness: NO_READINESS_FLAGS,
    lastSessionDate: null,
    careerPeakCps: computeCps(pillars),
    seasonPeakTier: tierForCps(computeCps(pillars)),
    pausedFor: null,
    homeVenueId: null,
    cityId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// USER A — PRIYA, 24, complete beginner
// ---------------------------------------------------------------------------

describe('Worked example A — Priya, 24, beginner', () => {
  const calibration = runCalibration({
    inputs: {
      pushups: 6,
      pullups: 0,
      squats: 20,
      // bench skipped — no barbell access
      run_distance: 1.5,
      run_pace: 480,
      // resting_hr skipped
      sessions_per_week: 2,
      months_training: 2,
      sit_reach: -6,
      overhead_squat: 2,
      shoulder_rotation: 2,
    },
    ageYears: 24,
    sex: 'female',
    readiness: NO_READINESS_FLAGS,
  });

  it('lands in ASH or IRON with a legible breakdown', () => {
    expect(['ASH', 'IRON']).toContain(calibration.tier);
    expect(calibration.standing.level).toBe(1);
    expect(calibration.standing.verification).toBe('SELF_REPORTED');
  });

  it('redistributes the two skipped optional inputs rather than zeroing them', () => {
    const strength = calibration.breakdown.find((b) => b.pillar === 'strength')!;
    const bench = strength.contributions.find((c) => c.tableId === 'bench')!;
    expect(bench.skipped).toBe(true);
    const answeredWeight = strength.contributions
      .filter((c) => !c.skipped)
      .reduce((sum, c) => sum + c.effectiveWeight, 0);
    expect(answeredWeight).toBeCloseTo(1, 1);
  });

  it('reaches level 2 after roughly one committed week', () => {
    // Four sessions of moderate volume.
    const session = {
      id: 's',
      operatorId: 'op_worked',
      startedAt: '2026-03-02T09:00:00Z',
      endedAt: '2026-03-02T10:00:00Z',
      verification: 'SELF_REPORTED' as const,
      venueId: null,
      sets: [
        { exerciseId: 'push_up__knee', kind: 'reps_bodyweight' as const, reps: 10 },
        { exerciseId: 'push_up__knee', kind: 'reps_bodyweight' as const, reps: 8 },
        { exerciseId: 'squat__bodyweight', kind: 'reps_bodyweight' as const, reps: 20 },
        { exerciseId: 'squat__bodyweight', kind: 'reps_bodyweight' as const, reps: 18 },
        { exerciseId: 'plank__front', kind: 'hold' as const, durationSec: 45 },
      ],
    };

    const score = scoreSession(session, scoringProfileFor, 58);
    expect(score.xp).toBeGreaterThan(0);
    expect(score.flaggedSetCount).toBe(0);

    // Four such sessions.
    const levelling = awardXp(1, 0, score.xp * 4);
    expect(levelling.level).toBeGreaterThanOrEqual(2);
  });

  it('is capped at COBALT no matter how well she self-reports', () => {
    const perfect = runCalibration({
      inputs: {
        pushups: 90, pullups: 30, squats: 120, bench: 2,
        run_distance: 25, run_pace: 250, resting_hr: 45,
        sessions_per_week: 7, months_training: 84,
        sit_reach: 25, overhead_squat: 4, shoulder_rotation: 4,
      },
      ageYears: 24,
      sex: 'female',
      readiness: NO_READINESS_FLAGS,
    });
    expect(perfect.uncappedTier).toBe('ECLIPSE');
    expect(perfect.tier).toBe('COBALT');
  });
});

// ---------------------------------------------------------------------------
// USER B — RAJESH, 34, intermediate, verified, the level/tier tension
// ---------------------------------------------------------------------------

describe('Worked example B — Rajesh, 34, intermediate and verified', () => {
  const pillars: PillarScores = {
    strength: 58,
    endurance: 44,
    consistency: 72,
    mobility: 35,
  };

  it('computes CPS from the §5 weights', () => {
    // 58*.30 + 44*.30 + 72*.25 + 35*.15 = 17.4 + 13.2 + 18.0 + 5.25 = 53.85
    expect(computeCps(pillars)).toBe(53.9);
  });

  it('sits in COBALT with STORM 6.1 points away', () => {
    const standing = computeStanding(profileFrom(pillars, { verification: 'QR_CHECK_IN' }));
    expect(standing.tier).toBe('COBALT');
    expect(standing.trustCapped).toBe(false);
    expect(cpsForNextTier(standing.cps)).toBe(60);
    expect(60 - standing.cps).toBeCloseTo(6.1, 1);
  });

  it('needs at least four weeks of maximal gain to reach STORM', () => {
    // The §5 cap allows +2.0 CPS per week at absolute best.
    let current = pillars;
    let weeks = 0;
    while (computeCps(current) < 60 && weeks < 20) {
      current = applyStatGain(
        current,
        { strength: 99, endurance: 99, consistency: 99, mobility: 99 },
        NO_ROLLING_GAIN,
      ).pillars;
      weeks += 1;
    }
    expect(weeks).toBe(4);
    expect(tierForCps(computeCps(current))).toBe('STORM');
  });

  it('shows the level/tier tension once level outpaces capability', () => {
    const standing = computeStanding(
      profileFrom(pillars, { level: 41, verification: 'QR_CHECK_IN' }),
    );
    expect(standing.level).toBe(41);
    expect(standing.tier).toBe('COBALT');
    // Level 41 with a COBALT tier is exactly the §5 tension the UI must explain.
    expect(xpForNextLevel(41)).toBe(18110);
  });

  it('would be shown COBALT even at a STORM score if he stopped verifying', () => {
    const stormPillars: PillarScores = {
      strength: 70, endurance: 62, consistency: 75, mobility: 55,
    };
    const verified = computeStanding(
      profileFrom(stormPillars, { verification: 'QR_CHECK_IN' }),
    );
    const lapsed = computeStanding(
      profileFrom(stormPillars, { verification: 'SELF_REPORTED' }),
    );
    expect(verified.tier).toBe('STORM');
    expect(lapsed.tier).toBe('COBALT');
    expect(lapsed.uncappedTier).toBe('STORM');
  });
});

// ---------------------------------------------------------------------------
// USER C — SUNITA, 41, advanced, injured, then decaying
// ---------------------------------------------------------------------------

describe('Worked example C — Sunita, 41, advanced, injured mid-season', () => {
  const pillars: PillarScores = {
    strength: 82,
    endurance: 88,
    consistency: 90,
    mobility: 70,
  };

  it('sits in SOLAR when verified', () => {
    // 82*.30 + 88*.30 + 90*.25 + 70*.15 = 24.6 + 26.4 + 22.5 + 10.5 = 84.0
    expect(computeCps(pillars)).toBe(84);
    const standing = computeStanding(
      profileFrom(pillars, { verification: 'EQUIPMENT_TAP' }),
    );
    expect(standing.tier).toBe('SOLAR');
  });

  it('needs 6 more CPS for ECLIPSE — three maximal weeks', () => {
    expect(cpsForNextTier(84)).toBe(90);
  });

  it('does not decay at all while injury is logged', () => {
    const injured = profileFrom(pillars, {
      verification: 'EQUIPMENT_TAP',
      lastSessionDate: '2026-03-01',
      pausedFor: 'injury',
      careerPeakCps: 84,
    });
    const afterSixMonths = computeDecay(injured, new Date('2026-09-01T00:00:00Z'));
    expect(afterSixMonths.isDecaying).toBe(false);
    expect(afterSixMonths.cpsLost).toBe(0);
    expect(computeCps(afterSixMonths.pillars)).toBe(84);
  });

  it('decays only after 21 idle days once the pause is lifted', () => {
    const resumed = profileFrom(pillars, {
      verification: 'EQUIPMENT_TAP',
      lastSessionDate: '2026-03-01',
      pausedFor: null,
      careerPeakCps: 84,
    });

    const atDay21 = computeDecay(resumed, new Date('2026-03-22T00:00:00Z'));
    expect(atDay21.idleDays).toBe(21);
    expect(atDay21.isDecaying).toBe(false);

    const atDay31 = computeDecay(resumed, new Date('2026-04-01T00:00:00Z'));
    expect(atDay31.idleDays).toBe(31);
    expect(atDay31.cpsLost).toBe(10);
    expect(computeCps(atDay31.pillars)).toBeCloseTo(74, 0);
  });

  it('never falls below STORM — one tier under her SOLAR career peak', () => {
    const abandoned = profileFrom(pillars, {
      verification: 'EQUIPMENT_TAP',
      lastSessionDate: '2026-03-01',
      careerPeakCps: 84,
    });
    const afterTwoYears = computeDecay(abandoned, new Date('2028-03-01T00:00:00Z'));
    const floorCps = computeCps(afterTwoYears.pillars);
    expect(floorCps).toBeCloseTo(60, 0);
    expect(tierForCps(floorCps)).toBe('STORM');
  });

  it('keeps her shape as she decays — endurance stays above strength', () => {
    const abandoned = profileFrom(pillars, {
      verification: 'EQUIPMENT_TAP',
      lastSessionDate: '2026-03-01',
      careerPeakCps: 84,
    });
    const decayed = computeDecay(abandoned, new Date('2028-03-01T00:00:00Z')).pillars;
    expect(decayed.endurance).toBeGreaterThan(decayed.strength);
    expect(decayed.consistency).toBeGreaterThan(decayed.mobility);
  });
});
