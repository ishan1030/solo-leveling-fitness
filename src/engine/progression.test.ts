import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRESSION, assertConfigValid } from './config';
import {
  NO_ROLLING_GAIN,
  applyStatGain,
  applyTrustCap,
  awardXp,
  computeCps,
  computeDecay,
  computeStanding,
  cpsForNextTier,
  decayFloorCps,
  reevaluateTier,
  scalePillarsToCps,
  tierForCps,
  xpForNextLevel,
} from './progression';
import {
  NO_READINESS_FLAGS,
  type OperatorProfile,
  type PillarScores,
  type VerificationTier,
} from './types';

function pillars(s: number, e: number, c: number, m: number): PillarScores {
  return { strength: s, endurance: e, consistency: c, mobility: m };
}

function operator(overrides: Partial<OperatorProfile> = {}): OperatorProfile {
  return {
    id: 'op_test',
    displayName: 'Test Operator',
    ageYears: 28,
    sex: 'unspecified',
    pillars: pillars(50, 50, 50, 50),
    level: 1,
    xpIntoLevel: 0,
    verification: 'QR_CHECK_IN',
    readiness: NO_READINESS_FLAGS,
    lastSessionDate: null,
    careerPeakCps: 50,
    seasonPeakTier: 'COBALT',
    pausedFor: null,
    homeVenueId: null,
    cityId: null,
    ...overrides,
  };
}

describe('config', () => {
  it('ships a valid default', () => {
    expect(() => assertConfigValid(DEFAULT_PROGRESSION)).not.toThrow();
  });

  it('rejects weights that do not sum to 1', () => {
    expect(() =>
      assertConfigValid({
        ...DEFAULT_PROGRESSION,
        pillarWeights: { strength: 0.5, endurance: 0.3, consistency: 0.25, mobility: 0.15 },
      }),
    ).toThrow(/sum to 1/);
  });

  it('rejects non-ascending tier thresholds', () => {
    expect(() =>
      assertConfigValid({
        ...DEFAULT_PROGRESSION,
        tierThresholds: [
          { tier: 'ASH', minCps: 0 },
          { tier: 'IRON', minCps: 45 },
          { tier: 'COBALT', minCps: 30 },
        ],
      }),
    ).toThrow(/ascending/);
  });
});

describe('computeCps — §5 weighting', () => {
  it('applies 30/30/25/15', () => {
    // 80*.3 + 60*.3 + 40*.25 + 20*.15 = 24 + 18 + 10 + 3 = 55
    expect(computeCps(pillars(80, 60, 40, 20))).toBe(55);
  });

  it('is 0 for an empty profile and 100 for a maxed one', () => {
    expect(computeCps(pillars(0, 0, 0, 0))).toBe(0);
    expect(computeCps(pillars(100, 100, 100, 100))).toBe(100);
  });

  it('weights strength and endurance above mobility', () => {
    const strengthHeavy = computeCps(pillars(100, 0, 0, 0));
    const mobilityHeavy = computeCps(pillars(0, 0, 0, 100));
    expect(strengthHeavy).toBeGreaterThan(mobilityHeavy);
    expect(strengthHeavy).toBe(30);
    expect(mobilityHeavy).toBe(15);
  });
});

describe('tierForCps — §5 bands', () => {
  it.each([
    [0, 'ASH'],
    [29, 'ASH'],
    [29.9, 'ASH'],
    [30, 'IRON'],
    [44, 'IRON'],
    [45, 'COBALT'],
    [59, 'COBALT'],
    [60, 'STORM'],
    [74, 'STORM'],
    [75, 'SOLAR'],
    [89, 'SOLAR'],
    [90, 'ECLIPSE'],
    [100, 'ECLIPSE'],
  ])('CPS %s resolves to %s', (cps, expected) => {
    expect(tierForCps(cps)).toBe(expected);
  });

  it('reports the next threshold, and null at the ceiling', () => {
    expect(cpsForNextTier(31)).toBe(45);
    expect(cpsForNextTier(89)).toBe(90);
    expect(cpsForNextTier(95)).toBeNull();
  });
});

