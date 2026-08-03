import { describe, expect, it } from 'vitest';
import {
  buildLadder,
  buildVenueStandings,
  rankOf,
  withheldForVerification,
  type LadderEntry,
} from './ladder';

function entry(overrides: Partial<LadderEntry> & { operatorId: string }): LadderEntry {
  return {
    displayName: overrides.operatorId,
    tier: 'STORM',
    cps: 65,
    level: 40,
    verification: 'QR_CHECK_IN',
    venueId: 'v1',
    cityId: 'bharatpur',
    ladderPoints: 1000,
    ...overrides,
  };
}

const VENUES = [
  { id: 'v1', name: 'Bharatpur Iron', cityId: 'bharatpur' },
  { id: 'v2', name: 'Narayani Strength Club', cityId: 'bharatpur' },
  { id: 'v3', name: 'Pulchowk Barbell', cityId: 'kathmandu' },
];

describe('buildLadder — §10 verified-only above COBALT', () => {
  const roster: LadderEntry[] = [
    entry({ operatorId: 'verified_top', tier: 'ECLIPSE', cps: 94, ladderPoints: 4000 }),
    entry({
      operatorId: 'unverified_high',
      tier: 'SOLAR',
      cps: 88,
      ladderPoints: 3800,
      verification: 'SELF_REPORTED',
    }),
    entry({ operatorId: 'verified_mid', tier: 'STORM', cps: 66, ladderPoints: 2600 }),
    entry({
      operatorId: 'unverified_low',
      tier: 'COBALT',
      cps: 50,
      ladderPoints: 2100,
      verification: 'SELF_REPORTED',
    }),
  ];

  it('excludes unverified operators at or above STORM', () => {
    const board = buildLadder(roster, { kind: 'global' });
    const ids = board.map((r) => r.entry.operatorId);
    expect(ids).not.toContain('unverified_high');
  });

  it('includes unverified operators below STORM', () => {
    const board = buildLadder(roster, { kind: 'global' });
    expect(board.map((r) => r.entry.operatorId)).toContain('unverified_low');
  });

  it('ranks contiguously with no gaps where an operator was filtered', () => {
    const board = buildLadder(roster, { kind: 'global' });
    expect(board.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('does not let an excluded operator occupy a rank slot', () => {
    // unverified_high has more ladder points than verified_mid. If the filter ran
    // after ranking, verified_mid would be rank 3 instead of rank 2.
    const board = buildLadder(roster, { kind: 'global' });
    const mid = board.find((r) => r.entry.operatorId === 'verified_mid')!;
    expect(mid.rank).toBe(2);
  });

  it('honours a custom verified-only threshold', () => {
    const board = buildLadder(roster, { kind: 'global' }, { verifiedOnlyFromTier: 'ECLIPSE' });
    expect(board.map((r) => r.entry.operatorId)).toContain('unverified_high');
  });
});

describe('buildLadder — scopes', () => {
  const roster: LadderEntry[] = [
    entry({ operatorId: 'a', cityId: 'bharatpur', venueId: 'v1', ladderPoints: 3000 }),
    entry({ operatorId: 'b', cityId: 'bharatpur', venueId: 'v2', ladderPoints: 2000 }),
    entry({ operatorId: 'c', cityId: 'kathmandu', venueId: 'v3', ladderPoints: 4000 }),
    entry({ operatorId: 'd', cityId: 'bharatpur', venueId: 'v1', ladderPoints: 1000, tier: 'IRON' }),
  ];

  it('filters to a city', () => {
    const board = buildLadder(roster, { kind: 'city', cityId: 'bharatpur' });
    expect(board.map((r) => r.entry.operatorId)).toEqual(['a', 'b', 'd']);
  });

  it('filters to a venue', () => {
    const board = buildLadder(roster, { kind: 'venue', venueId: 'v1' });
    expect(board.map((r) => r.entry.operatorId)).toEqual(['a', 'd']);
  });

  it('filters to a tier', () => {
    const board = buildLadder(roster, { kind: 'tier', tier: 'IRON' });
    expect(board.map((r) => r.entry.operatorId)).toEqual(['d']);
  });

  it('gives a smaller market a realistic top spot — §12', () => {
    // 'a' is only 2nd globally but 1st in Bharatpur. That is the entire argument
    // for city boards existing.
    const global = buildLadder(roster, { kind: 'global' });
    const city = buildLadder(roster, { kind: 'city', cityId: 'bharatpur' });
    expect(global[0]!.entry.operatorId).toBe('c');
    expect(city[0]!.entry.operatorId).toBe('a');
  });

  it('applies a limit', () => {
    expect(buildLadder(roster, { kind: 'global' }, { limit: 2 })).toHaveLength(2);
  });
});

describe('buildLadder — stable ordering', () => {
  it('breaks ladder-point ties on CPS, then on name', () => {
    const tied: LadderEntry[] = [
      entry({ operatorId: 'z', displayName: 'Zara', ladderPoints: 1000, cps: 60 }),
      entry({ operatorId: 'a', displayName: 'Aarav', ladderPoints: 1000, cps: 60 }),
      entry({ operatorId: 'm', displayName: 'Manish', ladderPoints: 1000, cps: 70 }),
    ];
    const board = buildLadder(tied, { kind: 'global' });
    expect(board.map((r) => r.entry.displayName)).toEqual(['Manish', 'Aarav', 'Zara']);
  });

  it('produces the same order on repeated builds', () => {
    const roster = [
      entry({ operatorId: 'a', ladderPoints: 1000 }),
      entry({ operatorId: 'b', ladderPoints: 1000 }),
      entry({ operatorId: 'c', ladderPoints: 1000 }),
    ];
    const first = buildLadder(roster, { kind: 'global' }).map((r) => r.entry.operatorId);
    const second = buildLadder(roster, { kind: 'global' }).map((r) => r.entry.operatorId);
    expect(first).toEqual(second);
  });
});

describe('withheldForVerification — §6, the cap as an invitation', () => {
  const roster: LadderEntry[] = [
    entry({ operatorId: 'verified', tier: 'SOLAR' }),
    entry({ operatorId: 'unverified_1', tier: 'SOLAR', verification: 'SELF_REPORTED' }),
    entry({ operatorId: 'unverified_2', tier: 'STORM', verification: 'SELF_REPORTED' }),
    entry({ operatorId: 'unverified_low', tier: 'IRON', verification: 'SELF_REPORTED' }),
  ];

  it('names operators excluded purely for being unverified', () => {
    const withheld = withheldForVerification(roster, { kind: 'global' });
    expect(withheld.map((e) => e.operatorId)).toEqual(['unverified_1', 'unverified_2']);
  });

  it('does not count operators below the threshold as withheld', () => {
    const withheld = withheldForVerification(roster, { kind: 'global' });
    expect(withheld.map((e) => e.operatorId)).not.toContain('unverified_low');
  });

  it('does not count verified operators as withheld', () => {
    const withheld = withheldForVerification(roster, { kind: 'global' });
    expect(withheld.map((e) => e.operatorId)).not.toContain('verified');
  });
});

describe('rankOf', () => {
  const roster = [
    entry({ operatorId: 'a', ladderPoints: 3000 }),
    entry({ operatorId: 'b', ladderPoints: 2000 }),
    entry({ operatorId: 'me', ladderPoints: 1000 }),
  ];

  it('finds an operator rank independent of any page limit', () => {
    expect(rankOf(roster, 'me', { kind: 'global' }, { limit: 1 })).toBe(3);
  });

  it('returns null for an operator not on the board', () => {
    expect(rankOf(roster, 'nobody', { kind: 'global' })).toBeNull();
  });

  it('returns null for an operator filtered out by the verification rule', () => {
    const withUnverified = [
      ...roster,
      entry({ operatorId: 'hidden', tier: 'ECLIPSE', verification: 'SELF_REPORTED' }),
    ];
    expect(rankOf(withUnverified, 'hidden', { kind: 'global' })).toBeNull();
  });
});

describe('buildVenueStandings — §12 territory', () => {
  const roster: LadderEntry[] = [
    entry({ operatorId: 'a', venueId: 'v1', ladderPoints: 3000 }),
    entry({ operatorId: 'b', venueId: 'v1', ladderPoints: 2000 }),
    entry({ operatorId: 'c', venueId: 'v2', ladderPoints: 4500 }),
    entry({ operatorId: 'd', venueId: 'v3', cityId: 'kathmandu', ladderPoints: 9000 }),
    entry({
      operatorId: 'unverified',
      venueId: 'v1',
      ladderPoints: 9999,
      verification: 'SELF_REPORTED',
      tier: 'COBALT',
    }),
  ];

  it('sums verified member points per venue', () => {
    const standings = buildVenueStandings(roster, VENUES, { cityId: 'bharatpur' });
    const iron = standings.find((s) => s.venueId === 'v1')!;
    expect(iron.points).toBe(5000);
    expect(iron.memberCount).toBe(2);
  });

  it('excludes unverified operators from territory entirely', () => {
    // The unverified operator has 9999 points and claims v1. A venue standing is
    // a claim about people who physically trained there.
    const standings = buildVenueStandings(roster, VENUES, { cityId: 'bharatpur' });
    const iron = standings.find((s) => s.venueId === 'v1')!;
    expect(iron.points).not.toBe(14999);
  });

  it('ranks venues within a city', () => {
    const standings = buildVenueStandings(roster, VENUES, { cityId: 'bharatpur' });
    expect(standings[0]!.venueId).toBe('v1');
    expect(standings[0]!.rank).toBe(1);
    expect(standings[1]!.venueId).toBe('v2');
  });

  it('scopes to a single city', () => {
    const standings = buildVenueStandings(roster, VENUES, { cityId: 'bharatpur' });
    expect(standings.map((s) => s.venueId)).not.toContain('v3');
  });

  it('ranks nationally when asked', () => {
    const standings = buildVenueStandings(roster, VENUES, 'national');
    expect(standings[0]!.venueId).toBe('v3');
    expect(standings).toHaveLength(3);
  });

  it('includes a venue with no verified members at zero rather than omitting it', () => {
    const standings = buildVenueStandings([], VENUES, { cityId: 'bharatpur' });
    expect(standings).toHaveLength(2);
    expect(standings.every((s) => s.points === 0)).toBe(true);
  });
});
