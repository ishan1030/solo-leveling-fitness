import { DEFAULT_PROGRESSION, type ProgressionConfig } from './config';
import {
  PILLARS,
  type OperatorProfile,
  type Pillar,
  type PillarScores,
  type Standing,
  type Tier,
  type VerificationTier,
  isVerified,
  tierFromIndex,
  tierIndex,
} from './types';

/**
 * §5 — THE PROGRESSION ENGINE.
 *
 * State machine (see docs/05-progression-state-machine.md for the diagram):
 *
 *   UNCALIBRATED
 *        │ completeCalibration()
 *        ▼
 *   ACTIVE ──────── logSession() ──────► ACTIVE      (stat gain, capped)
 *     │  ▲                                  │
 *     │  │                                  └─ weekly tick ─► reevaluateTier()
 *     │  │
 *     │  └── logSession() / resume() ── PAUSED   (injury or illness; no decay)
 *     │                                    ▲
 *     │                                    │ pauseFor()
 *     ├── 21 idle days ──► DECAYING ───────┘
 *     │                        │ logSession()
 *     └────────────────────────┘
 *
 * Every transition is a pure function of (profile, config, now). Nothing here
 * reads a clock or touches storage.
 */

// ---------------------------------------------------------------------------
// Composite Power Score
// ---------------------------------------------------------------------------

/**
 * §5: Strength 30% | Endurance 30% | Consistency 25% | Mobility 15%.
 * Returned to one decimal — the UI sets CPS in monospace and a jittering
 * hundredths digit would read as noise rather than as measurement.
 */
export function computeCps(
  pillars: PillarScores,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): number {
  let total = 0;
  for (const pillar of PILLARS) {
    total += pillars[pillar] * config.pillarWeights[pillar];
  }
  return round1(clamp(total, 0, 100));
}

/** §5: tier is DERIVED from CPS, never assigned. */
export function tierForCps(
  cps: number,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): Tier {
  let result: Tier = config.tierThresholds[0]!.tier;
  for (const threshold of config.tierThresholds) {
    if (cps >= threshold.minCps) result = threshold.tier;
    else break;
  }
  return result;
}

/** CPS the operator must reach to enter the next tier, or null at the ceiling. */
export function cpsForNextTier(
  cps: number,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): number | null {
  for (const threshold of config.tierThresholds) {
    if (threshold.minCps > cps) return threshold.minCps;
  }
  return null;
}

// ---------------------------------------------------------------------------
// §6 — Trust cap
// ---------------------------------------------------------------------------

/**
 * "Self-reported profiles are visibly marked UNVERIFIED and hard-capped at
 * COBALT. Onboarding alone can never produce an ECLIPSE. This rule is the
 * product's spine."
 *
 * Applied at every read, not at write time. Storing a capped tier would lose the
 * information needed to show the operator what they have already earned and are
 * being held back from — which is the whole motivational point of the cap.
 */
export function applyTrustCap(
  uncapped: Tier,
  verification: VerificationTier,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): Tier {
  if (isVerified(verification)) return uncapped;
  const capIndex = tierIndex(config.unverifiedTierCap);
  return tierIndex(uncapped) > capIndex ? config.unverifiedTierCap : uncapped;
}

// ---------------------------------------------------------------------------
// Levels — §5: "LEVEL is separate from TIER."
// ---------------------------------------------------------------------------

/**
 * §5: XP to next level = round(100 × level^1.4, nearest 10), capped at level 100.
 * Returns Infinity at max level so "progress to next" renders as complete rather
 * than dividing by zero.
 */
export function xpForNextLevel(
  level: number,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): number {
  if (level >= config.xp.maxLevel) return Infinity;
  const raw = config.xp.base * Math.pow(level, config.xp.exponent);
  return Math.round(raw / config.xp.roundTo) * config.xp.roundTo;
}

export interface LevelUpResult {
  level: number;
  xpIntoLevel: number;
  /** Every level crossed by this award, in order. Drives the §14 voice moments. */
  levelsGained: number[];
}

/**
 * Awards XP and resolves any number of level-ups in one pass. A single large
 * award (finishing a season pass tier, say) can cross several levels; each one
 * still fires its own moment.
 */
export function awardXp(
  level: number,
  xpIntoLevel: number,
  xpAwarded: number,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): LevelUpResult {
  if (xpAwarded < 0) throw new Error('xpAwarded must not be negative');

  let currentLevel = level;
  let currentXp = xpIntoLevel + xpAwarded;
  const levelsGained: number[] = [];

  while (currentLevel < config.xp.maxLevel) {
    const needed = xpForNextLevel(currentLevel, config);
    if (currentXp < needed) break;
    currentXp -= needed;
    currentLevel += 1;
    levelsGained.push(currentLevel);
  }

  // At max level XP stops accumulating rather than growing an unbounded number
  // the UI has no way to render.
  if (currentLevel >= config.xp.maxLevel) currentXp = 0;

  return { level: currentLevel, xpIntoLevel: currentXp, levelsGained };
}