describe('applyTrustCap — §6, the product spine', () => {
  it('caps self-reported operators at COBALT', () => {
    expect(applyTrustCap('STORM', 'SELF_REPORTED')).toBe('COBALT');
    expect(applyTrustCap('SOLAR', 'SELF_REPORTED')).toBe('COBALT');
    expect(applyTrustCap('ECLIPSE', 'SELF_REPORTED')).toBe('COBALT');
  });

  it('leaves self-reported operators below the cap untouched', () => {
    expect(applyTrustCap('ASH', 'SELF_REPORTED')).toBe('ASH');
    expect(applyTrustCap('IRON', 'SELF_REPORTED')).toBe('IRON');
    expect(applyTrustCap('COBALT', 'SELF_REPORTED')).toBe('COBALT');
  });

  it.each<VerificationTier>(['QR_CHECK_IN', 'TRAINER_CONFIRM', 'EQUIPMENT_TAP'])(
    'does not cap %s operators',
    (verification) => {
      expect(applyTrustCap('ECLIPSE', verification)).toBe('ECLIPSE');
    },
  );

  it('onboarding alone can never produce an ECLIPSE', () => {
    // A perfect self-reported calibration — every pillar maxed.
    const perfect = operator({
      pillars: pillars(100, 100, 100, 100),
      verification: 'SELF_REPORTED',
    });
    const standing = computeStanding(perfect);
    expect(standing.cps).toBe(100);
    expect(standing.uncappedTier).toBe('ECLIPSE');
    expect(standing.tier).toBe('COBALT');
    expect(standing.trustCapped).toBe(true);
  });
});

describe('xpForNextLevel — §5 curve', () => {
  it('matches round(100 * level^1.4) to the nearest 10', () => {
    expect(xpForNextLevel(1)).toBe(100);
    // 100 * 2^1.4 = 263.9 -> 260
    expect(xpForNextLevel(2)).toBe(260);
    // 100 * 10^1.4 = 2511.9 -> 2510
    expect(xpForNextLevel(10)).toBe(2510);
    // 100 * 50^1.4 = 23908.8 -> 23910
    expect(xpForNextLevel(50)).toBe(23910);
    // 100 * 99^1.4 = 62214.2 -> 62210
    expect(xpForNextLevel(99)).toBe(62210);
  });

  it('is monotonically increasing', () => {
    for (let level = 1; level < 99; level++) {
      expect(xpForNextLevel(level + 1)).toBeGreaterThan(xpForNextLevel(level));
    }
  });

  it('returns Infinity at the level cap', () => {
    expect(xpForNextLevel(100)).toBe(Infinity);
    expect(xpForNextLevel(101)).toBe(Infinity);
  });
});

describe('awardXp', () => {
  it('accumulates without levelling when under the threshold', () => {
    const result = awardXp(1, 0, 50);
    expect(result).toEqual({ level: 1, xpIntoLevel: 50, levelsGained: [] });
  });

  it('levels up and carries the remainder', () => {
    const result = awardXp(1, 0, 150);
    expect(result.level).toBe(2);
    expect(result.xpIntoLevel).toBe(50);
    expect(result.levelsGained).toEqual([2]);
  });

  it('resolves multiple levels from one award', () => {
    // L1 needs 100, L2 needs 260, L3 needs 465 -> 400 clears L1 and L2 with 40 left.
    const result = awardXp(1, 0, 400);
    expect(result.level).toBe(3);
    expect(result.xpIntoLevel).toBe(40);
    expect(result.levelsGained).toEqual([2, 3]);
  });

  it('stops at the level cap without accumulating unbounded XP', () => {
    const result = awardXp(100, 0, 999_999);
    expect(result.level).toBe(100);
    expect(result.xpIntoLevel).toBe(0);
    expect(result.levelsGained).toEqual([]);
  });

  it('rejects negative awards', () => {
    expect(() => awardXp(1, 0, -10)).toThrow();
  });
});

