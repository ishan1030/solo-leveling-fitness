import { PILLARS, type Pillar, type PillarScores } from './types';

/**
 * §8 — QUEST ENGINE.
 *
 * Generation rules, quoted from the spec and each enforced by a named function
 * below so they can be tested individually:
 *   - never two consecutive days targeting the same muscle group
 *   - never schedule a quest on a declared rest day
 *   - scale to the operator's logged capacity, not their tier
 */

export type QuestKind = 'DAILY_PRIMARY' | 'DAILY_OPTIONAL' | 'WEEKLY' | 'ANOMALY' | 'TRIAL';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'full_body'
  | 'cardio';

export interface Quest {
  id: string;
  kind: QuestKind;
  title: string;
  /** User-facing objective. Written, never templated at runtime. */
  objective: string;
  pillar: Pillar;
  muscleGroup: MuscleGroup;
  /** Target value in the unit implied by `targetUnit`. */
  target: number;
  targetUnit: 'reps' | 'kg_volume' | 'metres' | 'seconds' | 'sessions';
  /** §8: primary awards XP; optionals award pillar points. */
  rewardXp: number;
  rewardPillarPoints: number;
  expiresAt: string;
}

export interface QuestGenerationContext {
  operatorId: string;
  pillars: PillarScores;
  /** Days the operator declared available, 0 = Sunday. */
  availableDays: number[];
  /** Days declared as rest. Must never receive a quest. */
  restDays: number[];
  /** Muscle groups hit on the previous calendar day. */
  previousDayMuscleGroups: MuscleGroup[];
  /**
   * §8: "scale to the operator's logged capacity, not their tier."
   * Rolling median of the operator's own recent sessions, per unit.
   */
  loggedCapacity: {
    medianRepsPerSession: number;
    medianVolumeKgPerSession: number;
    medianDistanceMPerSession: number;
  };
  /** §21: when true, all challenge prompts are suppressed. */
  medicalStopActive: boolean;
  /** §16: an active injury/illness pause also suppresses quests. */
  paused: boolean;
  now: Date;
}

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

/** §8: quests target the operator's weakest pillar. */
export function weakestPillar(pillars: PillarScores): Pillar {
  let weakest: Pillar = PILLARS[0];
  for (const pillar of PILLARS) {
    if (pillars[pillar] < pillars[weakest]) weakest = pillar;
  }
  return weakest;
}

/** Ordered weakest-first, used to pick fallbacks when the first choice collides. */
export function pillarsByWeakness(pillars: PillarScores): Pillar[] {
  return [...PILLARS].sort((a, b) => pillars[a] - pillars[b]);
}

/** §8: "never schedule a quest on a declared rest day". */
export function isRestDay(date: Date, restDays: number[]): boolean {
  return restDays.includes(date.getUTCDay());
}

/** §8: "never two consecutive days targeting the same muscle group". */
export function allowedMuscleGroups(
  candidates: MuscleGroup[],
  previousDayMuscleGroups: MuscleGroup[],
): MuscleGroup[] {
  const filtered = candidates.filter((g) => !previousDayMuscleGroups.includes(g));
  // If every candidate collides, fall back to full_body rather than emitting
  // nothing — an operator must never open the app to an empty quest board.
  return filtered.length > 0 ? filtered : ['full_body'];
}

const PILLAR_MUSCLE_GROUPS: Record<Pillar, MuscleGroup[]> = {
  strength: ['chest', 'back', 'legs', 'shoulders', 'arms'],
  endurance: ['cardio', 'legs', 'full_body'],
  consistency: ['full_body'],
  mobility: ['core', 'shoulders', 'legs'],
};

/**
 * §8: "scale to the operator's logged capacity, not their tier."
 *
 * A daily primary asks for ~85% of a typical session, so it is reliably
 * achievable; the weekly asks for ~3.2 sessions' worth of accumulated work.
 * Neither formula reads tier or CPS — deliberately, so that a STORM operator
 * returning from injury is not handed a STORM-sized quest.
 */