// ---------------------------------------------------------------------------
// §5 — Stat gain, capped
// ---------------------------------------------------------------------------

/** Points already credited to each pillar inside the current rolling 7 days. */
export type RollingGain = PillarScores;

export const NO_ROLLING_GAIN: RollingGain = {
  strength: 0,
  endurance: 0,
  consistency: 0,
  mobility: 0,
};

export interface StatGainResult {
  pillars: PillarScores;
  /** What was actually credited after the weekly cap and the 0–100 clamp. */
  applied: PillarScores;
  /** What the cap withheld. Surfaced in the post-session summary, never hidden. */
  withheld: PillarScores;
  rollingGain: RollingGain;
}

/**
 * §5: "Gains are capped at +2.0 points per pillar per 7 days so no one can rush
 * a tier."
 *
 * The withheld amount is returned rather than discarded silently: the session
 * summary tells the operator "you earned +1.4 Strength, +0.6 held by the weekly
 * cap" so the ceiling reads as a rule of the game and not as a bug.
 */
export function applyStatGain(
  pillars: PillarScores,
  proposed: Partial<PillarScores>,
  rollingGain: RollingGain,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): StatGainResult {
  const nextPillars = { ...pillars };
  const applied = { ...NO_ROLLING_GAIN };
  const withheld = { ...NO_ROLLING_GAIN };
  const nextRolling = { ...rollingGain };

  for (const pillar of PILLARS) {
    const want = proposed[pillar] ?? 0;
    if (want <= 0) continue;

    const cap = config.statGain.maxPointsPerPillarPer7Days;
    const remainingUnderCap = Math.max(0, cap - rollingGain[pillar]);
    const afterWeeklyCap = Math.min(want, remainingUnderCap);

    // The 0–100 clamp can bite independently of the weekly cap, at the top of
    // a pillar the operator has already maxed.
    const headroom = Math.max(0, config.statGain.max - pillars[pillar]);
    const grant = round2(Math.min(afterWeeklyCap, headroom));

    nextPillars[pillar] = round2(pillars[pillar] + grant);
    applied[pillar] = grant;
    withheld[pillar] = round2(want - grant);
    nextRolling[pillar] = round2(rollingGain[pillar] + grant);
  }

  return { pillars: nextPillars, applied, withheld, rollingGain: nextRolling };
}

// ---------------------------------------------------------------------------
// §5 — Decay
// ---------------------------------------------------------------------------

export interface DecayResult {
  pillars: PillarScores;
  cpsLost: number;
  idleDays: number;
  isDecaying: boolean;
  /** Days remaining before decay starts. 0 once it has. */
  graceDaysRemaining: number;
}

/**
 * §5: "After 21 consecutive idle days: −1 CPS/day. Floors at one tier below
 * career peak. Never drops below ASH. Decay pauses entirely for logged injury
 * or illness."
 *
 * Decay is expressed as a CPS target, then pushed back through the pillar
 * weights, so a decayed profile stays internally consistent — its pillars still
 * multiply out to its displayed CPS.
 */
export function computeDecay(
  profile: OperatorProfile,
  now: Date,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): DecayResult {
  const currentCps = computeCps(profile.pillars, config);
  const unchanged: DecayResult = {
    pillars: profile.pillars,
    cpsLost: 0,
    idleDays: 0,
    isDecaying: false,
    graceDaysRemaining: config.decay.graceDays,
  };

  // §16/§21: a logged injury or illness pauses everything, with no penalty.
  if (profile.pausedFor !== null) return unchanged;
  if (profile.lastSessionDate === null) return unchanged;

  const idleDays = wholeDaysBetween(parseIsoDate(profile.lastSessionDate), now);
  if (idleDays <= config.decay.graceDays) {
    return {
      ...unchanged,
      idleDays,
      graceDaysRemaining: config.decay.graceDays - idleDays,
    };
  }

  const decayingDays = idleDays - config.decay.graceDays;
  const rawTarget = currentCps - decayingDays * config.decay.cpsPerDay;
  const floor = decayFloorCps(profile.careerPeakCps, config);
  const targetCps = Math.max(floor, rawTarget);

  if (targetCps >= currentCps) {
    return { ...unchanged, idleDays, isDecaying: true, graceDaysRemaining: 0 };
  }

  return {
    pillars: scalePillarsToCps(profile.pillars, targetCps, config),
    cpsLost: round1(currentCps - targetCps),
    idleDays,
    isDecaying: true,
    graceDaysRemaining: 0,
  };
}

/**
 * The floor is the bottom of the tier one below career peak — not the peak CPS
 * minus a constant. That keeps the promise legible: "you cannot fall more than
 * one tier below your best."
 */