describe('applyStatGain — §5 weekly cap', () => {
  it('grants the full amount when under the cap', () => {
    const result = applyStatGain(pillars(50, 50, 50, 50), { strength: 1.2 }, NO_ROLLING_GAIN);
    expect(result.pillars.strength).toBe(51.2);
    expect(result.applied.strength).toBe(1.2);
    expect(result.withheld.strength).toBe(0);
    expect(result.rollingGain.strength).toBe(1.2);
  });

  it('caps a single pillar at +2.0 per rolling 7 days', () => {
    const result = applyStatGain(pillars(50, 50, 50, 50), { strength: 5 }, NO_ROLLING_GAIN);
    expect(result.applied.strength).toBe(2);
    expect(result.withheld.strength).toBe(3);
    expect(result.pillars.strength).toBe(52);
  });

  it('honours gain already banked in the window', () => {
    const banked = { ...NO_ROLLING_GAIN, strength: 1.5 };
    const result = applyStatGain(pillars(50, 50, 50, 50), { strength: 1.0 }, banked);
    expect(result.applied.strength).toBe(0.5);
    expect(result.withheld.strength).toBe(0.5);
    expect(result.rollingGain.strength).toBe(2);
  });

  it('withholds everything once the pillar cap is spent', () => {
    const spent = { ...NO_ROLLING_GAIN, endurance: 2 };
    const result = applyStatGain(pillars(50, 50, 50, 50), { endurance: 1.0 }, spent);
    expect(result.applied.endurance).toBe(0);
    expect(result.withheld.endurance).toBe(1);
    expect(result.pillars.endurance).toBe(50);
  });

  it('caps each pillar independently, so a mixed session gains on all four', () => {
    const result = applyStatGain(
      pillars(50, 50, 50, 50),
      { strength: 3, endurance: 3, consistency: 3, mobility: 3 },
      NO_ROLLING_GAIN,
    );
    expect(result.applied).toEqual({
      strength: 2,
      endurance: 2,
      consistency: 2,
      mobility: 2,
    });
  });

  it('clamps at 100 even with cap headroom left', () => {
    const result = applyStatGain(pillars(99.5, 50, 50, 50), { strength: 2 }, NO_ROLLING_GAIN);
    expect(result.pillars.strength).toBe(100);
    expect(result.applied.strength).toBe(0.5);
    expect(result.withheld.strength).toBe(1.5);
  });

  it('makes rushing a tier impossible — no tier jump is available in one week', () => {
    // Best case: every pillar gains its full 2.0 in a week.
    const start = pillars(50, 50, 50, 50);
    const after = applyStatGain(
      start,
      { strength: 99, endurance: 99, consistency: 99, mobility: 99 },
      NO_ROLLING_GAIN,
    ).pillars;
    // A maximal week moves CPS by exactly 2.0, less than the 15-point tier band.
    expect(computeCps(after) - computeCps(start)).toBe(2);
  });
});

describe('computeDecay — §5', () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

  it('does nothing inside the 21-day grace period', () => {
    const profile = operator({ lastSessionDate: '2026-01-01' });
    const result = computeDecay(profile, at('2026-01-20'));
    expect(result.isDecaying).toBe(false);
    expect(result.cpsLost).toBe(0);
    expect(result.graceDaysRemaining).toBe(2);
    expect(result.pillars).toEqual(profile.pillars);
  });

  it('does nothing on the 21st day exactly', () => {
    const profile = operator({ lastSessionDate: '2026-01-01' });
    const result = computeDecay(profile, at('2026-01-22'));
    expect(result.idleDays).toBe(21);
    expect(result.isDecaying).toBe(false);
    expect(result.cpsLost).toBe(0);
  });

  it('removes 1 CPS per day past the grace period', () => {
    // 25 idle days = 4 decaying days = -4 CPS from 50.
    const profile = operator({ lastSessionDate: '2026-01-01', careerPeakCps: 50 });
    const result = computeDecay(profile, at('2026-01-26'));
    expect(result.idleDays).toBe(25);
    expect(result.isDecaying).toBe(true);
    expect(result.cpsLost).toBe(4);
    expect(computeCps(result.pillars)).toBeCloseTo(46, 1);
  });

  it('floors at one tier below career peak', () => {
    // Peak 50 is COBALT; one tier below is IRON, whose floor is 30.
    const profile = operator({ lastSessionDate: '2026-01-01', careerPeakCps: 50 });
    const result = computeDecay(profile, at('2027-01-01'));
    expect(computeCps(result.pillars)).toBeCloseTo(30, 1);
  });

  it('never drops below ASH even for a low-peak operator', () => {
    const profile = operator({
      pillars: pillars(10, 10, 10, 10),
      lastSessionDate: '2026-01-01',
      careerPeakCps: 10,
    });
    const result = computeDecay(profile, at('2028-01-01'));
    expect(computeCps(result.pillars)).toBeGreaterThanOrEqual(0);
    expect(tierForCps(computeCps(result.pillars))).toBe('ASH');
  });

  it.each(['injury', 'illness'] as const)('pauses entirely for logged %s', (reason) => {
    const profile = operator({ lastSessionDate: '2026-01-01', pausedFor: reason });
    const result = computeDecay(profile, at('2027-01-01'));
    expect(result.isDecaying).toBe(false);
    expect(result.cpsLost).toBe(0);
    expect(result.pillars).toEqual(profile.pillars);
  });

  it('does not decay an operator who has never logged a session', () => {
    const profile = operator({ lastSessionDate: null });
    const result = computeDecay(profile, at('2030-01-01'));
    expect(result.isDecaying).toBe(false);
    expect(result.cpsLost).toBe(0);
  });

  it('computes the floor as the bottom of the tier below peak', () => {
    expect(decayFloorCps(95)).toBe(75); // ECLIPSE peak -> SOLAR floor
    expect(decayFloorCps(80)).toBe(60); // SOLAR peak   -> STORM floor
    expect(decayFloorCps(20)).toBe(0); // ASH peak     -> ASH floor
  });
});

