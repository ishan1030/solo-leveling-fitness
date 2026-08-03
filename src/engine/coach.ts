import type { CoachPersonality } from './calibration';
import { round1, round2, wholeDaysBetween, parseIsoDate } from './progression';
import { weakestPillar, type MuscleGroup } from './quests';
import type { LoggedSession, Pillar, PillarScores, ReadinessFlags } from './types';
import { hasAnyReadinessFlag, requiresMedicalStop } from './types';

/**
 * §14 COACHING ENGINE + §15 TRAINING MODE programming rules.
 *
 * §14: "Reads workout history, weakest pillar, progress rate, recovery signals,
 * and declared goals. Returns: next session recommendation, recovery guidance,
 * one motivational line."
 *
 * The two prohibitions are enforced structurally rather than by review:
 *
 *   §14: "NEVER prescribes calories, weight targets, body-fat goals, or
 *   fasting. NEVER comments on the user's body or appearance."
 *
 * `Recommendation` has no field capable of carrying any of those. There is no
 * `nutrition`, no `targetWeight`, no `bodyComposition`, and no free-text field
 * that the engine fills from anything other than the fixed line bank. A future
 * change that tried to add dietary advice would have to add a field to this
 * interface, which is the review gate the spec is asking for.
 */

// ---------------------------------------------------------------------------
// §15 — Load progression
// ---------------------------------------------------------------------------

/** §15: "≤5% per week". */
export const MAX_WEEKLY_LOAD_INCREASE = 0.05;
/** §15: "a mandatory deload every 4th week". */
export const DELOAD_EVERY_N_WEEKS = 4;
/** How far load drops in a deload week. */
export const DELOAD_LOAD_FACTOR = 0.6;
/** §6 conservative loading, for readiness-flagged operators. */
export const CONSERVATIVE_LOAD_INCREASE = 0.025;

/**
 * §15: "one variable at a time".
 *
 * Modelled as a discriminated union so a step can only ever change one thing.
 * A recommendation that raised both load and reps would not be representable.
 */
export type ProgressionStep =
  | { variable: 'load'; fromKg: number; toKg: number; reps: number }
  | { variable: 'reps'; fromReps: number; toReps: number; loadKg: number }
  | { variable: 'none'; reason: 'deload' | 'returning' | 'hold'; loadKg: number; reps: number };

export function isDeloadWeek(weekIndex: number): boolean {
  // Weeks are 0-indexed, so weeks 3, 7, 11 are every 4th.
  return weekIndex > 0 && (weekIndex + 1) % DELOAD_EVERY_N_WEEKS === 0;
}

export interface ProgressionContext {
  currentLoadKg: number;
  currentReps: number;
  /** Consecutive weeks the operator has held this load without missing reps. */
  weeksAtLoad: number;
  weekIndex: number;
  /** §6: any readiness flag halves the progression rate. */
  conservative: boolean;
  /** True when returning from an injury or illness pause. */
  returning: boolean;
}

/**
 * The next prescribed step.
 *
 * Deliberately unexciting. §15 asks for conservative progression and the
 * fastest path this function can produce is 5% per week — which over a 13-week
 * season is roughly a 90% increase, far more than almost anyone sustains. The
 * cap exists to stop the app writing cheques the operator's connective tissue
 * cannot cash.
 */
export function nextProgressionStep(ctx: ProgressionContext): ProgressionStep {
  if (isDeloadWeek(ctx.weekIndex)) {
    return {
      variable: 'none',
      reason: 'deload',
      loadKg: round1(ctx.currentLoadKg * DELOAD_LOAD_FACTOR),
      reps: ctx.currentReps,
    };
  }

  if (ctx.returning) {
    // §21: a returning operator starts below where they left off, always.
    return {
      variable: 'none',
      reason: 'returning',
      loadKg: round1(ctx.currentLoadKg * DELOAD_LOAD_FACTOR),
      reps: ctx.currentReps,
    };
  }

  // Reps come first: adding a rep at the same load is a smaller jump than
  // adding load, and it proves the operator owns the current weight.
  if (ctx.weeksAtLoad < 1) {
    return {
      variable: 'reps',
      fromReps: ctx.currentReps,
      toReps: ctx.currentReps + 1,
      loadKg: ctx.currentLoadKg,
    };
  }

  const rate = ctx.conservative ? CONSERVATIVE_LOAD_INCREASE : MAX_WEEKLY_LOAD_INCREASE;
  const proposed = ctx.currentLoadKg * (1 + rate);

  // Round to the nearest 2.5 kg, since that is what plates come in. Rounding up
  // could exceed the 5% cap, so it always rounds down.
  const stepped = Math.floor(proposed / 2.5) * 2.5;

  if (stepped <= ctx.currentLoadKg) {
    // The load is too light for a 2.5 kg step to fit inside 5%. Add a rep
    // instead rather than breaching the cap.
    return {
      variable: 'reps',
      fromReps: ctx.currentReps,
      toReps: ctx.currentReps + 1,
      loadKg: ctx.currentLoadKg,
    };
  }

  return {
    variable: 'load',
    fromKg: ctx.currentLoadKg,
    toKg: round1(stepped),
    reps: ctx.currentReps,
  };
}

