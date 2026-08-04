import { runCalibration } from '../engine/calibration';
import { NO_ROLLING_GAIN } from '../engine/progression';
import { INITIAL_STREAK } from '../engine/streaks';
import {
  NO_READINESS_FLAGS,
  type OperatorProfile,
  type PillarScores,
  type ReadinessFlags,
  type VerificationTier,
} from '../engine/types';
import { useApp } from '../state/store';
import { useWorld } from '../state/world';

/**
 * Seeds the stores into a named, realistic state so screen tests exercise the
 * real code path rather than a fixture.
 *
 * Zustand stores are module singletons, so every test must reset both or state
 * leaks between them in ways that look like flakiness.
 */

export interface SeedOptions {
  pillars?: PillarScores;
  verification?: VerificationTier;
  readiness?: ReadinessFlags;
  paused?: 'injury' | 'illness' | null;
  level?: number;
  lastSessionDate?: string | null;
  careerPeakCps?: number;
}

const DEFAULT_PILLARS: PillarScores = {
  strength: 56,
  endurance: 62,
  consistency: 67.5,
  mobility: 72,
};

export function seedOperator(options: SeedOptions = {}): OperatorProfile {
  const profile: OperatorProfile = {
    id: 'op_test',
    displayName: 'Test Operator',
    ageYears: 27,
    sex: 'male',
    pillars: options.pillars ?? DEFAULT_PILLARS,
    level: options.level ?? 1,
    xpIntoLevel: 0,
    verification: options.verification ?? 'SELF_REPORTED',
    readiness: options.readiness ?? NO_READINESS_FLAGS,
    lastSessionDate: options.lastSessionDate ?? null,
    careerPeakCps: options.careerPeakCps ?? 63.1,
    seasonPeakTier: 'COBALT',
    pausedFor: options.paused ?? null,
    homeVenueId: 'v_bharatpur_iron',
    cityId: 'bharatpur',
  };

  useApp.setState({
    phase: 'ACTIVE',
    profile,
    calibration: runCalibration({
      inputs: {
        pushups: 34,
        pullups: 9,
        squats: 55,
        run_distance: 8,
        run_pace: 330,
        sessions_per_week: 4,
        months_training: 30,
        sit_reach: 6,
        overhead_squat: 3,
        shoulder_rotation: 3,
      },
      ageYears: 27,
      sex: 'male',
      readiness: options.readiness ?? NO_READINESS_FLAGS,
    }),
    streak: INITIAL_STREAK,
    rollingGain: NO_ROLLING_GAIN,
    rollingWindowStart: null,
    sessions: [],
    activeSession: null,
    lastSummary: null,
    records: {},
    coachingHistory: [],
    commanderOptIn: false,
    coachPersonality: 'STRICT_TRAINER',
    entitlements: { subscription: 'NONE', ownsSeasonPass: false, trialEndsAt: null },
    pendingSync: [],
  });

  // The world store is a cache of server truth; seeding it gives the ladder,
  // territory and rival screens something real to render.
  useWorld.setState({ loaded: false });
  useWorld.getState().seedWorld();

  return profile;
}

/** Clears both stores. Call in beforeEach. */
export function resetStores(): void {
  useApp.getState().reset();
  useWorld.setState({
    loaded: false,
    operators: [],
    venues: [],
    cities: [],
    rivalCandidates: [],
    rivalries: [],
    activeRaid: null,
    archive: [],
    pairStreaks: {},
    lastVerifiedSessionAt: null,
  });
}

export const noop = () => {};
