import { describe, expect, it } from 'vitest';
import {
  CONSERVATIVE_LOAD_INCREASE,
  DELOAD_EVERY_N_WEEKS,
  MAX_WEEKLY_LOAD_INCREASE,
  assessRecovery,
  describeProgression,
  isDeloadWeek,
  nextProgressionStep,
  recommend,
  stepIncreaseRatio,
  weeksUntilDeload,
  type CoachContext,
  type ProgressionContext,
} from './coach';
import type { CoachPersonality } from './calibration';
import { NO_READINESS_FLAGS, type LoggedSession, type PillarScores, type ReadinessFlags } from './types';

const PERSONALITIES: CoachPersonality[] = ['CALM_MENTOR', 'STRICT_TRAINER', 'ELITE_COMMANDER'];

function pillars(s: number, e: number, c: number, m: number): PillarScores {
  return { strength: s, endurance: e, consistency: c, mobility: m };
}

function flags(overrides: Partial<ReadinessFlags> = {}): ReadinessFlags {
  return { ...NO_READINESS_FLAGS, ...overrides };
}

function session(startedAt: string): LoggedSession {
  return {
    id: `s_${startedAt}`,
    operatorId: 'op1',
    startedAt,
    endedAt: startedAt,
    sets: [],
    verification: 'QR_CHECK_IN',
    venueId: 'v1',
  };
}

function progressionCtx(overrides: Partial<ProgressionContext> = {}): ProgressionContext {
  return {
    currentLoadKg: 100,
    currentReps: 5,
    weeksAtLoad: 2,
    weekIndex: 0,
    conservative: false,
    returning: false,
    ...overrides,
  };
}