export function decayFloorCps(
  careerPeakCps: number,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): number {
  const peakTier = tierForCps(careerPeakCps, config);
  const flooredIndex = Math.max(0, tierIndex(peakTier) - config.decay.floorTiersBelowPeak);
  const flooredTier = tierFromIndex(flooredIndex);
  const threshold = config.tierThresholds.find((t) => t.tier === flooredTier);
  return threshold ? threshold.minCps : 0;
}

/**
 * Rescales pillars proportionally so their weighted composite equals `targetCps`.
 *
 * Proportional rather than flat: a runner who stops training should lose their
 * standing across the board in the shape they built it, not have their strongest
 * pillar hollowed out first.
 */
export function scalePillarsToCps(
  pillars: PillarScores,
  targetCps: number,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): PillarScores {
  const currentCps = computeCps(pillars, config);
  if (currentCps <= 0) return pillars;
  const ratio = clamp(targetCps / currentCps, 0, 1);

  const next = {} as PillarScores;
  for (const pillar of PILLARS) {
    next[pillar] = round2(clamp(pillars[pillar] * ratio, config.statGain.min, config.statGain.max));
  }
  return next;
}

// ---------------------------------------------------------------------------
// §5 — Weekly tier re-evaluation
// ---------------------------------------------------------------------------

export interface ReevaluationInput {
  profile: OperatorProfile;
  /** Sessions logged inside the re-evaluation window. */
  sessionsInWindow: { verification: VerificationTier }[];
  now: Date;
}

export interface ReevaluationResult {
  ran: boolean;
  /** Why it did not run, when it did not. Shown verbatim in the UI. */
  blockedReason: 'insufficient_verified_sessions' | null;
  previousTier: Tier;
  newTier: Tier;
  changed: boolean;
  direction: 'up' | 'down' | 'none';
  standing: Standing;
}

/**
 * §5: "Runs weekly. Requires ≥1 verified session in the window."
 *
 * A window with no verified session does not demote the operator — it simply
 * does not move them. Demotion is the job of decay (§5), which has its own
 * 21-day grace period. Conflating the two would punish a light week.
 */
export function reevaluateTier(
  input: ReevaluationInput,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): ReevaluationResult {
  const { profile, sessionsInWindow } = input;
  const standing = computeStanding(profile, config);
  const previousTier = profile.seasonPeakTier;

  const verifiedCount = sessionsInWindow.filter((s) => isVerified(s.verification)).length;
  if (verifiedCount < config.reevaluation.minVerifiedSessionsInWindow) {
    return {
      ran: false,
      blockedReason: 'insufficient_verified_sessions',
      previousTier,
      newTier: previousTier,
      changed: false,
      direction: 'none',
      standing,
    };
  }

  const newTier = standing.tier;
  const delta = tierIndex(newTier) - tierIndex(previousTier);

  return {
    ran: true,
    blockedReason: null,
    previousTier,
    newTier,
    changed: delta !== 0,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'none',
    standing,
  };
}

// ---------------------------------------------------------------------------
// The read model
// ---------------------------------------------------------------------------

/**
 * The single function the UI calls. Every tier badge, ladder row and rank card
 * in the app resolves through here, so the trust cap cannot be forgotten at a
 * call site.
 */
export function computeStanding(
  profile: OperatorProfile,
  config: ProgressionConfig = DEFAULT_PROGRESSION,
): Standing {
  const cps = computeCps(profile.pillars, config);
  const uncappedTier = tierForCps(cps, config);
  const tier = applyTrustCap(uncappedTier, profile.verification, config);

  return {
    cps,
    tier,
    uncappedTier,
    trustCapped: tier !== uncappedTier,
    level: profile.level,
    xpIntoLevel: profile.xpIntoLevel,
    xpForNextLevel: xpForNextLevel(profile.level, config),
    verification: profile.verification,
  };
}

/**
 * §5: "A user can be Level 40 and still IRON. That tension is intentional and
 * must be communicated clearly in the UI so it reads as honest, not punishing."
 *
 * This returns the copy for that state. It is deliberately framed as a fact
 * about what the two numbers measure, never as a shortfall.
 */
export function describeLevelTierTension(standing: Standing): string | null {
  // Level is effort invested; tier is present capability. The gap is only worth
  // narrating once the operator has put in enough time to notice it.
  if (standing.level < 10) return null;
  const tierRank = tierIndex(standing.tier);
  const expectedRankForLevel = Math.floor(standing.level / 20);
  if (tierRank >= expectedRankForLevel) return null;

  return `Level ${standing.level} is time invested. ${standing.tier} is what you can do today. Both are real.`;
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Parses a yyyy-mm-dd date at UTC midnight. */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to`, floored at 0. */
export function wholeDaysBetween(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.round((toUtc - fromUtc) / 86_400_000));
}

export type { Pillar, PillarScores };
