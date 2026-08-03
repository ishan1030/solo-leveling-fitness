import { describe, expect, it } from 'vitest';
import {
  COMPETITIVE_CAPABILITIES,
  FREE_CAPABILITIES,
  PAID_CAPABILITIES,
  assertNoCompetitiveAdvantageIsSold,
  can,
  describeLapse,
  entitlementMatrix,
  entitlementsFor,
  type EntitlementState,
} from './entitlements';
import {
  detectAnomalies,
  generateDailyQuests,
  generateWeeklyQuest,
  allowedMuscleGroups,
  isRestDay,
  scaleTarget,
  trialForWeek,
  weakestPillar,
  type QuestGenerationContext,
} from './quests';
import {
  RAID_MAX_PARTY,
  RAID_MIN_PARTY,
  distanceMetres,
  handleDropOut,
  pairKey,
  partySizeMultiplier,
  pillarDiversityMultiplier,
  raidRewardMultiplier,
  updatePairStreak,
  validateRaid,
  type Raid,
  type RaidParticipant,
} from './raids';
import {
  MAX_RIVALS,
  canAddRival,
  formatRivalryRecord,
  isEligibleRival,
  resolveRivalWeek,
  suggestRivals,
  type Rivalry,
} from './rivals';
import {
  appendToArchive,
  PASS_TIER_COUNT,
  passTierForXp,
  rolloverSeason,
  seasonRewardsFor,
  SEASON_LENGTH_WEEKS,
} from './seasons';
import { scoreSession, workUnitsForSet, detectImplausible, type ExerciseScoringProfile } from './scoring';
import {
  FORBIDDEN_STREAK_LANGUAGE,
  INITIAL_STREAK,
  pauseStreak,
  recordSession,
} from './streaks';
import {
  VERIFIED_SESSION_COOLDOWN_HOURS,
  deriveVenueCode,
  isLeaderboardEligible,
  resolveAppeal,
  resolveProfileVerification,
  reviewProgression,
  validateCheckIn,
  windowIndexFor,
  type Venue,
} from './verification';
import type { LoggedSession, PillarScores } from './types';

// ---------------------------------------------------------------------------
// §7 — Scoring
// ---------------------------------------------------------------------------

const squatProfile: ExerciseScoringProfile = {
  id: 'back_squat',
  pillar: 'strength',
  secondaryPillar: 'mobility',
  intensityFactor: 1.2,
  limits: { maxReps: 100, maxLoadKg: 500 },
};

const runProfile: ExerciseScoringProfile = {
  id: 'run',
  pillar: 'endurance',
  secondaryPillar: null,
  intensityFactor: 1.0,
  limits: { maxDistanceM: 100_000, maxSpeedMps: 12 },
};

const lookup = (id: string) =>
  id === 'back_squat' ? squatProfile : id === 'run' ? runProfile : undefined;