describe('scalePillarsToCps', () => {
  it('preserves the shape of the profile', () => {
    const start = pillars(80, 40, 60, 20);
    const scaled = scalePillarsToCps(start, 30);
    expect(computeCps(scaled)).toBeCloseTo(30, 1);
    // Strength was 2x endurance before, and still is after.
    expect(scaled.strength / scaled.endurance).toBeCloseTo(2, 2);
  });

  it('never scales upward', () => {
    const start = pillars(20, 20, 20, 20);
    expect(scalePillarsToCps(start, 90)).toEqual(start);
  });
});

describe('reevaluateTier — §5', () => {
  const now = new Date('2026-02-01T12:00:00Z');

  it('does not run without a verified session in the window', () => {
    const result = reevaluateTier({
      profile: operator({ pillars: pillars(80, 80, 80, 80) }),
      sessionsInWindow: [{ verification: 'SELF_REPORTED' }, { verification: 'SELF_REPORTED' }],
      now,
    });
    expect(result.ran).toBe(false);
    expect(result.blockedReason).toBe('insufficient_verified_sessions');
    expect(result.changed).toBe(false);
  });

  it('runs on a single verified session', () => {
    const result = reevaluateTier({
      profile: operator({ pillars: pillars(80, 80, 80, 80), seasonPeakTier: 'COBALT' }),
      sessionsInWindow: [{ verification: 'QR_CHECK_IN' }],
      now,
    });
    expect(result.ran).toBe(true);
    expect(result.newTier).toBe('SOLAR');
    expect(result.direction).toBe('up');
  });

  it('reports a downward move without conflating it with decay', () => {
    const result = reevaluateTier({
      profile: operator({ pillars: pillars(32, 32, 32, 32), seasonPeakTier: 'STORM' }),
      sessionsInWindow: [{ verification: 'EQUIPMENT_TAP' }],
      now,
    });
    expect(result.direction).toBe('down');
    expect(result.newTier).toBe('IRON');
  });

  it('respects the trust cap when re-evaluating', () => {
    const result = reevaluateTier({
      profile: operator({
        pillars: pillars(95, 95, 95, 95),
        verification: 'SELF_REPORTED',
        seasonPeakTier: 'IRON',
      }),
      // A verified session exists but the profile itself is still self-reported,
      // e.g. verification was revoked after review.
      sessionsInWindow: [{ verification: 'QR_CHECK_IN' }],
      now,
    });
    expect(result.newTier).toBe('COBALT');
  });
});

describe('computeStanding', () => {
  it('exposes the uncapped tier so the UI can show what is being withheld', () => {
    const standing = computeStanding(
      operator({ pillars: pillars(70, 70, 70, 70), verification: 'SELF_REPORTED' }),
    );
    expect(standing.tier).toBe('COBALT');
    expect(standing.uncappedTier).toBe('STORM');
    expect(standing.trustCapped).toBe(true);
  });

  it('reports no cap for a verified operator', () => {
    const standing = computeStanding(
      operator({ pillars: pillars(70, 70, 70, 70), verification: 'QR_CHECK_IN' }),
    );
    expect(standing.tier).toBe('STORM');
    expect(standing.trustCapped).toBe(false);
  });
});
