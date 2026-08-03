import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
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
import {
  detectRecords,
  recordsWorthCelebrating,
  type DetectedRecord,
  type RecordBook,
} from '../engine/records';
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

/** §14: "all coaching history stays readable" — including after a lapse. */
export interface CoachingEntry {
  at: string;
  trigger: string;
  line: string;
}

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
  /** Every record set, including first-ever baselines. */
  records: DetectedRecord[];
  /** The subset worth a §19 moment-3 screen — genuine improvements only. */
  celebratedRecords: DetectedRecord[];
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
  /** §7: PR history per movement. Persisted with everything else. */
  records: RecordBook;

  entitlements: EntitlementState;
  coachPersonality: CoachPersonality;
  /** §14: append-only. Never cleared, including on a lapsed subscription. */
  coachingHistory: CoachingEntry[];
  /** §14: the Commander personality requires an explicit roleplay opt-in. */
  commanderOptIn: boolean;

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

  setPersonality: (personality: CoachPersonality) => void;
  acceptCommanderOptIn: () => void;
  recordCoachingLine: (trigger: string, line: string) => void;

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
      records: {},
      entitlements: { subscription: 'NONE', ownsSeasonPass: false, trialEndsAt: null },
      coachPersonality: 'STRICT_TRAINER',
      coachingHistory: [],
      commanderOptIn: false,
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

        // §7: PRs are detected from the *scored* session, so a set flagged as
        // implausible cannot set a record.
        const detection = detectRecords(
          score,
          finished.id,
          finished.startedAt,
          state.records,
        );

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
          records: detection.book,
          lastSummary: {
            sessionId: finished.id,
            score,
            xpAwarded: score.xp,
            levelsGained: levelling.levelsGained,
            withheld: gain.withheld,
            records: detection.records,
            celebratedRecords: recordsWorthCelebrating(detection.records),
          },
          pendingSync: [...state.pendingSync, `session:${finished.id}`],
        });
      },

      /**
       * §15: "A permanently visible STOP / I'M INJURED control that ends the
       * session, logs it with no penalty, pauses streaks, and offers a recovery
       * path."
       *
       * "No penalty" is read strictly: every set completed before the operator
       * stopped scores exactly as it would have otherwise, and can still set a
       * PR. Discarding work already done because the next set hurt would itself
       * be a penalty for getting injured, which §21 forbids.
       *
       * What the abort does is protect everything downstream — the streak
       * pauses, decay does not start, and all challenge prompts are suppressed.
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

        const score = scoreSession(finished, scoringProfileFor, DEFAULT_BODYWEIGHT_KG);

        const windowStart = state.rollingWindowStart;
        const windowExpired =
          windowStart === null ||
          (now.getTime() - new Date(`${windowStart}T00:00:00Z`).getTime()) / 86_400_000 >= 7;
        const rollingGain = windowExpired ? NO_ROLLING_GAIN : state.rollingGain;

        const gain = applyStatGain(profile.pillars, score.proposedPillarPoints, rollingGain);
        const levelling = awardXp(profile.level, profile.xpIntoLevel, score.xp);
        const cps = computeCps(gain.pillars);

        const detection = detectRecords(score, finished.id, finished.startedAt, state.records);
        const paused = pauseStreak(state.streak, 'injury', now);

        set({
          sessions: [...state.sessions, finished],
          activeSession: null,
          streak: paused.state,
          records: detection.book,
          rollingGain: gain.rollingGain,
          rollingWindowStart: windowExpired ? toIsoDate(now) : windowStart,
          profile: {
            ...profile,
            pillars: gain.pillars,
            level: levelling.level,
            xpIntoLevel: levelling.xpIntoLevel,
            pausedFor: 'injury',
            // Updated so the §5 decay clock does not start running either.
            lastSessionDate: toIsoDate(now),
            careerPeakCps: Math.max(profile.careerPeakCps, cps),
          },
          lastSummary: {
            sessionId: finished.id,
            score,
            xpAwarded: score.xp,
            levelsGained: levelling.levelsGained,
            withheld: gain.withheld,
            records: detection.records,
            celebratedRecords: recordsWorthCelebrating(detection.records),
          },
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

      /**
       * §14: ELITE_COMMANDER is "gated behind an explicit opt-in that states
       * plainly that it is roleplay flavour, not coaching advice." Selecting it
       * without that opt-in silently does nothing rather than failing loudly,
       * because the only way to reach here without it is a programming error.
       */
      setPersonality: (personality) => {
        if (personality === 'ELITE_COMMANDER' && !get().commanderOptIn) return;
        set({ coachPersonality: personality });
      },

      acceptCommanderOptIn: () =>
        set({ commanderOptIn: true, coachPersonality: 'ELITE_COMMANDER' }),

      recordCoachingLine: (trigger, line) =>
        set((state) => ({
          coachingHistory: [
            { at: new Date().toISOString(), trigger, line },
            ...state.coachingHistory,
          ].slice(0, 200),
        })),

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

/**
 * The standing selector, memoised.
 *
 * `standing()` derives a fresh object on every call. Passing it directly to
 * `useApp` — `useApp((s) => s.standing())` — makes zustand compare a new object
 * reference against the previous one on every store read, conclude the slice
 * changed, and re-render forever. It surfaces as React error #185, and it took
 * running the built app to notice: the engine tests never mount a component and
 * the reveal screen happens to select only stable slices.
 *
 * Selecting `profile` and deriving downstream fixes it, because `profile` is a
 * stable reference until the profile actually changes.
 */
export function useStanding(): Standing | null {
  const profile = useApp((s) => s.profile);
  return useMemo(() => (profile ? computeStanding(profile) : null), [profile]);
}

export { RECALIBRATION_INTERVAL_DAYS };