function session(sets: LoggedSession['sets'], overrides: Partial<LoggedSession> = {}): LoggedSession {
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

describe('§2 FAILURE 1 — progression is driven by performance, not completion', () => {
  it('two operators completing the same movement gain different amounts', () => {
    const lighter = scoreSession(
      session([{ exerciseId: 'back_squat', kind: 'reps_load', reps: 5, loadKg: 60 }]),
      lookup,
      75,
    );
    const heavier = scoreSession(
      session([{ exerciseId: 'back_squat', kind: 'reps_load', reps: 5, loadKg: 120 }]),
      lookup,
      75,
    );

    expect(heavier.proposedPillarPoints.strength).toBeGreaterThan(
      lighter.proposedPillarPoints.strength,
    );
    expect(heavier.totalWorkUnits).toBeGreaterThan(lighter.totalWorkUnits);
  });

  it('rewards a faster run over a slower one at the same distance', () => {
    const fast = scoreSession(
      session([{ exerciseId: 'run', kind: 'distance', distanceM: 5000, durationSec: 1350 }]),
      lookup,
      70,
    );
    const slow = scoreSession(
      session([{ exerciseId: 'run', kind: 'distance', distanceM: 5000, durationSec: 2400 }]),
      lookup,
      70,
    );
    expect(fast.proposedPillarPoints.endurance).toBeGreaterThan(slow.proposedPillarPoints.endurance);
  });

  it('gives diminishing returns on volume so junk reps do not out-score hard ones', () => {
    const heavy = workUnitsForSet(
      { exerciseId: 'back_squat', kind: 'reps_load', reps: 5, loadKg: 100 },
      squatProfile,
      75,
    );
    const light = workUnitsForSet(
      { exerciseId: 'back_squat', kind: 'reps_load', reps: 25, loadKg: 20 },
      squatProfile,
      75,
    );
    // Same tonnage (500 kg), but the heavy set represents more capability.
    expect(heavy).toBeGreaterThan(light);
  });

  it('credits a secondary pillar at a reduced share', () => {
    const result = scoreSession(
      session([{ exerciseId: 'back_squat', kind: 'reps_load', reps: 5, loadKg: 100 }]),
      lookup,
      75,
    );
    expect(result.proposedPillarPoints.mobility).toBeGreaterThan(0);
    expect(result.proposedPillarPoints.mobility).toBeLessThan(
      result.proposedPillarPoints.strength,
    );
  });

  it('scores bodyweight movements against the operators own mass', () => {
    const light = workUnitsForSet(
      { exerciseId: 'pushup', kind: 'reps_bodyweight', reps: 20 },
      { ...squatProfile, id: 'pushup' },
      55,
    );
    const heavy = workUnitsForSet(
      { exerciseId: 'pushup', kind: 'reps_bodyweight', reps: 20 },
      { ...squatProfile, id: 'pushup' },
      95,
    );
    expect(heavy).toBeGreaterThan(light);
  });
});

describe('§7 — impossible numbers', () => {
  it('flags a load above the movement limit without discarding the set', () => {
    const result = scoreSession(
      session([{ exerciseId: 'back_squat', kind: 'reps_load', reps: 5, loadKg: 900 }]),
      lookup,
      75,
    );
    expect(result.flaggedSetCount).toBe(1);
    expect(result.sets[0]!.excluded).toBe(true);
    expect(result.proposedPillarPoints.strength).toBe(0);
    // The set itself is still present in the log.
    expect(result.sets[0]!.set.loadKg).toBe(900);
  });

  it('flags a load above 6x bodyweight even when under the movement limit', () => {
    const findings = detectImplausible(
      { exerciseId: 'back_squat', kind: 'reps_load', reps: 1, loadKg: 400 },
      squatProfile,
      50,
    );
    expect(findings.map((f) => f.code)).toContain('load_exceeds_world_record_ratio');
  });

  it('flags an impossible pace', () => {
    const findings = detectImplausible(
      { exerciseId: 'run', kind: 'distance', distanceM: 42195, durationSec: 600 },
      runProfile,
      70,
    );
    expect(findings.map((f) => f.code)).toContain('speed_exceeds_limit');
  });

  it('flags negative values', () => {
    const findings = detectImplausible(
      { exerciseId: 'back_squat', kind: 'reps_load', reps: -5, loadKg: 60 },
      squatProfile,
      75,
    );
    expect(findings.map((f) => f.code)).toContain('negative_value');
  });

  it('writes non-accusatory copy that assumes a typo', () => {
    const findings = detectImplausible(
      { exerciseId: 'back_squat', kind: 'reps_load', reps: 5, loadKg: 900 },
      squatProfile,
      75,
    );
    for (const finding of findings) {
      expect(finding.message).not.toMatch(/cheat|lying|liar|fake|fraud|banned/i);
    }
  });

  it('accepts a plausible heavy single', () => {
    const result = scoreSession(
      session([{ exerciseId: 'back_squat', kind: 'reps_load', reps: 1, loadKg: 180 }]),
      lookup,
      90,
    );
    expect(result.flaggedSetCount).toBe(0);
    expect(result.proposedPillarPoints.strength).toBeGreaterThan(0);
  });

  it('keeps but does not score an unknown exercise', () => {
    const result = scoreSession(
      session([{ exerciseId: 'mystery_move', kind: 'reps_load', reps: 5, loadKg: 60 }]),
      lookup,
      75,
    );
    expect(result.sets).toHaveLength(1);
    expect(result.sets[0]!.excluded).toBe(true);
    expect(result.proposedPillarPoints.strength).toBe(0);
  });
});

describe('§15 / §21 — aborted-for-injury session', () => {
  const completedSets = [
    { exerciseId: 'back_squat', kind: 'reps_load' as const, reps: 5, loadKg: 100 },
    { exerciseId: 'back_squat', kind: 'reps_load' as const, reps: 5, loadKg: 100 },
  ];

  it('is flagged as aborted so the summary can lead with recovery', () => {
    const result = scoreSession(
      session(completedSets, { abortedForInjury: true }),
      lookup,
      75,
    );
    expect(result.scoredAsAborted).toBe(true);
  });

  it('still credits every set completed before stopping — §21 forbids penalising injury', () => {
    const aborted = scoreSession(
      session(completedSets, { abortedForInjury: true }),
      lookup,
      75,
    );
    const normal = scoreSession(session(completedSets), lookup, 75);

    // Losing credit for work already done because the next set hurt would be a
    // penalty for getting injured.
    expect(aborted.proposedPillarPoints).toEqual(normal.proposedPillarPoints);
    expect(aborted.xp).toBe(normal.xp);
    expect(aborted.totalWorkUnits).toBe(normal.totalWorkUnits);
    expect(aborted.xp).toBeGreaterThan(0);
  });

  it('scores nothing when the operator stopped before completing any set', () => {
    const result = scoreSession(session([], { abortedForInjury: true }), lookup, 75);
    expect(result.xp).toBe(0);
    expect(result.proposedPillarPoints).toEqual({
      strength: 0,
      endurance: 0,
      consistency: 0,
      mobility: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// §8 — Quests
// ---------------------------------------------------------------------------

const pillars = (s: number, e: number, c: number, m: number): PillarScores => ({
  strength: s,
  endurance: e,
  consistency: c,
  mobility: m,
});

function questCtx(overrides: Partial<QuestGenerationContext> = {}): QuestGenerationContext {
  return {
    operatorId: 'op1',
    pillars: pillars(60, 40, 55, 30),
    availableDays: [1, 2, 3, 4, 5],
    restDays: [0, 6],
    previousDayMuscleGroups: [],
    loggedCapacity: {
      medianRepsPerSession: 60,
      medianVolumeKgPerSession: 4000,
      medianDistanceMPerSession: 4000,
    },
    medicalStopActive: false,
    paused: false,
    // 2026-03-04 is a Wednesday.
    now: new Date('2026-03-04T08:00:00Z'),
    ...overrides,
  };
}

describe('§8 — quest generation rules', () => {
  it('targets the weakest pillar', () => {
    expect(weakestPillar(pillars(60, 40, 55, 30))).toBe('mobility');
    const set = generateDailyQuests(questCtx());
    expect(set.primary?.pillar).toBe('mobility');
  });

  it('emits 1 primary and 2 optionals', () => {
    const set = generateDailyQuests(questCtx());
    expect(set.primary).not.toBeNull();
    expect(set.optional).toHaveLength(2);
  });

  it('awards XP on the primary and pillar points on the optionals', () => {
    const set = generateDailyQuests(questCtx());
    expect(set.primary!.rewardXp).toBeGreaterThan(0);
    expect(set.primary!.rewardPillarPoints).toBe(0);
    for (const optional of set.optional) {
      expect(optional.rewardXp).toBe(0);
      expect(optional.rewardPillarPoints).toBeGreaterThan(0);
    }
  });

  it('never schedules a quest on a declared rest day', () => {
    // 2026-03-08 is a Sunday, which is a declared rest day.
    const set = generateDailyQuests(questCtx({ now: new Date('2026-03-08T08:00:00Z') }));
    expect(set.primary).toBeNull();
    expect(set.optional).toEqual([]);
    expect(set.suppressedReason).toBe('rest_day');
  });

  it('identifies rest days correctly', () => {
    expect(isRestDay(new Date('2026-03-08T08:00:00Z'), [0, 6])).toBe(true);
    expect(isRestDay(new Date('2026-03-04T08:00:00Z'), [0, 6])).toBe(false);
  });

  it('never repeats a muscle group on consecutive days', () => {
    const filtered = allowedMuscleGroups(['chest', 'back', 'legs'], ['chest', 'legs']);
    expect(filtered).toEqual(['back']);
  });

  it('falls back to full_body rather than emitting an empty board', () => {
    const filtered = allowedMuscleGroups(['chest'], ['chest']);
    expect(filtered).toEqual(['full_body']);
  });

  it('respects the consecutive-day rule end to end', () => {
    const set = generateDailyQuests(
      questCtx({
        pillars: pillars(30, 60, 55, 60),
        previousDayMuscleGroups: ['chest', 'back', 'legs', 'shoulders'],
      }),
    );
    expect(set.primary!.muscleGroup).toBe('arms');
  });

  it('scales to logged capacity, not to tier', () => {
    const modest = generateDailyQuests(
      questCtx({
        pillars: pillars(30, 90, 90, 90),
        loggedCapacity: {
          medianRepsPerSession: 20,
          medianVolumeKgPerSession: 1000,
          medianDistanceMPerSession: 1000,
        },
      }),
    );
    const capable = generateDailyQuests(
      questCtx({
        pillars: pillars(30, 90, 90, 90),
        loggedCapacity: {
          medianRepsPerSession: 200,
          medianVolumeKgPerSession: 12000,
          medianDistanceMPerSession: 12000,
        },
      }),
    );
    // Identical pillar scores, different logged capacity, different targets.
    expect(capable.primary!.target).toBeGreaterThan(modest.primary!.target);
  });

  it('never asks for less than the floor', () => {
    expect(scaleTarget(0, 'DAILY_PRIMARY', 15)).toBe(15);
  });

  it('suppresses everything in the §21 medical-stop state', () => {
    const set = generateDailyQuests(questCtx({ medicalStopActive: true }));
    expect(set.primary).toBeNull();
    expect(set.suppressedReason).toBe('medical_stop');
    expect(generateWeeklyQuest(questCtx({ medicalStopActive: true }))).toBeNull();
  });

  it('suppresses everything during a §16 injury pause', () => {
    const set = generateDailyQuests(questCtx({ paused: true }));
    expect(set.suppressedReason).toBe('paused');
  });

  it('generates a weekly cumulative quest with a larger target', () => {
    const daily = generateDailyQuests(questCtx());
    const weekly = generateWeeklyQuest(questCtx());
    expect(weekly!.kind).toBe('WEEKLY');
    expect(weekly!.target).toBeGreaterThan(daily.primary!.target);
  });

  it('writes a real objective for every quest — no placeholders', () => {
    const set = generateDailyQuests(questCtx());
    for (const quest of [set.primary!, ...set.optional]) {
      expect(quest.objective.length).toBeGreaterThan(10);
      expect(quest.objective).not.toMatch(/TODO|placeholder|\{\{/i);
    }
  });
});

describe('§8 — anomalies', () => {
  const noSignals = {
    sessionsBefore6amLast30Days: 0,
    distinctVenuesLast30Days: 0,
    consecutiveRivalWeeksWon: 0,
    scheduledSessionsHitThisWeek: 0,
    scheduledSessionsThisWeek: 0,
    consecutiveTrainingDays: 0,
    alreadyDiscovered: [],
  };

  it('unlocks DAWN_PATROL after five early sessions', () => {
    const found = detectAnomalies({ ...noSignals, sessionsBefore6amLast30Days: 5 });
    expect(found.map((a) => a.trigger)).toContain('DAWN_PATROL');
  });

  it('unlocks NOMAD after three venues in a month', () => {
    const found = detectAnomalies({ ...noSignals, distinctVenuesLast30Days: 3 });
    expect(found.map((a) => a.trigger)).toContain('NOMAD');
  });

  it('unlocks a rival streak anomaly', () => {
    const found = detectAnomalies({ ...noSignals, consecutiveRivalWeeksWon: 3 });
    expect(found.map((a) => a.trigger)).toContain('RIVALRY_STREAK');
  });

  it('does not re-award an already discovered anomaly', () => {
    const found = detectAnomalies({
      ...noSignals,
      sessionsBefore6amLast30Days: 10,
      alreadyDiscovered: ['DAWN_PATROL'],
    });
    expect(found.map((a) => a.trigger)).not.toContain('DAWN_PATROL');
  });

  it('finds nothing for an ordinary week', () => {
    expect(detectAnomalies({ ...noSignals, consecutiveTrainingDays: 3 })).toEqual([]);
  });

  it('does not award IRON_WEEK when nothing was scheduled', () => {
    const found = detectAnomalies({
      ...noSignals,
      scheduledSessionsThisWeek: 0,
      scheduledSessionsHitThisWeek: 0,
    });
    expect(found.map((a) => a.trigger)).not.toContain('IRON_WEEK');
  });
});

describe('§8 — trials', () => {
  it('rotates deterministically so all operators see the same trial', () => {
    const now = new Date('2026-03-04T00:00:00Z');
    expect(trialForWeek(0, now).title).toBe(trialForWeek(0, now).title);
    expect(trialForWeek(0, now).title).not.toBe(trialForWeek(1, now).title);
  });

  it('always carries a time limit — the clock is the point', () => {
    for (let week = 0; week < 8; week++) {
      expect(trialForWeek(week, new Date()).timeLimitSec).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// §9 — Raids
// ---------------------------------------------------------------------------

function participant(overrides: Partial<RaidParticipant> = {}): RaidParticipant {
  return {
    operatorId: 'op1',
    contributingPillar: 'strength',
    verification: 'QR_CHECK_IN',
    loggedPortion: true,
    sessionStartedAt: '2026-03-04T09:00:00Z',
    location: null,
    droppedOut: false,
    ...overrides,
  };
}

function raid(overrides: Partial<Raid> = {}): Raid {
  return {
    id: 'r1',
    hostOperatorId: 'op1',
    status: 'ACTIVE',
    participants: [
      participant({ operatorId: 'op1', contributingPillar: 'strength' }),
      participant({ operatorId: 'op2', contributingPillar: 'endurance' }),
    ],
    isBossRaid: false,
    openedAt: '2026-03-04T08:30:00Z',
    requiresProximity: false,
    ...overrides,
  };
}

describe('§9 — raid reward scaling', () => {
  it('scales with party size', () => {
    expect(partySizeMultiplier(2)).toBeLessThan(partySizeMultiplier(4));
    expect(partySizeMultiplier(4)).toBeLessThan(partySizeMultiplier(6));
  });

  it('scores a solo "party" at zero', () => {
    expect(partySizeMultiplier(1)).toBe(0);
  });

  it('caps at the six-operator maximum', () => {
    expect(partySizeMultiplier(6)).toBe(partySizeMultiplier(10));
  });

  it('rewards a runner plus a lifter above two lifters — §9 verbatim', () => {
    const mixed = raid({
      participants: [
        participant({ operatorId: 'a', contributingPillar: 'strength' }),
        participant({ operatorId: 'b', contributingPillar: 'endurance' }),
      ],
    });
    const matched = raid({
      participants: [
        participant({ operatorId: 'a', contributingPillar: 'strength' }),
        participant({ operatorId: 'b', contributingPillar: 'strength' }),
      ],
    });
    expect(raidRewardMultiplier(mixed)).toBeGreaterThan(raidRewardMultiplier(matched));
  });

  it('gives a matched party the neutral diversity multiplier', () => {
    expect(
      pillarDiversityMultiplier([
        participant({ operatorId: 'a', contributingPillar: 'legs' as never }),
        participant({ operatorId: 'b', contributingPillar: 'legs' as never }),
      ]),
    ).toBe(1);
  });

  it('pays more for a boss raid', () => {
    const normal = raid();
    const boss = raid({ isBossRaid: true });
    expect(raidRewardMultiplier(boss)).toBeGreaterThan(raidRewardMultiplier(normal));
  });
});

describe('§9 — raid anti-abuse', () => {
  const now = new Date('2026-03-04T10:00:00Z');

  it('accepts a clean raid', () => {
    const result = validateRaid({ raid: raid(), lastRaidByPair: {}, now });
    expect(result.valid).toBe(true);
  });

  it('rejects a party below the minimum', () => {
    const result = validateRaid({
      raid: raid({ participants: [participant()] }),
      lastRaidByPair: {},
      now,
    });
    expect(result.rejections.map((r) => r.code)).toContain('party_too_small');
  });

  it('rejects a party above the maximum', () => {
    const many = Array.from({ length: RAID_MAX_PARTY + 1 }, (_, i) =>
      participant({ operatorId: `op${i}` }),
    );
    const result = validateRaid({ raid: raid({ participants: many }), lastRaidByPair: {}, now });
    expect(result.rejections.map((r) => r.code)).toContain('party_too_large');
  });

  it('refuses to complete when one participant has not logged — nobody gets carried', () => {
    const result = validateRaid({
      raid: raid({
        participants: [
          participant({ operatorId: 'op1' }),
          participant({ operatorId: 'op2', loggedPortion: false }),
        ],
      }),
      lastRaidByPair: {},
      now,
    });
    expect(result.valid).toBe(false);
    const rejection = result.rejections.find((r) => r.code === 'portion_not_logged');
    expect(rejection?.operatorId).toBe('op2');
  });

  it('rejects sessions outside the shared window', () => {
    const result = validateRaid({
      raid: raid({
        participants: [
          participant({ operatorId: 'op1', sessionStartedAt: '2026-03-04T06:00:00Z' }),
          participant({ operatorId: 'op2', sessionStartedAt: '2026-03-04T14:00:00Z' }),
        ],
      }),
      lastRaidByPair: {},
      now,
    });
    expect(result.rejections.map((r) => r.code)).toContain('outside_shared_window');
  });

  it('rejects a participant outside the proximity radius', () => {
    const result = validateRaid({
      raid: raid({
        requiresProximity: true,
        participants: [
          participant({ operatorId: 'op1', location: { lat: 27.6766, lon: 84.4344 } }),
          // ~5 km away in Bharatpur.
          participant({ operatorId: 'op2', location: { lat: 27.7200, lon: 84.4344 } }),
        ],
      }),
      lastRaidByPair: {},
      now,
    });
    expect(result.rejections.map((r) => r.code)).toContain('outside_proximity');
  });

  it('accepts participants inside the proximity radius', () => {
    const result = validateRaid({
      raid: raid({
        requiresProximity: true,
        participants: [
          participant({ operatorId: 'op1', location: { lat: 27.6766, lon: 84.4344 } }),
          participant({ operatorId: 'op2', location: { lat: 27.6767, lon: 84.4345 } }),
        ],
      }),
      lastRaidByPair: {},
      now,
    });
    expect(result.valid).toBe(true);
  });

  it('enforces the pair cooldown', () => {
    const result = validateRaid({
      raid: raid(),
      lastRaidByPair: { [pairKey('op1', 'op2')]: '2026-03-04T04:00:00Z' },
      now,
    });
    expect(result.rejections.map((r) => r.code)).toContain('pair_cooldown_active');
  });

  it('rejects an unverified participant', () => {
    const result = validateRaid({
      raid: raid({
        participants: [
          participant({ operatorId: 'op1' }),
          participant({ operatorId: 'op2', verification: 'SELF_REPORTED' }),
        ],
      }),
      lastRaidByPair: {},
      now,
    });
    expect(result.rejections.map((r) => r.code)).toContain('unverified_participant');
  });

  it('measures distance sanely', () => {
    expect(distanceMetres({ lat: 27.6766, lon: 84.4344 }, { lat: 27.6766, lon: 84.4344 })).toBe(0);
    expect(
      distanceMetres({ lat: 27.6766, lon: 84.4344 }, { lat: 27.6866, lon: 84.4344 }),
    ).toBeGreaterThan(1000);
  });
});

describe('§9 — drop-outs', () => {
  it('continues at a lower multiplier when enough operators remain', () => {
    const big = raid({
      participants: [
        participant({ operatorId: 'a', contributingPillar: 'strength' }),
        participant({ operatorId: 'b', contributingPillar: 'endurance' }),
        participant({ operatorId: 'c', contributingPillar: 'mobility' }),
      ],
    });
    const result = handleDropOut(big, 'c');
    expect(result.outcome).toBe('continues');
    expect(result.newMultiplier).toBeLessThan(raidRewardMultiplier(big));
    expect(result.raid.status).toBe('ACTIVE');
  });

  it('abandons without penalty when the party falls below two', () => {
    const result = handleDropOut(raid(), 'op2');
    expect(result.outcome).toBe('abandoned');
    expect(result.raid.status).toBe('ABANDONED');
    expect(result.refundedToSoloCredit).toContain('op1');
    expect(result.noticeCopy).toMatch(/no penalty/i);
  });

  it('never blames the operator who left', () => {
    const result = handleDropOut(raid(), 'op2');
    expect(result.noticeCopy).not.toMatch(/abandoned you|let.*down|quit|bailed/i);
  });

  it('needs at least the minimum party to continue', () => {
    expect(RAID_MIN_PARTY).toBe(2);
  });
});

describe('§9 — pair streaks', () => {
  it('starts at one', () => {
    const streak = updatePairStreak(undefined, 'a|b', new Date('2026-03-01T00:00:00Z'));
    expect(streak.count).toBe(1);
  });

  it('extends inside the grace window', () => {
    const first = updatePairStreak(undefined, 'a|b', new Date('2026-03-01T00:00:00Z'));
    const second = updatePairStreak(first, 'a|b', new Date('2026-03-06T00:00:00Z'));
    expect(second.count).toBe(2);
  });

  it('resets after a long gap', () => {
    const first = updatePairStreak(undefined, 'a|b', new Date('2026-03-01T00:00:00Z'));
    const second = updatePairStreak(first, 'a|b', new Date('2026-04-01T00:00:00Z'));
    expect(second.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §10 — Verification
// ---------------------------------------------------------------------------

const venue: Venue = {
  id: 'v1',
  name: 'Bharatpur Iron',
  cityId: 'bharatpur',
  lat: 27.6766,
  lon: 84.4344,
  certified: true,
  codeSecret: 'secret-abc',
};

describe('§10 — QR check-in', () => {
  const now = new Date('2026-03-04T10:00:00Z');
  const validCode = () => deriveVenueCode(venue.codeSecret, windowIndexFor(now));

  it('accepts a current code inside the geofence', () => {
    const result = validateCheckIn({
      operatorId: 'op1',
      venue,
      submittedCode: validCode(),
      operatorLocation: { lat: 27.6766, lon: 84.4344 },
      lastVerifiedSessionAt: null,
      now,
    });
    expect(result.accepted).toBe(true);
    expect(result.grantedTier).toBe('QR_CHECK_IN');
  });

  it('rotates the code every 60 seconds', () => {
    const w1 = windowIndexFor(new Date('2026-03-04T10:00:00Z'));
    const w2 = windowIndexFor(new Date('2026-03-04T10:01:00Z'));
    expect(w2).toBe(w1 + 1);
    expect(deriveVenueCode(venue.codeSecret, w1)).not.toBe(deriveVenueCode(venue.codeSecret, w2));
  });

  it('rejects a stale code', () => {
    const stale = deriveVenueCode(venue.codeSecret, windowIndexFor(now) - 20);
    const result = validateCheckIn({
      operatorId: 'op1',
      venue,
      submittedCode: stale,
      operatorLocation: { lat: 27.6766, lon: 84.4344 },
      lastVerifiedSessionAt: null,
      now,
    });
    expect(result.accepted).toBe(false);
    expect(result.rejection).toBe('code_expired');
  });

  it('rejects a valid code scanned from outside the geofence', () => {
    const result = validateCheckIn({
      operatorId: 'op1',
      venue,
      submittedCode: validCode(),
      // ~5 km away — a screenshotted code sent across town.
      operatorLocation: { lat: 27.7200, lon: 84.4344 },
      lastVerifiedSessionAt: null,
      now,
    });
    expect(result.accepted).toBe(false);
    expect(result.rejection).toBe('outside_geofence');
  });

  it('enforces one verified session per 4 hours', () => {
    const result = validateCheckIn({
      operatorId: 'op1',
      venue,
      submittedCode: validCode(),
      operatorLocation: { lat: 27.6766, lon: 84.4344 },
      lastVerifiedSessionAt: '2026-03-04T08:00:00Z',
      now,
    });
    expect(result.accepted).toBe(false);
    expect(result.rejection).toBe('cooldown_active');
  });

  it('allows a check-in once the cooldown has passed', () => {
    const result = validateCheckIn({
      operatorId: 'op1',
      venue,
      submittedCode: validCode(),
      operatorLocation: { lat: 27.6766, lon: 84.4344 },
      lastVerifiedSessionAt: '2026-03-04T05:00:00Z',
      now,
    });
    expect(result.accepted).toBe(true);
    expect(VERIFIED_SESSION_COOLDOWN_HOURS).toBe(4);
  });

  it('tells a cooling-down operator their session still logs', () => {
    const result = validateCheckIn({
      operatorId: 'op1',
      venue,
      submittedCode: validCode(),
      operatorLocation: { lat: 27.6766, lon: 84.4344 },
      lastVerifiedSessionAt: '2026-03-04T09:00:00Z',
      now,
    });
    expect(result.message).toMatch(/logs normally/i);
  });

  it('refuses an uncertified venue without blocking the session', () => {
    const result = validateCheckIn({
      operatorId: 'op1',
      venue: { ...venue, certified: false },
      submittedCode: validCode(),
      operatorLocation: { lat: 27.6766, lon: 84.4344 },
      lastVerifiedSessionAt: null,
      now,
    });
    expect(result.accepted).toBe(false);
    expect(result.message).toMatch(/still logs/i);
  });
});

describe('§10 — leaderboard eligibility', () => {
  it('hides unverified operators from boards above COBALT', () => {
    expect(isLeaderboardEligible('STORM', 'SELF_REPORTED')).toBe(false);
    expect(isLeaderboardEligible('ECLIPSE', 'SELF_REPORTED')).toBe(false);
  });

  it('shows verified operators at every tier', () => {
    expect(isLeaderboardEligible('ECLIPSE', 'QR_CHECK_IN')).toBe(true);
    expect(isLeaderboardEligible('SOLAR', 'EQUIPMENT_TAP')).toBe(true);
  });

  it('leaves lower boards open to everyone', () => {
    expect(isLeaderboardEligible('COBALT', 'SELF_REPORTED')).toBe(true);
    expect(isLeaderboardEligible('ASH', 'SELF_REPORTED')).toBe(true);
  });
});

describe('§10 — implausible progression review', () => {
  it('flags progression that exceeds the weekly cap', () => {
    const flag = reviewProgression({
      cpsDelta: 12,
      windowDays: 7,
      verifiedSessionCount: 3,
      totalSessionCount: 5,
    });
    expect(flag.flagged).toBe(true);
    expect(flag.status).toBe('FLAGGED_FOR_REVIEW');
  });

  it('never auto-punishes', () => {
    const flag = reviewProgression({
      cpsDelta: 50,
      windowDays: 7,
      verifiedSessionCount: 0,
      totalSessionCount: 9,
    });
    expect(flag.autoPunished).toBe(false);
  });

  it('tells the operator their rank and streak are untouched', () => {
    const flag = reviewProgression({
      cpsDelta: 20,
      windowDays: 7,
      verifiedSessionCount: 0,
      totalSessionCount: 4,
    });
    expect(flag.operatorCopy).toMatch(/untouched/i);
  });

  it('clears normal progression', () => {
    const flag = reviewProgression({
      cpsDelta: 1.8,
      windowDays: 7,
      verifiedSessionCount: 2,
      totalSessionCount: 4,
    });
    expect(flag.flagged).toBe(false);
    expect(flag.status).toBe('CLEAR');
  });

  it('flags a fast climb built entirely on self-reports', () => {
    const flag = reviewProgression({
      cpsDelta: 8,
      windowDays: 28,
      verifiedSessionCount: 0,
      totalSessionCount: 12,
    });
    expect(flag.flagged).toBe(true);
  });
});

describe('§10 — appeals', () => {
  const appeal = {
    id: 'ap1',
    operatorId: 'op1',
    flagReasons: ['too fast'],
    operatorStatement: 'I recalibrated after an injury layoff.',
    status: 'IN_REVIEW' as const,
    reviewedByHumanId: null,
    submittedAt: '2026-03-01T00:00:00Z',
    resolvedAt: null,
  };

  it('requires a human reviewer', () => {
    expect(() => resolveAppeal(appeal, 'OVERTURNED', '', new Date())).toThrow(/human/i);
  });

  it('records the reviewer on resolution', () => {
    const resolved = resolveAppeal(appeal, 'OVERTURNED', 'staff_7', new Date('2026-03-02T00:00:00Z'));
    expect(resolved.status).toBe('OVERTURNED');
    expect(resolved.reviewedByHumanId).toBe('staff_7');
    expect(resolved.resolvedAt).not.toBeNull();
  });
});

describe('§10 — profile verification decay', () => {
  const now = new Date('2026-03-04T00:00:00Z');

  it('takes the highest recent verification tier', () => {
    expect(
      resolveProfileVerification(
        [
          { verification: 'QR_CHECK_IN', startedAt: '2026-03-01T00:00:00Z' },
          { verification: 'EQUIPMENT_TAP', startedAt: '2026-03-02T00:00:00Z' },
        ],
        now,
      ),
    ).toBe('EQUIPMENT_TAP');
  });

  it('falls back to self-reported when verification lapses', () => {
    expect(
      resolveProfileVerification(
        [{ verification: 'EQUIPMENT_TAP', startedAt: '2025-01-01T00:00:00Z' }],
        now,
      ),
    ).toBe('SELF_REPORTED');
  });

  it('returns self-reported for an operator with no sessions', () => {
    expect(resolveProfileVerification([], now)).toBe('SELF_REPORTED');
  });
});

// ---------------------------------------------------------------------------
// §11 — Rivals
// ---------------------------------------------------------------------------

describe('§11 — rivals', () => {
  const candidates = [
    { operatorId: 'a', displayName: 'A', tier: 'COBALT' as const, cityId: 'bharatpur', venueId: 'v1', acceptingRivals: true },
    { operatorId: 'b', displayName: 'B', tier: 'STORM' as const, cityId: 'bharatpur', venueId: 'v2', acceptingRivals: true },
    { operatorId: 'c', displayName: 'C', tier: 'ECLIPSE' as const, cityId: 'kathmandu', venueId: 'v3', acceptingRivals: true },
    { operatorId: 'd', displayName: 'D', tier: 'COBALT' as const, cityId: 'kathmandu', venueId: 'v4', acceptingRivals: false },
  ];

  it('restricts rivals to ±1 tier', () => {
    expect(isEligibleRival('COBALT', candidates[0]!)).toBe(true);
    expect(isEligibleRival('COBALT', candidates[1]!)).toBe(true);
    expect(isEligibleRival('COBALT', candidates[2]!)).toBe(false);
  });

  it('respects an opt-out', () => {
    expect(isEligibleRival('COBALT', candidates[3]!)).toBe(false);
  });

  it('caps at three rivals', () => {
    expect(MAX_RIVALS).toBe(3);
    expect(canAddRival(['a', 'b'])).toBe(true);
    expect(canAddRival(['a', 'b', 'c'])).toBe(false);
  });

  it('ranks same-venue candidates first, then same-city', () => {
    const suggestions = suggestRivals({
      operatorId: 'me',
      operatorTier: 'COBALT',
      operatorCityId: 'bharatpur',
      operatorVenueId: 'v1',
      currentRivalIds: [],
      candidates,
    });
    expect(suggestions[0]!.operatorId).toBe('a');
    expect(suggestions[1]!.operatorId).toBe('b');
  });

  it('returns nothing when the rival slots are full', () => {
    const suggestions = suggestRivals({
      operatorId: 'me',
      operatorTier: 'COBALT',
      operatorCityId: 'bharatpur',
      operatorVenueId: 'v1',
      currentRivalIds: ['x', 'y', 'z'],
      candidates,
    });
    expect(suggestions).toEqual([]);
  });

  const rivalry: Rivalry = {
    id: 'rv1',
    operatorId: 'me',
    rivalOperatorId: 'them',
    pillar: 'strength',
    status: 'ACTIVE',
    record: { wins: 2, losses: 1, draws: 0 },
    currentWeekStartedAt: '2026-03-02T00:00:00Z',
  };

  it('awards ladder points to the winner only', () => {
    const result = resolveRivalWeek(rivalry, 1.8, 1.2, { operator: 'Me', rival: 'Them' });
    expect(result.outcome).toBe('operator');
    expect(result.ladderPointsToOperator).toBeGreaterThan(0);
    expect(result.ladderPointsToRival).toBe(0);
    expect(result.updatedRecord.wins).toBe(3);
  });

  it('splits points on a draw rather than voiding them', () => {
    const result = resolveRivalWeek(rivalry, 1.5, 1.5, { operator: 'Me', rival: 'Them' });
    expect(result.outcome).toBe('draw');
    expect(result.ladderPointsToOperator).toBe(result.ladderPointsToRival);
    expect(result.ladderPointsToOperator).toBeGreaterThan(0);
    expect(result.updatedRecord.draws).toBe(1);
  });

  it('records a loss without shaming copy', () => {
    const result = resolveRivalWeek(rivalry, 0.4, 1.9, { operator: 'Me', rival: 'Them' });
    expect(result.outcome).toBe('rival');
    expect(result.updatedRecord.losses).toBe(2);
    expect(result.summary).not.toMatch(/pathetic|weak|embarrass|loser/i);
  });

  it('formats a persistent record for the profile', () => {
    expect(formatRivalryRecord({ wins: 5, losses: 2, draws: 1 })).toBe('5W · 2L · 1D');
  });
});

// ---------------------------------------------------------------------------
// §17 — Seasons
// ---------------------------------------------------------------------------

describe('§17 — seasons', () => {
  it('is exactly 13 weeks', () => {
    expect(SEASON_LENGTH_WEEKS).toBe(13);
  });

  const rolloverInput = {
    level: 42,
    xpIntoLevel: 300,
    pillars: { strength: 70, endurance: 65, consistency: 80, mobility: 55 },
    achievementIds: ['ach_1', 'ach_2'],
    titleIds: ['title_s1_top100'],
    guildId: 'g1',
    rivalryRecords: [{ rivalOperatorId: 'them', wins: 5, losses: 3, draws: 1 }],
    seasonPeakTier: 'SOLAR' as const,
    currentTier: 'SOLAR' as const,
  };

  it('resets ladder points and seasonal progress', () => {
    const carry = rolloverSeason(rolloverInput);
    expect(carry.reset.ladderPoints).toBe(0);
    expect(carry.reset.seasonLeaderboardPosition).toBeNull();
    expect(carry.reset.seasonalQuestProgress).toEqual({});
  });

  it('persists level, XP, pillars, achievements, titles, guild and rivalries', () => {
    const carry = rolloverSeason(rolloverInput);
    expect(carry.persists.level).toBe(42);
    expect(carry.persists.xpIntoLevel).toBe(300);
    expect(carry.persists.pillars.strength).toBe(70);
    expect(carry.persists.achievementIds).toEqual(['ach_1', 'ach_2']);
    expect(carry.persists.titleIds).toEqual(['title_s1_top100']);
    expect(carry.persists.guildId).toBe('g1');
    expect(carry.persists.rivalryRecords[0]!.wins).toBe(5);
  });

  it('floors the new season at one tier below season peak', () => {
    const carry = rolloverSeason(rolloverInput);
    expect(carry.soft.startingTier).toBe('STORM');
  });

  it('never demotes an operator already below the floor', () => {
    const carry = rolloverSeason({ ...rolloverInput, currentTier: 'ASH', seasonPeakTier: 'IRON' });
    expect(carry.soft.startingTier).toBe('ASH');
  });

  it('does not drop below ASH', () => {
    const carry = rolloverSeason({ ...rolloverInput, currentTier: 'ASH', seasonPeakTier: 'ASH' });
    expect(carry.soft.startingTier).toBe('ASH');
  });

  it('awards a permanent champion mark to first place only', () => {
    expect(seasonRewardsFor(1, 3, false).map((r) => r.kind)).toContain('CHAMPION_MARK');
    expect(seasonRewardsFor(2, 3, false).map((r) => r.kind)).not.toContain('CHAMPION_MARK');
  });

  it('awards a title to the top 100', () => {
    expect(seasonRewardsFor(100, 3, false).map((r) => r.kind)).toContain('TITLE');
    expect(seasonRewardsFor(101, 3, false)).toEqual([]);
  });

  it('earns pass tiers from quest XP only', () => {
    expect(passTierForXp(0)).toBe(0);
    expect(passTierForXp(2500)).toBe(2);
    expect(passTierForXp(999_999)).toBe(PASS_TIER_COUNT);
  });

  it('keeps the archive append-only and ordered', () => {
    const entry = (n: number) => ({
      seasonNumber: n,
      endedAt: `2026-0${n}-01T00:00:00Z`,
      tier: 'STORM' as const,
      level: 40,
      cps: 62,
      placement: 15,
      titleIds: [],
    });
    let archive = appendToArchive([], entry(2));
    archive = appendToArchive(archive, entry(1));
    archive = appendToArchive(archive, entry(1));
    expect(archive.map((e) => e.seasonNumber)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// §18 — The fairness rule
// ---------------------------------------------------------------------------

describe('§18 — fairness rule, enforced at the architecture level', () => {
  const now = new Date('2026-03-04T00:00:00Z');
  const free: EntitlementState = { subscription: 'NONE', ownsSeasonPass: false, trialEndsAt: null };
  const premium: EntitlementState = { subscription: 'ACTIVE', ownsSeasonPass: true, trialEndsAt: null };

  it('sells no competitive capability', () => {
    expect(() => assertNoCompetitiveAdvantageIsSold()).not.toThrow();
  });

  it('keeps the competitive and paid capability sets disjoint', () => {
    const paid = new Set<string>(PAID_CAPABILITIES);
    for (const competitive of COMPETITIVE_CAPABILITIES) {
      expect(paid.has(competitive), `${competitive} must not be purchasable`).toBe(false);
    }
  });

  it('grants a paying operator no capability that moves the ladder', () => {
    const granted = entitlementsFor(premium, now);
    for (const competitive of COMPETITIVE_CAPABILITIES) {
      expect(granted.has(competitive as never)).toBe(false);
    }
  });

  it('gives free operators the entire competitive game', () => {
    const granted = entitlementsFor(free, now);
    for (const capability of ['RIVALS', 'GUILDS', 'RAIDS', 'RANKINGS', 'CORE_QUESTS', 'SEASONS'] as const) {
      expect(granted.has(capability), capability).toBe(true);
    }
  });

  it('gates only voice, analytics and cosmetics behind premium', () => {
    const freeGrants = entitlementsFor(free, now);
    expect(freeGrants.has('VOICE_COACH')).toBe(false);
    expect(freeGrants.has('DEEP_ANALYTICS')).toBe(false);
    expect(entitlementsFor(premium, now).has('VOICE_COACH')).toBe(true);
  });

  it('honours an active trial and expires it', () => {
    const trialing: EntitlementState = {
      subscription: 'TRIAL',
      ownsSeasonPass: false,
      trialEndsAt: '2026-03-10T00:00:00Z',
    };
    expect(can(trialing, 'VOICE_COACH', now)).toBe(true);
    expect(can(trialing, 'VOICE_COACH', new Date('2026-03-11T00:00:00Z'))).toBe(false);
  });

  it('lets a free operator buy the season pass independently of a subscription', () => {
    const passOnly: EntitlementState = {
      subscription: 'NONE',
      ownsSeasonPass: true,
      trialEndsAt: null,
    };
    expect(can(passOnly, 'PASS_PAID_TRACK', now)).toBe(true);
    expect(can(passOnly, 'VOICE_COACH', now)).toBe(false);
  });

  it('keeps access through a cancelled-but-active period', () => {
    const cancelled: EntitlementState = {
      subscription: 'CANCELLED_ACTIVE',
      ownsSeasonPass: false,
      trialEndsAt: null,
    };
    expect(can(cancelled, 'VOICE_COACH', now)).toBe(true);
  });

  it('removes nothing earned when a subscription lapses', () => {
    const lapse = describeLapse();
    expect(lapse.earnedContentRemoved).toBe(false);
    expect(lapse.coachingHistoryRemainsReadable).toBe(true);
    expect(lapse.ladderPositionAffected).toBe(false);
    expect(lapse.voiceRevertsToText).toBe(true);
  });

  it('produces a matrix covering every capability', () => {
    const matrix = entitlementMatrix();
    expect(matrix).toHaveLength(FREE_CAPABILITIES.length + PAID_CAPABILITIES.length);
    for (const row of matrix.filter((r) => r.category === 'competitive_core')) {
      expect(row.free, `${row.capability} must be free`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §16 — Streaks
// ---------------------------------------------------------------------------

describe('§16 — rest never costs anything', () => {
  const ctx = (now: string) => ({ restDays: [0, 6], now: new Date(now) });

  it('starts a streak on the first session', () => {
    const update = recordSession(INITIAL_STREAK, ctx('2026-03-02T09:00:00Z'));
    expect(update.event).toBe('started');
    expect(update.state.count).toBe(1);
  });

  it('extends across a two-day rest gap without a freeze', () => {
    let state = recordSession(INITIAL_STREAK, ctx('2026-03-02T09:00:00Z')).state;
    const update = recordSession(state, ctx('2026-03-05T09:00:00Z'));
    expect(update.state.count).toBe(2);
    expect(update.state.freezesRemaining).toBe(1);
    expect(update.event).toBe('held_by_rest_day');
  });

  it('spends the monthly freeze on a longer gap', () => {
    const state = recordSession(INITIAL_STREAK, ctx('2026-03-02T09:00:00Z')).state;
    const update = recordSession(state, ctx('2026-03-09T09:00:00Z'));
    expect(update.event).toBe('held_by_freeze');
    expect(update.state.count).toBe(2);
    expect(update.state.freezesRemaining).toBe(0);
  });

  it('resets only after the freeze is spent', () => {
    let state = recordSession(INITIAL_STREAK, ctx('2026-03-02T09:00:00Z')).state;
    state = recordSession(state, ctx('2026-03-09T09:00:00Z')).state;
    const update = recordSession(state, ctx('2026-03-20T09:00:00Z'));
    expect(update.event).toBe('reset');
    expect(update.state.count).toBe(1);
  });

  it('does not double-count two sessions in one day', () => {
    const state = recordSession(INITIAL_STREAK, ctx('2026-03-02T09:00:00Z')).state;
    const update = recordSession(state, ctx('2026-03-02T18:00:00Z'));
    expect(update.state.count).toBe(1);
  });

  it('pauses indefinitely for injury with no penalty', () => {
    let state = recordSession(INITIAL_STREAK, ctx('2026-03-02T09:00:00Z')).state;
    state = recordSession(state, ctx('2026-03-03T09:00:00Z')).state;
    const paused = pauseStreak(state, 'injury', new Date('2026-03-04T09:00:00Z'));
    expect(paused.state.count).toBe(2);

    // Six weeks later the streak resumes exactly where it stopped.
    const resumed = recordSession(paused.state, ctx('2026-04-20T09:00:00Z'));
    expect(resumed.state.count).toBe(3);
    expect(resumed.event).toBe('extended');
  });

  it('grants a fresh freeze each calendar month', () => {
    let state = recordSession(INITIAL_STREAK, ctx('2026-03-02T09:00:00Z')).state;
    // Spends March's freeze on a long gap.
    state = recordSession(state, ctx('2026-03-09T09:00:00Z')).state;
    expect(state.freezesRemaining).toBe(0);

    // A second long gap in April is held by April's fresh allowance rather than
    // resetting the streak — which is what proves the grant happened.
    const nextMonth = recordSession(state, ctx('2026-04-01T09:00:00Z'));
    expect(nextMonth.event).toBe('held_by_freeze');
    expect(nextMonth.state.count).toBe(3);
    expect(nextMonth.state.freezeGrantedForMonth).toBe('2026-04');
  });

  it('never uses shame, ultimatum or loss-framing copy', () => {
    const samples: string[] = [];
    let state = recordSession(INITIAL_STREAK, ctx('2026-03-02T09:00:00Z'));
    samples.push(state.copy);
    state = recordSession(state.state, ctx('2026-03-05T09:00:00Z'));
    samples.push(state.copy);
    state = recordSession(state.state, ctx('2026-03-14T09:00:00Z'));
    samples.push(state.copy);
    state = recordSession(state.state, ctx('2026-04-30T09:00:00Z'));
    samples.push(state.copy);
    samples.push(pauseStreak(state.state, 'injury', new Date()).copy);
    samples.push(pauseStreak(state.state, 'illness', new Date()).copy);

    for (const copy of samples) {
      expect(copy, copy).not.toMatch(FORBIDDEN_STREAK_LANGUAGE);
    }
  });

  it('does not name the lost number when a streak resets', () => {
    let state = recordSession(INITIAL_STREAK, ctx('2026-03-02T09:00:00Z')).state;
    state = recordSession(state, ctx('2026-03-09T09:00:00Z')).state;
    const reset = recordSession(state, ctx('2026-03-25T09:00:00Z'));
    expect(reset.event).toBe('reset');
    expect(reset.copy).not.toMatch(/\b2\b/);
  });
});
