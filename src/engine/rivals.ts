import { type Pillar, type Tier, tierIndex } from './types';

/**
 * §11 — RIVALS. "The sharpest social hook."
 *
 * "An operator may hold up to 3 rivals: users within ±1 tier. A weekly
 * head-to-head on a single agreed pillar. Winner takes ladder points. Rivalry
 * records persist across seasons and are displayed on the profile."
 */

export const MAX_RIVALS = 3;
export const RIVAL_TIER_SPREAD = 1;
export const RIVAL_WEEK_LADDER_POINTS = 25;

export interface RivalCandidate {
  operatorId: string;
  displayName: string;
  tier: Tier;
  cityId: string | null;
  venueId: string | null;
  /** Operators who have opted out of rival invitations. */
  acceptingRivals: boolean;
}

export interface Rivalry {
  id: string;
  operatorId: string;
  rivalOperatorId: string;
  /** §11: "a single agreed pillar" — both sides must accept it. */
  pillar: Pillar;
  status: 'PENDING' | 'ACTIVE' | 'ENDED';
  /** Persists across seasons — §11. */
  record: { wins: number; losses: number; draws: number };
  currentWeekStartedAt: string;
}

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

export function isEligibleRival(operatorTier: Tier, candidate: RivalCandidate): boolean {
  if (!candidate.acceptingRivals) return false;
  return Math.abs(tierIndex(operatorTier) - tierIndex(candidate.tier)) <= RIVAL_TIER_SPREAD;
}

export interface SuggestionContext {
  operatorId: string;
  operatorTier: Tier;
  operatorCityId: string | null;
  operatorVenueId: string | null;
  currentRivalIds: string[];
  candidates: RivalCandidate[];
}

/**
 * §11: "Auto-suggest rivals from the same city or venue."
 *
 * Ranked: same venue first, then same city, then anyone in range. Locality is
 * weighted heavily on purpose — §12's whole argument is that a user in a smaller
 * market needs a realistic, nearby ladder to care about.
 */
export function suggestRivals(ctx: SuggestionContext, limit = 5): RivalCandidate[] {
  const slotsLeft = MAX_RIVALS - ctx.currentRivalIds.length;
  if (slotsLeft <= 0) return [];

  const scored = ctx.candidates
    .filter((c) => c.operatorId !== ctx.operatorId)
    .filter((c) => !ctx.currentRivalIds.includes(c.operatorId))
    .filter((c) => isEligibleRival(ctx.operatorTier, c))
    .map((candidate) => {
      let score = 0;
      if (ctx.operatorVenueId && candidate.venueId === ctx.operatorVenueId) score += 100;
      if (ctx.operatorCityId && candidate.cityId === ctx.operatorCityId) score += 50;
      // A same-tier rival is a sharper match than one a tier away.
      score += 10 - Math.abs(tierIndex(ctx.operatorTier) - tierIndex(candidate.tier)) * 5;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.candidate);
}

export function canAddRival(currentRivalIds: string[]): boolean {
  return currentRivalIds.length < MAX_RIVALS;
}

// ---------------------------------------------------------------------------
// Weekly head-to-head
// ---------------------------------------------------------------------------

export interface RivalWeekResult {
  outcome: 'operator' | 'rival' | 'draw';
  operatorScore: number;
  rivalScore: number;
  ladderPointsToOperator: number;
  ladderPointsToRival: number;
  /** Written result copy — §14 owns the voice line, this is the record entry. */
  summary: string;
  updatedRecord: Rivalry['record'];
}

/**
 * Scored on pillar points gained in the agreed pillar over the week — not on
 * absolute pillar score. A COBALT and a STORM rival are therefore competing on
 * rate of improvement, which is the only comparison that is fair across a
 * one-tier spread.
 *
 * A draw splits the points rather than voiding them: two people who both trained
 * hard should not both walk away with nothing.
 */
export function resolveRivalWeek(
  rivalry: Rivalry,
  operatorPillarGain: number,
  rivalPillarGain: number,
  names: { operator: string; rival: string },
): RivalWeekResult {
  const operatorScore = Math.round(operatorPillarGain * 100) / 100;
  const rivalScore = Math.round(rivalPillarGain * 100) / 100;

  if (operatorScore > rivalScore) {
    return {
      outcome: 'operator',
      operatorScore,
      rivalScore,
      ladderPointsToOperator: RIVAL_WEEK_LADDER_POINTS,
      ladderPointsToRival: 0,
      summary: `${names.operator} took the week on ${rivalry.pillar}, ${operatorScore} to ${rivalScore}.`,
      updatedRecord: { ...rivalry.record, wins: rivalry.record.wins + 1 },
    };
  }

  if (rivalScore > operatorScore) {
    return {
      outcome: 'rival',
      operatorScore,
      rivalScore,
      ladderPointsToOperator: 0,
      ladderPointsToRival: RIVAL_WEEK_LADDER_POINTS,
      summary: `${names.rival} took the week on ${rivalry.pillar}, ${rivalScore} to ${operatorScore}.`,
      updatedRecord: { ...rivalry.record, losses: rivalry.record.losses + 1 },
    };
  }

  const split = Math.round(RIVAL_WEEK_LADDER_POINTS / 2);
  return {
    outcome: 'draw',
    operatorScore,
    rivalScore,
    ladderPointsToOperator: split,
    ladderPointsToRival: split,
    summary: `Dead level on ${rivalry.pillar}, ${operatorScore} apiece. Run it back.`,
    updatedRecord: { ...rivalry.record, draws: rivalry.record.draws + 1 },
  };
}

/** Profile display — §11: rivalry records persist and are shown. */
export function formatRivalryRecord(record: Rivalry['record']): string {
  return `${record.wins}W · ${record.losses}L · ${record.draws}D`;
}
