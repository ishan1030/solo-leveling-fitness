import { parseIsoDate, toIsoDate, wholeDaysBetween } from './progression';
import type { PauseReason } from './types';

/**
 * §16 — STREAKS & CONSISTENCY, "DESIGNED SO REST NEVER COSTS ANYTHING".
 *
 *   - 2 scheduled rest days per week do not break a streak.
 *   - 1 automatic streak freeze granted per month.
 *   - Logging injury or illness pauses the streak indefinitely, no penalty.
 *   - Streak copy is encouraging only. No shame, no ultimatums, no loss-framing.
 */

export const FREE_REST_DAYS_PER_WEEK = 2;
export const STREAK_FREEZES_PER_MONTH = 1;

export interface StreakState {
  count: number;
  /** ISO date of the last day that counted toward the streak. */
  lastQualifyingDate: string | null;
  /** Freezes available this calendar month. */
  freezesRemaining: number;
  /** ISO month key (yyyy-mm) the freeze allowance was last granted for. */
  freezeGrantedForMonth: string | null;
  pausedFor: PauseReason;
  pausedSince: string | null;
}

export const INITIAL_STREAK: StreakState = {
  count: 0,
  lastQualifyingDate: null,
  freezesRemaining: STREAK_FREEZES_PER_MONTH,
  freezeGrantedForMonth: null,
  pausedFor: null,
  pausedSince: null,
};

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Grants the monthly freeze on the first evaluation of each calendar month. */
export function grantMonthlyFreeze(state: StreakState, now: Date): StreakState {
  const key = monthKey(now);
  if (state.freezeGrantedForMonth === key) return state;
  return { ...state, freezesRemaining: STREAK_FREEZES_PER_MONTH, freezeGrantedForMonth: key };
}

export interface StreakUpdate {
  state: StreakState;
  /** What happened, for the UI and the §14 copy bank. */
  event: 'extended' | 'held_by_rest_day' | 'held_by_freeze' | 'reset' | 'paused' | 'started';
  /** §16: encouraging only. Never loss-framed. */
  copy: string;
}

export interface StreakContext {
  /** Days of the week the operator declared as rest, 0 = Sunday. */
  restDays: number[];
  now: Date;
}

/**
 * Records a qualifying session and returns the new streak state.
 *
 * The gap tolerance is computed from the operator's own declared rest days, so
 * someone who trains Mon/Wed/Fri keeps a streak that someone training six days a
 * week would also keep. The streak measures adherence to a plan, not raw
 * frequency — which is the only version of a streak that does not punish rest.
 */
export function recordSession(
  state: StreakState,
  ctx: StreakContext,
): StreakUpdate {
  const withFreeze = grantMonthlyFreeze(state, ctx.now);
  const today = toIsoDate(ctx.now);

  if (withFreeze.pausedFor !== null) {
    // Training during a pause is welcome; it simply resumes the streak where it
    // was left, with nothing lost.
    const resumed: StreakState = {
      ...withFreeze,
      pausedFor: null,
      pausedSince: null,
      count: withFreeze.count + 1,
      lastQualifyingDate: today,
    };
    return {
      state: resumed,
      event: 'extended',
      copy: `Back in. Streak picks up at ${resumed.count}, exactly where you left it.`,
    };
  }

  if (withFreeze.lastQualifyingDate === null) {
    return {
      state: { ...withFreeze, count: 1, lastQualifyingDate: today },
      event: 'started',
      copy: 'Session one. That is the streak started.',
    };
  }

  if (withFreeze.lastQualifyingDate === today) {
    // A second session on the same day does not double-count.
    return {
      state: withFreeze,
      event: 'extended',
      copy: `Second session today. Streak stands at ${withFreeze.count}.`,
    };
  }

  const gapDays = wholeDaysBetween(parseIsoDate(withFreeze.lastQualifyingDate), ctx.now);
  const tolerance = gapTolerance(withFreeze.lastQualifyingDate, ctx);

  if (gapDays <= tolerance) {
    const next = { ...withFreeze, count: withFreeze.count + 1, lastQualifyingDate: today };
    return {
      state: next,
      event: gapDays > 1 ? 'held_by_rest_day' : 'extended',
      copy: `${next.count} sessions deep.`,
    };
  }

  // The gap exceeded the plan. Spend a freeze if one is available.
  if (withFreeze.freezesRemaining > 0) {
    const next: StreakState = {
      ...withFreeze,
      count: withFreeze.count + 1,
      lastQualifyingDate: today,
      freezesRemaining: withFreeze.freezesRemaining - 1,
    };
    return {
      state: next,
      event: 'held_by_freeze',
      copy: `Streak freeze used, and it held. ${next.count} and counting. You get another one next month.`,
    };
  }

  return {
    state: { ...withFreeze, count: 1, lastQualifyingDate: today },
    event: 'reset',
    // §16: encouraging only. The old number is not mentioned, because naming
    // what was lost is loss-framing.
    copy: 'New streak starts today. Session one.',
  };
}

/**
 * How many days may pass between qualifying sessions before the streak needs a
 * freeze. Base is 1 (train tomorrow), extended by the operator's declared rest
 * days, capped at the §16 allowance of 2 free rest days per week.
 */
export function gapTolerance(lastQualifyingDate: string, ctx: StreakContext): number {
  const restDaysUsed = Math.min(FREE_REST_DAYS_PER_WEEK, ctx.restDays.length);
  void lastQualifyingDate;
  return 1 + restDaysUsed;
}

/**
 * §16 / §21: "Logging injury or illness pauses the streak indefinitely, no
 * penalty, no guilt copy."
 */
export function pauseStreak(
  state: StreakState,
  reason: Exclude<PauseReason, null>,
  now: Date,
): StreakUpdate {
  return {
    state: { ...state, pausedFor: reason, pausedSince: toIsoDate(now) },
    event: 'paused',
    copy:
      reason === 'injury'
        ? `Streak paused at ${state.count}. It stays there until you tell us otherwise. Recover properly.`
        : `Streak paused at ${state.count}. Rest is the training right now.`,
  };
}

export function resumeStreak(state: StreakState): StreakState {
  return { ...state, pausedFor: null, pausedSince: null };
}

/**
 * §16: "Streak copy is encouraging only. No shame, no ultimatums, no
 * loss-framing."
 *
 * Enforced as a lint over the copy this module produces, so a future edit that
 * reintroduces "don't lose your streak!" fails the test suite.
 */
export const FORBIDDEN_STREAK_LANGUAGE =
  /\b(don'?t lose|you'?ll lose|losing|lost your|last chance|about to break|failed?|failure|slacking|lazy|excuse|guilt|shame|disappoint)\b/i;
