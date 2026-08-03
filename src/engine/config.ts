import type { Pillar, Tier } from './types';

/**
 * §5: "Expose the curve as editable config, never hardcoded."
 *
 * Every tunable number in the progression system lives here as data. Nothing in
 * the engine reads a literal. `ProgressionConfig` is passed explicitly into the
 * pure functions, so a server-delivered config can replace `DEFAULT_PROGRESSION`
 * at runtime and every downstream calculation follows without a rebuild.
 */
export interface ProgressionConfig {
  /** Must sum to 1. Enforced by assertConfigValid. */
  pillarWeights: Record<Pillar, number>;

  /** Lower bound of each tier on the 0–100 CPS scale, ascending. */
  tierThresholds: { tier: Tier; minCps: number }[];

  xp: {
    /** XP to clear a level = round(base * level^exponent) rounded to `roundTo`. */
    base: number;
    exponent: number;
    roundTo: number;
    maxLevel: number;
  };

  statGain: {
    /** §5: max points a single pillar may gain in any rolling 7-day window. */
    maxPointsPerPillarPer7Days: number;
    /** Hard ceiling and floor on any pillar score. */
    min: number;
    max: number;
  };

  decay: {
    /** Idle days tolerated before decay begins. */
    graceDays: number;
    cpsPerDay: number;
    /** Decay floors this many tiers below career peak. */
    floorTiersBelowPeak: number;
  };

  reevaluation: {
    /** §5: tier re-evaluation runs weekly. */
    intervalDays: number;
    /** §5: and requires at least this many verified sessions in the window. */
    minVerifiedSessionsInWindow: number;
  };

  /** §6: self-reported profiles are hard-capped here. */
  unverifiedTierCap: Tier;
}

export const DEFAULT_PROGRESSION: ProgressionConfig = {
  pillarWeights: {
    strength: 0.3,
    endurance: 0.3,
    consistency: 0.25,
    mobility: 0.15,
  },

  tierThresholds: [
    { tier: 'ASH', minCps: 0 },
    { tier: 'IRON', minCps: 30 },
    { tier: 'COBALT', minCps: 45 },
    { tier: 'STORM', minCps: 60 },
    { tier: 'SOLAR', minCps: 75 },
    { tier: 'ECLIPSE', minCps: 90 },
  ],

  xp: {
    base: 100,
    exponent: 1.4,
    roundTo: 10,
    maxLevel: 100,
  },

  statGain: {
    maxPointsPerPillarPer7Days: 2.0,
    min: 0,
    max: 100,
  },

  decay: {
    graceDays: 21,
    cpsPerDay: 1,
    floorTiersBelowPeak: 1,
  },

  reevaluation: {
    intervalDays: 7,
    minVerifiedSessionsInWindow: 1,
  },

  unverifiedTierCap: 'COBALT',
};

/**
 * Guards the invariants the spec treats as fixed. Called once at app start and
 * again whenever a remote config is applied, so a bad payload fails loudly
 * instead of silently reshaping the ladder.
 */
export function assertConfigValid(config: ProgressionConfig): void {
  const weightSum = Object.values(config.pillarWeights).reduce((a, b) => a + b, 0);
  if (Math.abs(weightSum - 1) > 1e-9) {
    throw new Error(`pillarWeights must sum to 1, got ${weightSum}`);
  }

  const thresholds = config.tierThresholds;
  if (thresholds.length === 0) throw new Error('tierThresholds must not be empty');
  if (thresholds[0]!.minCps !== 0) {
    throw new Error('the lowest tier must start at CPS 0 so every score maps to a tier');
  }
  for (let i = 1; i < thresholds.length; i++) {
    if (thresholds[i]!.minCps <= thresholds[i - 1]!.minCps) {
      throw new Error('tierThresholds must be strictly ascending by minCps');
    }
  }

  if (config.xp.maxLevel < 1) throw new Error('maxLevel must be at least 1');
  if (config.statGain.min >= config.statGain.max) {
    throw new Error('statGain.min must be below statGain.max');
  }
}