function coachCtx(overrides: Partial<CoachContext> = {}): CoachContext {
  return {
    pillars: pillars(60, 50, 70, 40),
    sessions: [session('2026-03-02T09:00:00Z'), session('2026-03-04T09:00:00Z')],
    readiness: NO_READINESS_FLAGS,
    paused: false,
    personality: 'STRICT_TRAINER',
    weekIndex: 0,
    currentLoadKg: 100,
    currentReps: 5,
    weeksAtLoad: 2,
    now: new Date('2026-03-05T09:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// §15 — Load progression
// ---------------------------------------------------------------------------

describe('§15 — deload every 4th week, mandatory', () => {
  it('deloads on weeks 4, 8 and 12', () => {
    expect(isDeloadWeek(3)).toBe(true);
    expect(isDeloadWeek(7)).toBe(true);
    expect(isDeloadWeek(11)).toBe(true);
  });

  it('does not deload on other weeks', () => {
    for (const week of [0, 1, 2, 4, 5, 6, 8]) {
      expect(isDeloadWeek(week), `week ${week}`).toBe(false);
    }
  });

  it('never deloads week one, where there is nothing to deload from', () => {
    expect(isDeloadWeek(0)).toBe(false);
  });

  it('fires at least once every four weeks across a whole season', () => {
    const deloads = Array.from({ length: 13 }, (_, i) => i).filter(isDeloadWeek);
    expect(deloads).toEqual([3, 7, 11]);
    expect(DELOAD_EVERY_N_WEEKS).toBe(4);
  });

  it('counts down to the next deload', () => {
    expect(weeksUntilDeload(0)).toBe(3);
    expect(weeksUntilDeload(2)).toBe(1);
    expect(weeksUntilDeload(3)).toBe(0);
    expect(weeksUntilDeload(4)).toBe(3);
  });

  it('drops load in a deload week and changes nothing else', () => {
    const step = nextProgressionStep(progressionCtx({ weekIndex: 3 }));
    expect(step.variable).toBe('none');
    if (step.variable === 'none') {
      expect(step.reason).toBe('deload');
      expect(step.loadKg).toBeLessThan(100);
      expect(step.reps).toBe(5);
    }
  });

  it('deloads even when the operator is due a load increase', () => {
    const step = nextProgressionStep(progressionCtx({ weekIndex: 3, weeksAtLoad: 8 }));
    expect(step.variable).toBe('none');
  });
});

describe('§15 — one variable at a time', () => {
  it('changes only reps when adding reps', () => {
    const step = nextProgressionStep(progressionCtx({ weeksAtLoad: 0 }));
    expect(step.variable).toBe('reps');
    if (step.variable === 'reps') {
      expect(step.toReps).toBe(step.fromReps + 1);
      // Load is carried through unchanged, not re-derived.
      expect(step.loadKg).toBe(100);
    }
  });

  it('changes only load when adding load', () => {
    const step = nextProgressionStep(progressionCtx({ weeksAtLoad: 2 }));
    expect(step.variable).toBe('load');
    if (step.variable === 'load') {
      expect(step.toKg).toBeGreaterThan(step.fromKg);
      expect(step.reps).toBe(5);
    }
  });

  it('adds reps before load, so the weight is owned first', () => {
    const fresh = nextProgressionStep(progressionCtx({ weeksAtLoad: 0 }));
    const established = nextProgressionStep(progressionCtx({ weeksAtLoad: 2 }));
    expect(fresh.variable).toBe('reps');
    expect(established.variable).toBe('load');
  });
});

describe('§15 — load never rises more than 5% per week', () => {
  it('caps a standard increase at 5%', () => {
    const step = nextProgressionStep(progressionCtx({ currentLoadKg: 100 }));
    expect(stepIncreaseRatio(step)).toBeLessThanOrEqual(MAX_WEEKLY_LOAD_INCREASE);
  });

  it('holds the cap across a wide range of starting loads', () => {
    for (let load = 20; load <= 300; load += 2.5) {
      const step = nextProgressionStep(progressionCtx({ currentLoadKg: load }));
      expect(
        stepIncreaseRatio(step),
        `${load} kg produced a ${stepIncreaseRatio(step) * 100}% jump`,
      ).toBeLessThanOrEqual(MAX_WEEKLY_LOAD_INCREASE);
    }
  });

  it('rounds down to a real plate increment rather than up', () => {
    // 5% of 100 kg is 5 kg, which is two 2.5 kg steps exactly.
    const step = nextProgressionStep(progressionCtx({ currentLoadKg: 100 }));
    if (step.variable === 'load') expect(step.toKg).toBe(105);
  });

  it('adds a rep instead of breaching the cap on a light load', () => {
    // 5% of 20 kg is 1 kg — smaller than the smallest plate step.
    const step = nextProgressionStep(progressionCtx({ currentLoadKg: 20 }));
    expect(step.variable).toBe('reps');
  });

  it('halves the rate under §6 conservative loading', () => {
    const normal = nextProgressionStep(progressionCtx({ currentLoadKg: 200 }));
    const careful = nextProgressionStep(
      progressionCtx({ currentLoadKg: 200, conservative: true }),
    );
    expect(stepIncreaseRatio(careful)).toBeLessThan(stepIncreaseRatio(normal));
    expect(stepIncreaseRatio(careful)).toBeLessThanOrEqual(CONSERVATIVE_LOAD_INCREASE);
  });

  it('starts a returning operator below where they left off — §21', () => {
    const step = nextProgressionStep(progressionCtx({ returning: true }));
    expect(step.variable).toBe('none');
    if (step.variable === 'none') {
      expect(step.reason).toBe('returning');
      expect(step.loadKg).toBeLessThan(100);
    }
  });
});

describe('describeProgression', () => {
  it('writes a real sentence for every step kind', () => {
    const steps = [
      nextProgressionStep(progressionCtx({ weeksAtLoad: 0 })),
      nextProgressionStep(progressionCtx({ weeksAtLoad: 2 })),
      nextProgressionStep(progressionCtx({ weekIndex: 3 })),
      nextProgressionStep(progressionCtx({ returning: true })),
    ];
    for (const step of steps) {
      const description = describeProgression(step);
      expect(description.length).toBeGreaterThan(20);
      expect(description).not.toMatch(/TODO|placeholder|undefined|NaN/);
    }
  });
});

// ---------------------------------------------------------------------------
// §14 — Recovery
// ---------------------------------------------------------------------------

describe('§14 — recovery signals', () => {
  const now = new Date('2026-03-08T09:00:00Z');

  it('reports OVERREACHING at six sessions in seven days', () => {
    const sessions = [2, 3, 4, 5, 6, 7].map((d) => session(`2026-03-0${d}T09:00:00Z`));
    const signal = assessRecovery(sessions, now);
    expect(signal.state).toBe('OVERREACHING');
    expect(signal.guidance).toMatch(/rest day/i);
  });

  it('reports ACCUMULATING at five sessions in seven days', () => {
    const sessions = [3, 4, 5, 6, 7].map((d) => session(`2026-03-0${d}T09:00:00Z`));
    expect(assessRecovery(sessions, now).state).toBe('ACCUMULATING');
  });

  it('reports STEADY for a normal week', () => {
    const sessions = [5, 7].map((d) => session(`2026-03-0${d}T09:00:00Z`));
    expect(assessRecovery(sessions, now).state).toBe('STEADY');
  });

  it('reports FRESH after three or more rest days', () => {
    const signal = assessRecovery([session('2026-03-04T09:00:00Z')], now);
    expect(signal.state).toBe('FRESH');
    expect(signal.daysSinceLastSession).toBe(4);
  });

  it('reports DETRAINED after a long absence', () => {
    const signal = assessRecovery([session('2026-01-01T09:00:00Z')], now);
    expect(signal.state).toBe('DETRAINED');
    expect(signal.guidance).toMatch(/lighter/i);
  });

  it('reports DETRAINED for an operator who has never logged', () => {
    const signal = assessRecovery([], now);
    expect(signal.state).toBe('DETRAINED');
    expect(signal.daysSinceLastSession).toBeNull();
  });

  it('never advises pushing through an overreached week', () => {
    const sessions = [2, 3, 4, 5, 6, 7].map((d) => session(`2026-03-0${d}T09:00:00Z`));
    const guidance = assessRecovery(sessions, now).guidance;
    expect(guidance).not.toMatch(/push through|no pain|tough it out|earn it/i);
  });
});

// ---------------------------------------------------------------------------
// §14 — The recommendation
// ---------------------------------------------------------------------------

describe('§14 — recommend', () => {
  it('targets the weakest pillar', () => {
    const recommendation = recommend(coachCtx({ pillars: pillars(80, 70, 75, 30) }));
    expect(recommendation.focusPillar).toBe('mobility');
    expect(recommendation.muscleGroups.length).toBeGreaterThan(0);
  });

  it('returns exactly one motivational line', () => {
    const recommendation = recommend(coachCtx());
    expect(typeof recommendation.motivationalLine).toBe('string');
    expect(recommendation.motivationalLine.length).toBeGreaterThan(10);
  });

  it('returns a different line per personality', () => {
    const lines = PERSONALITIES.map(
      (personality) => recommend(coachCtx({ personality })).motivationalLine,
    );
    expect(new Set(lines).size).toBe(PERSONALITIES.length);
  });

  it('includes recovery guidance', () => {
    const recommendation = recommend(coachCtx());
    expect(recommendation.recovery.guidance.length).toBeGreaterThan(10);
  });

  it('flags a deload week', () => {
    expect(recommend(coachCtx({ weekIndex: 3 })).isDeloadWeek).toBe(true);
    expect(recommend(coachCtx({ weekIndex: 1 })).isDeloadWeek).toBe(false);
  });

  it('applies conservative loading on any readiness flag — §6', () => {
    const recommendation = recommend(coachCtx({ readiness: flags({ jointInjury: true }) }));
    expect(recommendation.conservative).toBe(true);
  });

  it('suppresses everything in the §21 medical-stop state', () => {
    const recommendation = recommend(coachCtx({ readiness: flags({ chestPain: true }) }));
    expect(recommendation.suppressed).toBe('medical_stop');
    expect(recommendation.progression.variable).toBe('none');
    expect(recommendation.motivationalLine).toMatch(/rank and your record/i);
  });

  it('suppresses everything during a §16 pause', () => {
    const recommendation = recommend(coachCtx({ paused: true }));
    expect(recommendation.suppressed).toBe('paused');
    expect(recommendation.progression.variable).toBe('none');
  });

  it('does not prescribe a load increase while suppressed', () => {
    for (const ctx of [
      coachCtx({ paused: true }),
      coachCtx({ readiness: flags({ cardiacHistory: true }) }),
    ]) {
      expect(recommend(ctx).progression.variable).toBe('none');
    }
  });

  it('starts a long-absent operator on a returning block', () => {
    const recommendation = recommend(
      coachCtx({ sessions: [session('2026-01-01T09:00:00Z')] }),
    );
    expect(recommendation.recovery.state).toBe('DETRAINED');
    expect(recommendation.progression.variable).toBe('none');
    if (recommendation.progression.variable === 'none') {
      expect(recommendation.progression.reason).toBe('returning');
    }
  });
});

// ---------------------------------------------------------------------------
// §14 / §21 — what the coach may never say or prescribe
// ---------------------------------------------------------------------------

describe('§14 — the two prohibitions', () => {
  const FORBIDDEN =
    /\b(calorie|calories|kcal|macro|protein target|body ?fat|body ?composition|weigh|weight (?:loss|goal|target)|lose weight|fast(?:ing|ed)|diet|meal|slim|lean out|toned|physique|look(?:s|ing)? (?:good|better))\b/i;

  const SHAMING = /\b(pathetic|weak|lazy|excuse|shame|disappoint|failure|loser|embarrass)\b/i;

  /** Every recommendation the engine can produce across a realistic matrix. */
  function allRecommendations() {
    const out: ReturnType<typeof recommend>[] = [];
    for (const personality of PERSONALITIES) {
      for (const weekIndex of [0, 1, 3, 7]) {
        for (const readiness of [
          NO_READINESS_FLAGS,
          flags({ jointInjury: true }),
          flags({ chestPain: true }),
        ]) {
          for (const paused of [false, true]) {
            for (const sessions of [
              [],
              [session('2026-03-04T09:00:00Z')],
              [2, 3, 4, 5, 6, 7].map((d) => session(`2026-03-0${d}T09:00:00Z`)),
            ]) {
              out.push(
                recommend(coachCtx({ personality, weekIndex, readiness, paused, sessions })),
              );
            }
          }
        }
      }
    }
    return out;
  }

  it('never prescribes calories, weight, body composition or fasting', () => {
    for (const recommendation of allRecommendations()) {
      expect(recommendation.motivationalLine).not.toMatch(FORBIDDEN);
      expect(recommendation.recovery.guidance).not.toMatch(FORBIDDEN);
    }
  });

  it('never comments on the body or appearance', () => {
    for (const recommendation of allRecommendations()) {
      expect(recommendation.motivationalLine).not.toMatch(
        /\b(your body looks|you look|appearance|mirror|shirtless|before and after)\b/i,
      );
    }
  });

  it('never shames', () => {
    for (const recommendation of allRecommendations()) {
      expect(recommendation.motivationalLine).not.toMatch(SHAMING);
      expect(recommendation.recovery.guidance).not.toMatch(SHAMING);
    }
  });

  it('never breaches the 5% cap in any configuration', () => {
    for (const recommendation of allRecommendations()) {
      expect(stepIncreaseRatio(recommendation.progression)).toBeLessThanOrEqual(
        MAX_WEEKLY_LOAD_INCREASE,
      );
    }
  });

  it('always changes at most one variable', () => {
    for (const recommendation of allRecommendations()) {
      // The discriminated union makes this structurally true; the assertion
      // exists so the guarantee is visible in the suite rather than only in the
      // type, and would catch a widening of the union.
      expect(['load', 'reps', 'none']).toContain(recommendation.progression.variable);
    }
  });
});
