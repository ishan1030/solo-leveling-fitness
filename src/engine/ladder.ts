import { type Tier, type VerificationTier, isVerified, tierIndex } from './types';
import { isLeaderboardEligible } from './verification';

/**
 * §10 / §12 — leaderboard construction.
 *
 * The filter is applied **before** ranking, not after. §10 requires that
 * "leaderboards above COBALT display verified operators only"; if an unverified
 * operator were ranked and then hidden, the board would show gaps at ranks 3, 7
 * and 11, which is both worse-looking and more informative to a cheater than
 * simply not ranking them.
 */

export interface LadderEntry {
  operatorId: string;
  displayName: string;
  tier: Tier;
  cps: number;
  level: number;
  verification: VerificationTier;
  venueId: string | null;
  cityId: string;
  ladderPoints: number;
}

export type LadderScope =
  | { kind: 'global' }
  | { kind: 'city'; cityId: string }
  | { kind: 'venue'; venueId: string }
  | { kind: 'tier'; tier: Tier };

export interface RankedEntry<T extends LadderEntry> {
  entry: T;
  rank: number;
}

export interface LadderOptions {
  /** §10: boards at or above this tier are verified-only. Default STORM. */
  verifiedOnlyFromTier?: Tier;
  limit?: number;
}

/**
 * Filters, sorts and ranks. Ties on ladder points break on CPS, then on name, so
 * the ordering is stable across refreshes — a leaderboard where two tied
 * operators swap places on every poll reads as broken.
 */
export function buildLadder<T extends LadderEntry>(
  entries: T[],
  scope: LadderScope,
  options: LadderOptions = {},
): RankedEntry<T>[] {
  const verifiedFrom = options.verifiedOnlyFromTier ?? 'STORM';

  const inScope = entries.filter((entry) => {
    switch (scope.kind) {
      case 'global':
        return true;
      case 'city':
        return entry.cityId === scope.cityId;
      case 'venue':
        return entry.venueId === scope.venueId;
      case 'tier':
        return entry.tier === scope.tier;
      default:
        return assertNeverScope(scope);
    }
  });

  const eligible = inScope.filter((entry) =>
    isLeaderboardEligible(entry.tier, entry.verification, verifiedFrom),
  );

  const sorted = [...eligible].sort(
    (a, b) =>
      b.ladderPoints - a.ladderPoints ||
      b.cps - a.cps ||
      a.displayName.localeCompare(b.displayName),
  );

  const ranked = sorted.map((entry, index) => ({ entry, rank: index + 1 }));
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}

function assertNeverScope(scope: never): boolean {
  throw new Error(`unhandled ladder scope: ${JSON.stringify(scope)}`);
}

/**
 * Operators excluded from a board purely because they are unverified.
 *
 * Surfaced deliberately. §6 requires the trust cap to read as an invitation
 * rather than a punishment, and the honest way to do that on a leaderboard is to
 * say "4 operators are scoring high enough for this board but are not verified"
 * — which is simultaneously an explanation and an advertisement for the moat.
 */
export function withheldForVerification<T extends LadderEntry>(
  entries: T[],
  scope: LadderScope,
  options: LadderOptions = {},
): T[] {
  const verifiedFrom = options.verifiedOnlyFromTier ?? 'STORM';

  return entries.filter((entry) => {
    const inScope =
      scope.kind === 'global' ||
      (scope.kind === 'city' && entry.cityId === scope.cityId) ||
      (scope.kind === 'venue' && entry.venueId === scope.venueId) ||
      (scope.kind === 'tier' && entry.tier === scope.tier);

    if (!inScope) return false;
    // Would have made the board on capability, but is not verified.
    return (
      tierIndex(entry.tier) >= tierIndex(verifiedFrom) && !isVerified(entry.verification)
    );
  });
}

/**
 * The operator's own rank, computed independently of the paged board.
 *
 * docs/15 specifies this as a separate always-live query, because "where am I?"
 * is the only ranking question anyone asks about themselves and it must not
 * depend on a materialised view being fresh.
 */
export function rankOf<T extends LadderEntry>(
  entries: T[],
  operatorId: string,
  scope: LadderScope,
  options: LadderOptions = {},
): number | null {
  const ranked = buildLadder(entries, scope, { ...options, limit: undefined });
  const found = ranked.find((r) => r.entry.operatorId === operatorId);
  return found ? found.rank : null;
}

// ---------------------------------------------------------------------------
// §12 — Territory
// ---------------------------------------------------------------------------

export interface VenueStanding {
  venueId: string;
  venueName: string;
  cityId: string;
  memberCount: number;
  /** Sum of member ladder points. */
  points: number;
  rank: number;
}

/**
 * §12: "Every verified session contributes points to the operator's home venue
 * and city."
 *
 * Unverified operators contribute nothing to territory. A venue's standing is a
 * claim about people who physically trained there, so an unverified operator —
 * who by definition did not scan in — cannot move it.
 */
export function buildVenueStandings<T extends LadderEntry>(
  entries: T[],
  venues: { id: string; name: string; cityId: string }[],
  scope: { cityId: string } | 'national',
): VenueStanding[] {
  const relevantVenues =
    scope === 'national' ? venues : venues.filter((v) => v.cityId === scope.cityId);

  const standings = relevantVenues.map((venue) => {
    const members = entries.filter(
      (entry) => entry.venueId === venue.id && isVerified(entry.verification),
    );
    return {
      venueId: venue.id,
      venueName: venue.name,
      cityId: venue.cityId,
      memberCount: members.length,
      points: members.reduce((sum, member) => sum + member.ladderPoints, 0),
      rank: 0,
    };
  });

  return standings
    .sort((a, b) => b.points - a.points || a.venueName.localeCompare(b.venueName))
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}
