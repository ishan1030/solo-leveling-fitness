import { type Tier, tierFromIndex, tierIndex } from './types';

/**
 * §17 — SEASONS & PASS.
 *
 * "SEASON LENGTH: 13 weeks. Fixed. Not a range."
 */

export const SEASON_LENGTH_WEEKS = 13;
export const SEASON_LENGTH_DAYS = SEASON_LENGTH_WEEKS * 7;
export const PASS_TIER_COUNT = 50;

export interface SeasonState {
  seasonNumber: number;
  startedAt: string;
  endsAt: string;
}

export function seasonEndDate(startedAt: Date): Date {
  const end = new Date(startedAt);
  end.setUTCDate(end.getUTCDate() + SEASON_LENGTH_DAYS);
  return end;
}

export function daysRemainingInSeason(season: SeasonState, now: Date): number {
  const ms = new Date(season.endsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// ---------------------------------------------------------------------------
// §17 — Partial reset
// ---------------------------------------------------------------------------

/**
 * "PARTIAL RESET means exactly:
 *    RESET    — ladder points, seasonal quest progress, season leaderboard position
 *    PERSISTS — level, XP, pillar stats, achievements, titles, guild, rivalry records
 *    SOFT     — tier floors at one below season-peak tier"
 *
 * The shape of this type is the specification: every field an operator carries
 * is listed in exactly one of the three groups, so a future field cannot be
 * added without a decision about which group it belongs to.
 */
export interface SeasonCarryOver {
  reset: {
    ladderPoints: 0;
    seasonalQuestProgress: Record<string, never>;
    seasonLeaderboardPosition: null;
  };
  persists: {
    level: number;
    xpIntoLevel: number;
    pillars: { strength: number; endurance: number; consistency: number; mobility: number };
    achievementIds: string[];
    titleIds: string[];
    guildId: string | null;
    rivalryRecords: { rivalOperatorId: string; wins: number; losses: number; draws: number }[];
  };
  soft: {
    /** Tier the operator starts the new season at. */
    startingTier: Tier;
    seasonPeakTier: Tier;
  };
}

export interface SeasonRolloverInput {
  level: number;
  xpIntoLevel: number;
  pillars: SeasonCarryOver['persists']['pillars'];
  achievementIds: string[];
  titleIds: string[];
  guildId: string | null;
  rivalryRecords: SeasonCarryOver['persists']['rivalryRecords'];
  seasonPeakTier: Tier;
  currentTier: Tier;
}

/**
 * §17 SOFT: "tier floors at one below season-peak tier."
 *
 * This is a genuine partial reset, bounded to exactly one tier. An operator who
 * ends the season at their peak starts the next one a single tier down — that is
 * the reset. An operator who already sits below that line keeps their real,
 * lower tier: the rule bounds how far anyone falls, it never pushes someone up
 * to a tier they cannot currently hold.
 *
 * So the new tier is the LOWER of (current tier, one below season peak), which
 * is also why a season reset can never cost more than one tier no matter how far
 * above the line an operator finished.
 */
export function rolloverSeason(input: SeasonRolloverInput): SeasonCarryOver {
  const floorIndex = Math.max(0, tierIndex(input.seasonPeakTier) - 1);
  const startingTier = tierFromIndex(Math.min(tierIndex(input.currentTier), floorIndex));

  return {
    reset: {
      ladderPoints: 0,
      seasonalQuestProgress: {},
      seasonLeaderboardPosition: null,
    },
    persists: {
      level: input.level,
      xpIntoLevel: input.xpIntoLevel,
      pillars: input.pillars,
      achievementIds: input.achievementIds,
      titleIds: input.titleIds,
      guildId: input.guildId,
      rivalryRecords: input.rivalryRecords,
    },
    soft: {
      startingTier,
      seasonPeakTier: startingTier,
    },
  };
}

// ---------------------------------------------------------------------------
// §17 — Season rewards
// ---------------------------------------------------------------------------

export interface SeasonReward {
  kind: 'TITLE' | 'GUILD_BANNER' | 'CHAMPION_MARK';
  id: string;
  label: string;
  permanent: boolean;
}

/**
 * "top 100 → seasonal title; top guilds → guild banner; season winner →
 * permanent champion mark."
 */
export function seasonRewardsFor(
  placement: number,
  seasonNumber: number,
  isTopGuild: boolean,
): SeasonReward[] {
  const rewards: SeasonReward[] = [];

  if (placement === 1) {
    rewards.push({
      kind: 'CHAMPION_MARK',
      id: `champion_s${seasonNumber}`,
      label: `Season ${seasonNumber} Champion`,
      permanent: true,
    });
  }

  if (placement <= 100) {
    rewards.push({
      kind: 'TITLE',
      id: `title_s${seasonNumber}_top100`,
      label: `Season ${seasonNumber} Ascendant`,
      permanent: true,
    });
  }

  if (isTopGuild) {
    rewards.push({
      kind: 'GUILD_BANNER',
      id: `banner_s${seasonNumber}`,
      label: `Season ${seasonNumber} Guild Banner`,
      permanent: true,
    });
  }

  return rewards;
}

// ---------------------------------------------------------------------------
// §17 — The pass
// ---------------------------------------------------------------------------

export type PassTrack = 'FREE' | 'PAID';

export interface PassTier {
  tier: number;
  /** §18: paid track contains cosmetics and titles exclusively. */
  freeReward: { kind: 'COSMETIC' | 'TITLE' | 'XP'; id: string } | null;
  paidReward: { kind: 'COSMETIC' | 'TITLE'; id: string } | null;
}

export const PASS_XP_PER_TIER = 1000;

/**
 * §17: "Tier XP is earned through quests ONLY and can never be purchased."
 *
 * The signature enforces this: there is no parameter through which purchased
 * XP could enter. A purchase path would require changing this function, which
 * would surface in review.
 */
export function passTierForXp(questXpThisSeason: number): number {
  return Math.min(PASS_TIER_COUNT, Math.floor(questXpThisSeason / PASS_XP_PER_TIER));
}

export function passProgressWithinTier(questXpThisSeason: number): {
  tier: number;
  xpIntoTier: number;
  xpForNextTier: number;
} {
  const tier = passTierForXp(questXpThisSeason);
  if (tier >= PASS_TIER_COUNT) {
    return { tier, xpIntoTier: PASS_XP_PER_TIER, xpForNextTier: PASS_XP_PER_TIER };
  }
  return {
    tier,
    xpIntoTier: questXpThisSeason % PASS_XP_PER_TIER,
    xpForNextTier: PASS_XP_PER_TIER,
  };
}

// ---------------------------------------------------------------------------
// §17 — Archive
// ---------------------------------------------------------------------------

/** "permanent per-season record ... displayed as a career timeline on the profile." */
export interface SeasonArchiveEntry {
  seasonNumber: number;
  endedAt: string;
  tier: Tier;
  level: number;
  cps: number;
  placement: number | null;
  titleIds: string[];
}

export function appendToArchive(
  archive: SeasonArchiveEntry[],
  entry: SeasonArchiveEntry,
): SeasonArchiveEntry[] {
  // The archive is append-only by construction: entries are never rewritten,
  // because a career timeline that can be edited is not a record.
  if (archive.some((e) => e.seasonNumber === entry.seasonNumber)) return archive;
  return [...archive, entry].sort((a, b) => a.seasonNumber - b.seasonNumber);
}