export function scaleTarget(
  capacity: number,
  kind: QuestKind,
  floor: number,
): number {
  const multiplier = kind === 'WEEKLY' ? 3.2 : kind === 'DAILY_PRIMARY' ? 0.85 : 0.5;
  return Math.max(floor, Math.round(capacity * multiplier));
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface DailyQuestSet {
  primary: Quest | null;
  optional: Quest[];
  /** Why nothing was generated, when nothing was. */
  suppressedReason: 'rest_day' | 'medical_stop' | 'paused' | null;
}

function endOfDay(now: Date): string {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  return end.toISOString();
}

function unitForPillar(pillar: Pillar): Quest['targetUnit'] {
  if (pillar === 'endurance') return 'metres';
  if (pillar === 'mobility') return 'seconds';
  if (pillar === 'consistency') return 'sessions';
  return 'reps';
}

function capacityForPillar(pillar: Pillar, ctx: QuestGenerationContext): number {
  if (pillar === 'endurance') return ctx.loggedCapacity.medianDistanceMPerSession;
  if (pillar === 'consistency') return ctx.availableDays.length;
  if (pillar === 'mobility') return 240;
  return ctx.loggedCapacity.medianRepsPerSession;
}

function floorForPillar(pillar: Pillar): number {
  if (pillar === 'endurance') return 800;
  if (pillar === 'consistency') return 1;
  if (pillar === 'mobility') return 120;
  return 15;
}

function objectiveFor(
  pillar: Pillar,
  group: MuscleGroup,
  target: number,
  unit: Quest['targetUnit'],
  kind: QuestKind,
): string {
  const weekly = kind === 'WEEKLY';
  switch (unit) {
    case 'metres':
      return `Cover ${(target / 1000).toFixed(1)} km at any pace you can hold.`;
    case 'seconds':
      return `Accumulate ${Math.round(target / 60)} minutes of ${group} mobility work.`;
    case 'sessions':
      // A daily quest that says "this week" is the kind of copy bug that only
      // shows up once the board is on screen under a TODAY heading.
      return weekly
        ? `Log ${target} ${target === 1 ? 'session' : 'sessions'} this week.`
        : `Train today. One session, whatever you have in you.`;
    case 'kg_volume':
      return `Move ${target} kg of total volume.`;
    case 'reps':
    default:
      return `Complete ${target} quality ${group} reps across as many sets as you need.`;
  }
}

const TITLES: Record<Pillar, string> = {
  strength: 'LOAD',
  endurance: 'DISTANCE',
  consistency: 'ATTENDANCE',
  mobility: 'RANGE',
};

/**
 * §8: "1 primary + 2 optional, generated from the operator's weakest pillar and
 * their declared available days. Primary awards XP; optionals award pillar
 * points."
 */
export function generateDailyQuests(ctx: QuestGenerationContext): DailyQuestSet {
  // §21: challenge prompts are suppressed entirely in the medical-stop state.
  if (ctx.medicalStopActive) {
    return { primary: null, optional: [], suppressedReason: 'medical_stop' };
  }
  // §16: an injury or illness pause carries no penalty and no prompting.
  if (ctx.paused) {
    return { primary: null, optional: [], suppressedReason: 'paused' };
  }
  if (isRestDay(ctx.now, ctx.restDays)) {
    return { primary: null, optional: [], suppressedReason: 'rest_day' };
  }

  const ranked = pillarsByWeakness(ctx.pillars);
  const expiresAt = endOfDay(ctx.now);

  const build = (pillar: Pillar, kind: QuestKind, index: number): Quest => {
    const groups = allowedMuscleGroups(PILLAR_MUSCLE_GROUPS[pillar], ctx.previousDayMuscleGroups);
    const group = groups[index % groups.length]!;
    const unit = unitForPillar(pillar);
    const target = scaleTarget(capacityForPillar(pillar, ctx), kind, floorForPillar(pillar));

    return {
      id: `q_${ctx.operatorId}_${kind.toLowerCase()}_${index}_${expiresAt.slice(0, 10)}`,
      kind,
      title: TITLES[pillar],
      objective: objectiveFor(pillar, group, target, unit, kind),
      pillar,
      muscleGroup: group,
      target,
      targetUnit: unit,
      rewardXp: kind === 'DAILY_PRIMARY' ? 120 : 0,
      rewardPillarPoints: kind === 'DAILY_PRIMARY' ? 0 : 0.25,
      expiresAt,
    };
  };

  const primaryPillar = ranked[0]!;
  const primary = build(primaryPillar, 'DAILY_PRIMARY', 0);

  // Optionals draw from the next two weakest pillars, so a day's board never
  // stacks three quests onto one already-fatigued system.
  const optional = [build(ranked[1]!, 'DAILY_OPTIONAL', 1), build(ranked[2]!, 'DAILY_OPTIONAL', 2)];

  return { primary, optional, suppressedReason: null };
}

/** §8: "cumulative target (volume, distance, or session count)." */
export function generateWeeklyQuest(ctx: QuestGenerationContext): Quest | null {
  if (ctx.medicalStopActive || ctx.paused) return null;

  const pillar = weakestPillar(ctx.pillars);
  const unit = unitForPillar(pillar);
  const target = scaleTarget(capacityForPillar(pillar, ctx), 'WEEKLY', floorForPillar(pillar) * 3);
  const expires = new Date(ctx.now);
  expires.setUTCDate(expires.getUTCDate() + 7);

  return {
    id: `q_${ctx.operatorId}_weekly_${ctx.now.toISOString().slice(0, 10)}`,
    kind: 'WEEKLY',
    title: `WEEKLY ${TITLES[pillar]}`,
    objective: objectiveFor(pillar, 'full_body', target, unit, 'WEEKLY'),
    pillar,
    muscleGroup: 'full_body',
    target,
    targetUnit: unit,
    rewardXp: 500,
    rewardPillarPoints: 0.5,
    expiresAt: expires.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// §8 — ANOMALY: hidden quests unlocked by behaviour patterns
// ---------------------------------------------------------------------------

export type AnomalyTrigger =
  | 'DAWN_PATROL'
  | 'NOMAD'
  | 'RIVALRY_STREAK'
  | 'IRON_WEEK'
  | 'LONG_HAUL';

export interface AnomalyDefinition {
  trigger: AnomalyTrigger;
  title: string;
  /** Shown only after discovery — §8: "Discovery must feel earned." */
  revealCopy: string;
  rewardXp: number;
}

export const ANOMALIES: Record<AnomalyTrigger, AnomalyDefinition> = {
  DAWN_PATROL: {
    trigger: 'DAWN_PATROL',
    title: 'DAWN PATROL',
    revealCopy: 'Five sessions before six in the morning. Most operators never see this one.',
    rewardXp: 900,
  },
  NOMAD: {
    trigger: 'NOMAD',
    title: 'NOMAD',
    revealCopy: 'Three different venues inside a month. You train wherever you land.',
    rewardXp: 750,
  },
  RIVALRY_STREAK: {
    trigger: 'RIVALRY_STREAK',
    title: 'HELD THE LINE',
    revealCopy: 'Three rival weeks won back to back. Someone out there has noticed.',
    rewardXp: 1200,
  },
  IRON_WEEK: {
    trigger: 'IRON_WEEK',
    title: 'IRON WEEK',
    revealCopy: 'Every scheduled session logged, every day, for a full week.',
    rewardXp: 600,
  },
  LONG_HAUL: {
    trigger: 'LONG_HAUL',
    title: 'LONG HAUL',
    revealCopy: 'Ninety days of continuous training. This is where capability actually changes.',
    rewardXp: 2000,
  },
};

export interface BehaviourSignals {
  sessionsBefore6amLast30Days: number;
  distinctVenuesLast30Days: number;
  consecutiveRivalWeeksWon: number;
  scheduledSessionsHitThisWeek: number;
  scheduledSessionsThisWeek: number;
  consecutiveTrainingDays: number;
  alreadyDiscovered: AnomalyTrigger[];
}

/**
 * Anomalies are evaluated after every session. They are never listed in advance
 * — the quest board shows no locked slot, no "???" row, no progress bar toward
 * one. Discovery has to be a surprise or it is just another checklist.
 */
export function detectAnomalies(signals: BehaviourSignals): AnomalyDefinition[] {
  const found: AnomalyDefinition[] = [];
  const isNew = (t: AnomalyTrigger) => !signals.alreadyDiscovered.includes(t);

  if (isNew('DAWN_PATROL') && signals.sessionsBefore6amLast30Days >= 5) {
    found.push(ANOMALIES.DAWN_PATROL);
  }
  if (isNew('NOMAD') && signals.distinctVenuesLast30Days >= 3) {
    found.push(ANOMALIES.NOMAD);
  }
  if (isNew('RIVALRY_STREAK') && signals.consecutiveRivalWeeksWon >= 3) {
    found.push(ANOMALIES.RIVALRY_STREAK);
  }
  if (
    isNew('IRON_WEEK') &&
    signals.scheduledSessionsThisWeek > 0 &&
    signals.scheduledSessionsHitThisWeek >= signals.scheduledSessionsThisWeek
  ) {
    found.push(ANOMALIES.IRON_WEEK);
  }
  if (isNew('LONG_HAUL') && signals.consecutiveTrainingDays >= 90) {
    found.push(ANOMALIES.LONG_HAUL);
  }

  return found;
}

// ---------------------------------------------------------------------------
// §8 — TRIAL: solo timed challenge, opt-in, leaderboarded, one per week
// ---------------------------------------------------------------------------

export interface Trial {
  id: string;
  title: string;
  objective: string;
  pillar: Pillar;
  /** Seconds. The clock is the whole point. */
  timeLimitSec: number;
  opensAt: string;
  closesAt: string;
}

const TRIAL_ROTATION: Omit<Trial, 'id' | 'opensAt' | 'closesAt'>[] = [
  {
    title: 'THE HUNDRED',
    objective: '100 push-ups. Break them up however you like. The clock does not stop.',
    pillar: 'strength',
    timeLimitSec: 600,
  },
  {
    title: 'FIVE FLAT',
    objective: 'Five kilometres. One continuous effort.',
    pillar: 'endurance',
    timeLimitSec: 2400,
  },
  {
    title: 'DEAD HANG',
    objective: 'Accumulate four minutes of dead hang in under ten.',
    pillar: 'strength',
    timeLimitSec: 600,
  },
  {
    title: 'GROUND WORK',
    objective: 'Ten minutes of continuous mobility flow, no rest longer than fifteen seconds.',
    pillar: 'mobility',
    timeLimitSec: 600,
  },
];

/** One per week, rotating deterministically so every operator sees the same trial. */
export function trialForWeek(weekIndex: number, now: Date): Trial {
  const template = TRIAL_ROTATION[weekIndex % TRIAL_ROTATION.length]!;
  const opens = new Date(now);
  const closes = new Date(now);
  closes.setUTCDate(closes.getUTCDate() + 7);

  return {
    ...template,
    id: `trial_w${weekIndex}`,
    opensAt: opens.toISOString(),
    closesAt: closes.toISOString(),
  };
}
