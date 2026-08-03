import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  RECALIBRATION_INTERVAL_DAYS,
  resolveReadiness,
  runCalibration,
  type CalibrationInputs,
  type CalibrationResult,
  type CoachPersonality,
} from '../engine/calibration';
import { DEFAULT_PROGRESSION, assertConfigValid } from '../engine/config';
import { assertNoCompetitiveAdvantageIsSold, type EntitlementState } from '../engine/entitlements';
import {
  NO_ROLLING_GAIN,
  applyStatGain,
  awardXp,
  computeCps,
  computeDecay,
  computeStanding,
  toIsoDate,
  type RollingGain,
} from '../engine/progression';
import { scoreSession, type SessionScore } from '../engine/scoring';
import { INITIAL_STREAK, pauseStreak, recordSession, type StreakState } from '../engine/streaks';
import {
  NO_READINESS_FLAGS,
  type LoggedSession,
  type LoggedSet,
  type OperatorProfile,
  type PauseReason,
  type ReadinessFlags,
  type Sex,
  type Standing,
  type VerificationTier,
} from '../engine/types';
import { scoringProfileFor } from '../data/exercises';

/**
 * Application state.
 *
 * §7: "Offline-first. Everything logs without connection and syncs later."
 *
 * The store is the single writer of operator state and it persists to device
 * storage synchronously on every mutation. Nothing here calls the network. A
 * sync layer reads `pendingSync` and drains it when connectivity returns; the
 * app is fully functional if that never happens.
 */

export type AppPhase =
  | 'CALIBRATION'
  | 'CALIBRATION_ABANDONED'
  | 'REVEAL'
  | 'ACTIVE';

export interface SessionSummary {
  sessionId: string;
  score: SessionScore;
  xpAwarded: number;
  levelsGained: number[];
  /** What the §5 weekly cap withheld, surfaced rather than hidden. */
  withheld: Record<string, number>;
  prs: string[];
}

interface AppState {
  phase: AppPhase;

  profile: OperatorProfile | null;
  calibration: CalibrationResult | null;
  /** Partial answers, so an abandoned calibration can be resumed — §4. */
  calibrationDraft: {
    inputs: CalibrationInputs;
    ageYears: number | null;
    sex: Sex | null;
    readiness: ReadinessFlags;
    stepIndex: number;
    startedAt: string | null;
  };

  streak: StreakState;
  rollingGain: RollingGain;
  /** ISO date the rolling 7-day gain window opened. */
  rollingWindowStart: string | null;

  sessions: LoggedSession[];
  activeSession: LoggedSession | null;
  lastSummary: SessionSummary | null;

  entitlements: EntitlementState;
  coachPersonality: CoachPersonality;

  /** Records not yet pushed to the server. Drained by the sync layer. */
  pendingSync: string[];

  // Actions
  setCalibrationAnswer: (tableId: string, value: number) => void;
  setDemographics: (ageYears: number, sex: Sex) => void;
  setReadiness: (flags: ReadinessFlags) => void;
  advanceCalibration: () => void;
  completeCalibration: (displayName: string) => void;
  abandonCalibration: () => void;
  acknowledgeReveal: () => void;

  startSession: (verification: VerificationTier, venueId: string | null) => void;
  logSet: (set: LoggedSet) => void;
  endSession: () => void;
  abortSessionForInjury: () => void;

  pauseFor: (reason: Exclude<PauseReason, null>) => void;
  resume: () => void;

  applyDecayIfDue: () => void;
  standing: () => Standing | null;
  reset: () => void;
}

/**
 * §7 scoring needs bodyweight for bodyweight movements and load ratios.
 *
 * §21 forbids weight tracking, targets and commentary — this value is a scoring
 * input only. It is never graphed, never a goal, never mentioned by AXIOM, and
 * has no history: the store holds exactly one current number.
 */
const DEFAULT_BODYWEIGHT_KG = 70;