/** Percentage increase a step represents, for the cap assertion and the UI. */
export function stepIncreaseRatio(step: ProgressionStep): number {
  if (step.variable !== 'load') return 0;
  return round2((step.toKg - step.fromKg) / step.fromKg);
}

// ---------------------------------------------------------------------------
// §14 — Recovery signals
// ---------------------------------------------------------------------------

export type RecoveryState = 'FRESH' | 'STEADY' | 'ACCUMULATING' | 'OVERREACHING' | 'DETRAINED';

export interface RecoverySignal {
  state: RecoveryState;
  /** Sessions in the trailing 7 days. */
  recentSessionCount: number;
  daysSinceLastSession: number | null;
  /** What the coach says about it. Written, not templated. */
  guidance: string;
}

/**
 * Derived from training frequency and density only.
 *
 * §21 forbids any body-composition input, and this app deliberately collects no
 * sleep, HRV or resting-HR stream — so the honest signal available is how much
 * the operator has trained recently and how hard. Inferring more than that from
 * less than that would be dressing a guess up as measurement.
 */
export function assessRecovery(
  sessions: LoggedSession[],
  now: Date,
): RecoverySignal {
  const sevenDaysAgo = now.getTime() - 7 * 86_400_000;
  const recent = sessions.filter((s) => new Date(s.startedAt).getTime() >= sevenDaysAgo);

  const lastSession = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )[0];

  const daysSince = lastSession
    ? wholeDaysBetween(parseIsoDate(lastSession.startedAt.slice(0, 10)), now)
    : null;

  if (daysSince === null || daysSince > 14) {
    return {
      state: 'DETRAINED',
      recentSessionCount: recent.length,
      daysSinceLastSession: daysSince,
      guidance:
        'It has been a while. The first block back is deliberately lighter than where you left off — that is how you avoid buying an injury in week one.',
    };
  }

  if (recent.length >= 6) {
    return {
      state: 'OVERREACHING',
      recentSessionCount: recent.length,
      daysSinceLastSession: daysSince,
      guidance:
        'Six or more sessions in seven days. Take a full rest day before the next one. Adaptation happens between sessions, not during them.',
    };
  }

  if (recent.length >= 5) {
    return {
      state: 'ACCUMULATING',
      recentSessionCount: recent.length,
      daysSinceLastSession: daysSince,
      guidance:
        'Volume is stacking up. Keep the next session at the same load rather than pushing it, and sleep on schedule.',
    };
  }

  if (daysSince >= 3) {
    return {
      state: 'FRESH',
      recentSessionCount: recent.length,
      daysSinceLastSession: daysSince,
      guidance: 'Well rested. This is the session to push a little.',
    };
  }

  return {
    state: 'STEADY',
    recentSessionCount: recent.length,
    daysSinceLastSession: daysSince,
    guidance: 'Good rhythm. Hold it.',
  };
}

// ---------------------------------------------------------------------------
// §14 — The recommendation
// ---------------------------------------------------------------------------

/**
 * What AXIOM returns.
 *
 * Note what this type cannot express: there is no nutrition field, no weight
 * target, no body-composition assessment, and no appearance commentary. §14's
 * two prohibitions are structural, not editorial.
 */
export interface Recommendation {
  /** §14: "next session recommendation". */
  focusPillar: Pillar;
  muscleGroups: MuscleGroup[];
  /** §15: one variable at a time, ≤5%/week. */
  progression: ProgressionStep;
  /** True in every 4th week. Not optional. */
  isDeloadWeek: boolean;
  /** §14: "recovery guidance". */
  recovery: RecoverySignal;
  /** §14: "one motivational line". Exactly one, drawn from a fixed bank. */
  motivationalLine: string;
  /** Non-null when the recommendation is suppressed entirely. */
  suppressed: SuppressionReason | null;
  /** §6: conservative loading is in force. */
  conservative: boolean;
}

export type SuppressionReason = 'medical_stop' | 'paused';

export interface CoachContext {
  pillars: PillarScores;
  sessions: LoggedSession[];
  readiness: ReadinessFlags;
  paused: boolean;
  personality: CoachPersonality;
  weekIndex: number;
  currentLoadKg: number;
  currentReps: number;
  weeksAtLoad: number;
  now: Date;
}

const PILLAR_FOCUS: Record<Pillar, MuscleGroup[]> = {
  strength: ['chest', 'back', 'legs'],
  endurance: ['cardio', 'full_body'],
  consistency: ['full_body'],
  mobility: ['core', 'shoulders', 'legs'],
};

/**
 * §14: "one motivational line".
 *
 * A fixed bank, indexed by personality and recovery state. Nothing is generated
 * at runtime — every line here has been read, and every line is covered by the
 * §21 shame and appearance filters in the test suite.
 */