const EMPTY_DRAFT: AppState['calibrationDraft'] = {
  inputs: {},
  ageYears: null,
  sex: null,
  readiness: NO_READINESS_FLAGS,
  stepIndex: 0,
  startedAt: null,
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Fail loudly at module load if either invariant has been broken.
assertConfigValid(DEFAULT_PROGRESSION);
assertNoCompetitiveAdvantageIsSold();

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      phase: 'CALIBRATION',
      profile: null,
      calibration: null,
      calibrationDraft: EMPTY_DRAFT,
      streak: INITIAL_STREAK,
      rollingGain: NO_ROLLING_GAIN,
      rollingWindowStart: null,
      sessions: [],
      activeSession: null,
      lastSummary: null,
      entitlements: { subscription: 'NONE', ownsSeasonPass: false, trialEndsAt: null },
      coachPersonality: 'STRICT_TRAINER',
      pendingSync: [],

      // ---------------------------------------------------------------------
      // §4 / §6 — Calibration
      // ---------------------------------------------------------------------

      setCalibrationAnswer: (tableId, value) =>
        set((state) => ({
          calibrationDraft: {
            ...state.calibrationDraft,
            inputs: { ...state.calibrationDraft.inputs, [tableId]: value },
            startedAt: state.calibrationDraft.startedAt ?? new Date().toISOString(),
          },
        })),

      setDemographics: (ageYears, sex) =>
        set((state) => ({
          calibrationDraft: { ...state.calibrationDraft, ageYears, sex },
        })),

      setReadiness: (flags) =>
        set((state) => ({
          calibrationDraft: { ...state.calibrationDraft, readiness: flags },
          // §6 / §14: any flag defaults the coach to its lowest-intensity voice.
          coachPersonality: resolveReadiness(flags).defaultPersonality,
        })),

      advanceCalibration: () =>
        set((state) => ({
          calibrationDraft: {
            ...state.calibrationDraft,
            stepIndex: state.calibrationDraft.stepIndex + 1,
          },
        })),

      completeCalibration: (displayName) => {
        const draft = get().calibrationDraft;
        const result = runCalibration({
          inputs: draft.inputs,
          ageYears: draft.ageYears ?? 25,
          sex: draft.sex ?? 'unspecified',
          readiness: draft.readiness,
        });

        const profile: OperatorProfile = {
          id: newId('op'),
          displayName,
          ageYears: draft.ageYears ?? 25,
          sex: draft.sex ?? 'unspecified',
          pillars: result.pillars,
          level: 1,
          xpIntoLevel: 0,
          // §6: calibration output is always SELF_REPORTED.
          verification: 'SELF_REPORTED',
          readiness: draft.readiness,
          lastSessionDate: null,
          careerPeakCps: result.cps,
          seasonPeakTier: result.tier,
          pausedFor: null,
          homeVenueId: null,
          cityId: null,
        };

        set({
          profile,
          calibration: result,
          phase: 'REVEAL',
          pendingSync: [...get().pendingSync, `calibration:${profile.id}`],
        });
      },

      /**
       * §4: "what a user who abandons calibration halfway sees when they come
       * back." The draft is kept intact, so the resume screen can offer to
       * continue from the exact question they left rather than restarting.
       */
      abandonCalibration: () => set({ phase: 'CALIBRATION_ABANDONED' }),

      acknowledgeReveal: () => set({ phase: 'ACTIVE' }),

      // ---------------------------------------------------------------------
      // §7 / §15 — Sessions
      // ---------------------------------------------------------------------

      startSession: (verification, venueId) => {
        const profile = get().profile;
        if (!profile) return;
        set({
          activeSession: {
            id: newId('sess'),
            operatorId: profile.id,
            startedAt: new Date().toISOString(),
            endedAt: '',
            sets: [],
            verification,
            venueId,
          },
        });
      },

      logSet: (loggedSet) =>
        set((state) => {
          if (!state.activeSession) return {};
          return {
            activeSession: {
              ...state.activeSession,
              sets: [...state.activeSession.sets, loggedSet],
            },
          };
        }),

      endSession: () => {
        const state = get();
        const { activeSession, profile } = state;
        if (!activeSession || !profile) return;

        const now = new Date();
        const finished: LoggedSession = { ...activeSession, endedAt: now.toISOString() };
        const score = scoreSession(finished, scoringProfileFor, DEFAULT_BODYWEIGHT_KG);

        // The rolling 7-day gain window resets when it is more than a week old.
        const windowStart = state.rollingWindowStart;
        const windowExpired =
          windowStart === null ||
          (now.getTime() - new Date(`${windowStart}T00:00:00Z`).getTime()) / 86_400_000 >= 7;
        const rollingGain = windowExpired ? NO_ROLLING_GAIN : state.rollingGain;

        const gain = applyStatGain(profile.pillars, score.proposedPillarPoints, rollingGain);
        const levelling = awardXp(profile.level, profile.xpIntoLevel, score.xp);
        const cps = computeCps(gain.pillars);

        const streakUpdate = recordSession(state.streak, {
          restDays: [0, 6],
          now,
        });

        set({
          profile: {
            ...profile,
            pillars: gain.pillars,
            level: levelling.level,
            xpIntoLevel: levelling.xpIntoLevel,
            lastSessionDate: toIsoDate(now),
            careerPeakCps: Math.max(profile.careerPeakCps, cps),
          },
          sessions: [...state.sessions, finished],
          activeSession: null,
          rollingGain: gain.rollingGain,
          rollingWindowStart: windowExpired ? toIsoDate(now) : windowStart,
          streak: streakUpdate.state,
          lastSummary: {
            sessionId: finished.id,
            score,
            xpAwarded: score.xp,
            levelsGained: levelling.levelsGained,
            withheld: gain.withheld,
            prs: [],
          },
          pendingSync: [...state.pendingSync, `session:${finished.id}`],
        });
      },

      /**
       * §15: "A permanently visible STOP / I'M INJURED control that ends the
       * session, logs it with no penalty, pauses streaks, and offers a recovery
       * path."
       */
      abortSessionForInjury: () => {
        const state = get();
        const { activeSession, profile } = state;
        if (!activeSession || !profile) return;

        const now = new Date();
        const finished: LoggedSession = {
          ...activeSession,
          endedAt: now.toISOString(),
          abortedForInjury: true,
        };

        const paused = pauseStreak(state.streak, 'injury', now);

        set({
          sessions: [...state.sessions, finished],
          activeSession: null,
          streak: paused.state,
          // No stat change, no XP, no streak break, and lastSessionDate is
          // updated so the §5 decay clock does not start running either.
          profile: { ...profile, pausedFor: 'injury', lastSessionDate: toIsoDate(now) },
          lastSummary: null,
          pendingSync: [...state.pendingSync, `session:${finished.id}`],
        });
      },

      // ---------------------------------------------------------------------
      // §16 — Pause
      // ---------------------------------------------------------------------

      pauseFor: (reason) => {
        const state = get();
        if (!state.profile) return;
        set({
          profile: { ...state.profile, pausedFor: reason },
          streak: pauseStreak(state.streak, reason, new Date()).state,
        });
      },

      resume: () => {
        const state = get();
        if (!state.profile) return;
        set({
          profile: { ...state.profile, pausedFor: null },
          streak: { ...state.streak, pausedFor: null, pausedSince: null },
        });
      },

      // ---------------------------------------------------------------------

      applyDecayIfDue: () => {
        const state = get();
        if (!state.profile) return;
        const decay = computeDecay(state.profile, new Date());
        if (decay.cpsLost <= 0) return;
        set({ profile: { ...state.profile, pillars: decay.pillars } });
      },

      standing: () => {
        const profile = get().profile;
        return profile ? computeStanding(profile) : null;
      },

      reset: () =>
        set({
          phase: 'CALIBRATION',
          profile: null,
          calibration: null,
          calibrationDraft: EMPTY_DRAFT,
          streak: INITIAL_STREAK,
          rollingGain: NO_ROLLING_GAIN,
          rollingWindowStart: null,
          sessions: [],
          activeSession: null,
          lastSummary: null,
          pendingSync: [],
        }),
    }),
    {
      name: 'meridian-state-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // The reveal is a one-shot cinematic; a user who force-quits during it
      // should land on the dashboard, not replay it.
      partialize: (state) => ({
        ...state,
        phase: state.phase === 'REVEAL' ? 'ACTIVE' : state.phase,
      }),
    },
  ),
);

export { RECALIBRATION_INTERVAL_DAYS };