const MOTIVATIONAL_LINES: Record<CoachPersonality, Record<RecoveryState, string>> = {
  CALM_MENTOR: {
    FRESH: 'You are rested. Use it, but do not spend it all in the first set.',
    STEADY: 'Consistent work, consistently done. That is most of it.',
    ACCUMULATING: 'You have put in a lot this week. Holding steady is progress too.',
    OVERREACHING: 'Rest is not time off from training. It is the part where you get stronger.',
    DETRAINED: 'Starting again is the same skill as starting the first time. You already have it.',
  },
  STRICT_TRAINER: {
    FRESH: 'No excuses available today. You are rested and the plan is written.',
    STEADY: 'Same again. The work compounds whether you feel it this week or not.',
    ACCUMULATING: 'Hold the load. Adding to a fatigued week is how good blocks get wasted.',
    OVERREACHING: 'Take the rest day. That is the instruction, not a suggestion.',
    DETRAINED: 'Start lighter than your ego wants. Earn the old numbers back.',
  },
  ELITE_COMMANDER: {
    FRESH: 'Fully recovered, Operator. The ladder is waiting.',
    STEADY: 'Rhythm established. Maintain it.',
    ACCUMULATING: 'Heavy week logged. Hold the line rather than pushing it.',
    OVERREACHING: 'Stand down for a day. Even the best units rotate out.',
    DETRAINED: 'Operator returning to service. We rebuild from a lower load. Standard procedure.',
  },
};

/**
 * The single entry point §14 describes.
 *
 * Suppression is checked first and returns early: §21 requires that the
 * medical-stop state suppresses all challenge prompts, and a "next session
 * recommendation" is a challenge prompt.
 */
export function recommend(ctx: CoachContext): Recommendation {
  const conservative = hasAnyReadinessFlag(ctx.readiness);
  const recovery = assessRecovery(ctx.sessions, ctx.now);
  const focusPillar = weakestPillar(ctx.pillars);
  const deload = isDeloadWeek(ctx.weekIndex);

  const base = {
    focusPillar,
    muscleGroups: PILLAR_FOCUS[focusPillar],
    isDeloadWeek: deload,
    recovery,
    conservative,
  };

  // §21: no challenge prompts at all in the medical-stop state.
  if (requiresMedicalStop(ctx.readiness)) {
    return {
      ...base,
      progression: {
        variable: 'none',
        reason: 'hold',
        loadKg: ctx.currentLoadKg,
        reps: ctx.currentReps,
      },
      motivationalLine:
        'Nothing is scheduled while you get this checked. Your rank and your record are exactly where you left them.',
      suppressed: 'medical_stop',
    };
  }

  // §16: an injury or illness pause carries no prompting.
  if (ctx.paused) {
    return {
      ...base,
      progression: {
        variable: 'none',
        reason: 'hold',
        loadKg: ctx.currentLoadKg,
        reps: ctx.currentReps,
      },
      motivationalLine: 'Recovery is the training right now. Nothing is decaying while you do it.',
      suppressed: 'paused',
    };
  }

  const progression = nextProgressionStep({
    currentLoadKg: ctx.currentLoadKg,
    currentReps: ctx.currentReps,
    weeksAtLoad: ctx.weeksAtLoad,
    weekIndex: ctx.weekIndex,
    conservative,
    returning: recovery.state === 'DETRAINED',
  });

  return {
    ...base,
    progression,
    motivationalLine: MOTIVATIONAL_LINES[ctx.personality][recovery.state],
    suppressed: null,
  };
}

/**
 * Human-readable description of a progression step, for the session screen.
 * Separate from the recommendation so the line bank stays auditable.
 */
export function describeProgression(step: ProgressionStep): string {
  switch (step.variable) {
    case 'load':
      return `${step.fromKg} kg → ${step.toKg} kg, same ${step.reps} reps. One variable at a time.`;
    case 'reps':
      return `${step.fromReps} → ${step.toReps} reps at ${step.loadKg} kg. Own the weight before you add to it.`;
    case 'none':
      if (step.reason === 'deload')
        return `Deload week. ${step.loadKg} kg for ${step.reps} reps — lighter on purpose, and part of the programme.`;
      if (step.reason === 'returning')
        return `Returning block. ${step.loadKg} kg for ${step.reps} reps. Earn the old numbers back.`;
      return 'Nothing scheduled.';
    default:
      return assertNeverStep(step);
  }
}

function assertNeverStep(step: never): string {
  throw new Error(`unhandled progression step: ${JSON.stringify(step)}`);
}

/** Weeks until the next mandatory deload, for the coach hub. */
export function weeksUntilDeload(weekIndex: number): number {
  const next = Math.ceil((weekIndex + 1) / DELOAD_EVERY_N_WEEKS) * DELOAD_EVERY_N_WEEKS;
  return next - (weekIndex + 1);
}
