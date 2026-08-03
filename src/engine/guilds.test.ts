import { describe, expect, it } from 'vitest';
import {
  CONTRIBUTION_CAP_MULTIPLE,
  GUILD_MAX_MEMBERS,
  GUILD_MIN_MEMBERS,
  MIN_CONTRIBUTION_CAP,
  applyContributionCap,
  canChangeRole,
  canInvite,
  canJoin,
  canRemoveMember,
  contributionCap,
  guildQuestForWeek,
  guildStanding,
  median,
  type Guild,
  type GuildMember,
  type GuildRole,
} from './guilds';

function member(
  operatorId: string,
  rawContribution: number,
  role: GuildRole = 'MEMBER',
): GuildMember {
  return {
    operatorId,
    displayName: operatorId,
    role,
    rawContribution,
    joinedAt: '2026-01-05T00:00:00Z',
  };
}

function guild(members: GuildMember[]): Guild {
  return {
    id: 'g1',
    name: 'Bharatpur Iron',
    cityId: 'bharatpur',
    members,
    createdAt: '2026-01-05T00:00:00Z',
  };
}

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns 0 for an empty roster', () => {
    expect(median([])).toBe(0);
  });
});

describe('§11 — the per-member contribution cap', () => {
  const balanced = [
    member('a', 1000),
    member('b', 1000),
    member('c', 1000),
    member('d', 1000),
    member('e', 1000),
  ];

  it('scales the cap to the roster median', () => {
    expect(contributionCap(balanced)).toBe(1000 * CONTRIBUTION_CAP_MULTIPLE);
  });

  it('never falls below the floor, so a quiet guild is not capped at zero', () => {
    const quiet = [member('a', 0), member('b', 0), member('c', 0)];
    expect(contributionCap(quiet)).toBe(MIN_CONTRIBUTION_CAP);
  });

  it('leaves an ordinary member uncapped', () => {
    const capped = applyContributionCap(balanced);
    for (const contribution of capped) {
      expect(contribution.capped).toBe(false);
      expect(contribution.counted).toBe(contribution.raw);
      expect(contribution.withheld).toBe(0);
    }
  });

  it('caps a single power user', () => {
    const roster = [...balanced, member('powerhouse', 50_000)];
    const capped = applyContributionCap(roster);
    const power = capped.find((c) => c.operatorId === 'powerhouse')!;

    expect(power.capped).toBe(true);
    expect(power.counted).toBeLessThan(power.raw);
    expect(power.withheld).toBeGreaterThan(0);
  });

  it('stops one power user carrying the roster — §11 verbatim', () => {
    // Two guilds with identical total raw contribution. One has it spread
    // across the roster; the other has it concentrated in one person.
    const spread = guild([
      member('a', 2000),
      member('b', 2000),
      member('c', 2000),
      member('d', 2000),
      member('e', 2000),
    ]);
    const concentrated = guild([
      member('a', 9600),
      member('b', 100),
      member('c', 100),
      member('d', 100),
      member('e', 100),
    ]);

    const spreadTotal = spread.members.reduce((s, m) => s + m.rawContribution, 0);
    const concentratedTotal = concentrated.members.reduce(
      (s, m) => s + m.rawContribution,
      0,
    );
    expect(spreadTotal).toBe(concentratedTotal);

    // Identical raw totals, very different counted totals.
    expect(guildStanding(spread, 0).cycleContribution).toBeGreaterThan(
      guildStanding(concentrated, 0).cycleContribution,
    );
  });

  it('lets a strong member count fully while they are under the cap', () => {
    // The cap is 2.5x median, so ordinary variation between members is not
    // punished — it only bites at genuine outliers. A member training twice as
    // hard as the median still counts every point of it.
    const roster = [member('a', 2000), member('b', 1000), member('c', 1000), member('d', 1000), member('e', 1000)];
    const a = applyContributionCap(roster).find((c) => c.operatorId === 'a')!;
    expect(a.capped).toBe(false);
    expect(a.counted).toBe(2000);
  });

  it('makes further individual effort past the cap add nothing to the guild', () => {
    const others = [member('b', 1000), member('c', 1000), member('d', 1000), member('e', 1000)];
    // Cap is 2.5 x median(1000) = 2500 in both rosters.
    const atCap = guild([member('a', 2500), ...others]);
    const farPastCap = guild([member('a', 25_000), ...others]);

    expect(guildStanding(farPastCap, 0).cycleContribution).toBe(
      guildStanding(atCap, 0).cycleContribution,
    );
  });

  it('makes recruiting one more member always add, however strong the top one is', () => {
    const others = [member('b', 1000), member('c', 1000), member('d', 1000), member('e', 1000)];
    const withStar = guild([member('a', 25_000), ...others]);
    const withStarAndOneMore = guild([member('a', 25_000), ...others, member('f', 1000)]);

    // Past the cap, the only lever left is the roster — which is exactly the
    // behaviour §11 asks for.
    expect(guildStanding(withStarAndOneMore, 0).cycleContribution).toBeGreaterThan(
      guildStanding(withStar, 0).cycleContribution,
    );
  });

  it('reports what the cap withheld rather than dropping it silently', () => {
    const roster = [...balanced, member('powerhouse', 10_000)];
    const power = applyContributionCap(roster).find((c) => c.operatorId === 'powerhouse')!;
    expect(power.raw - power.counted).toBe(power.withheld);
  });

  it('leaves the top contributor still the most valuable person on the roster', () => {
    const roster = [...balanced, member('powerhouse', 10_000)];
    const capped = applyContributionCap(roster);
    const power = capped.find((c) => c.operatorId === 'powerhouse')!;
    const ordinary = capped.find((c) => c.operatorId === 'a')!;

    // Capped, but still contributing more than anyone else.
    expect(power.counted).toBeGreaterThan(ordinary.counted);
  });
});

describe('guildStanding', () => {
  const roster = guild([
    member('leader', 3000, 'LEADER'),
    member('b', 2000),
    member('c', 1500),
    member('d', 1000),
    member('e', 500),
  ]);

  it('levels from accumulated XP', () => {
    expect(guildStanding(roster, 0).level).toBe(1);
    expect(guildStanding(roster, 500_000).level).toBeGreaterThan(1);
  });

  it('reports progress toward the next level', () => {
    const standing = guildStanding(roster, 1000);
    expect(standing.xpIntoLevel).toBe(1000);
    expect(standing.xpForNextLevel).toBeGreaterThan(1000);
  });

  it('flags a roster below the §11 minimum', () => {
    expect(guildStanding(guild([member('a', 100)]), 0).belowMinimumRoster).toBe(true);
    expect(guildStanding(roster, 0).belowMinimumRoster).toBe(false);
    expect(GUILD_MIN_MEMBERS).toBe(5);
  });

  it('sums counted contribution, not raw', () => {
    const withStar = guild([...roster.members, member('star', 100_000)]);
    const standing = guildStanding(withStar, 0);
    const rawTotal = withStar.members.reduce((s, m) => s + m.rawContribution, 0);
    expect(standing.cycleContribution).toBeLessThan(rawTotal);
  });
});

describe('§11 — roster rules', () => {
  const roster = guild([
    member('leader', 1000, 'LEADER'),
    member('officer', 1000, 'OFFICER'),
    member('c', 1000),
    member('d', 1000),
    member('e', 1000),
  ]);

  it('caps membership at 50', () => {
    const full = guild(
      Array.from({ length: GUILD_MAX_MEMBERS }, (_, i) => member(`m${i}`, 100)),
    );
    expect(canJoin(full, 'new')).toBe('guild_full');
    expect(GUILD_MAX_MEMBERS).toBe(50);
  });

  it('refuses a duplicate join', () => {
    expect(canJoin(roster, 'leader')).toBe('already_member');
  });

  it('accepts a new operator with room', () => {
    expect(canJoin(roster, 'new')).toBeNull();
  });

  it('lets leaders and officers invite, but not members', () => {
    expect(canInvite('LEADER')).toBe(true);
    expect(canInvite('OFFICER')).toBe(true);
    expect(canInvite('MEMBER')).toBe(false);
  });

  it('lets only leaders change roles', () => {
    expect(canChangeRole('LEADER')).toBe(true);
    expect(canChangeRole('OFFICER')).toBe(false);
    expect(canChangeRole('MEMBER')).toBe(false);
  });

  it('refuses removal by a plain member', () => {
    expect(canRemoveMember(roster, 'c', 'MEMBER')).toBe('not_permitted');
  });

  it('refuses removal of the last leader', () => {
    expect(canRemoveMember(roster, 'leader', 'LEADER')).toBe('cannot_remove_last_leader');
  });

  it('refuses an officer removing a leader', () => {
    const twoLeaders = guild([
      member('leader', 1000, 'LEADER'),
      member('leader2', 1000, 'LEADER'),
      member('officer', 1000, 'OFFICER'),
    ]);
    expect(canRemoveMember(twoLeaders, 'leader', 'OFFICER')).toBe('not_permitted');
  });

  it('allows an officer to remove an ordinary member', () => {
    expect(canRemoveMember(roster, 'c', 'OFFICER')).toBeNull();
  });
});

describe('§11 — weekly guild quests', () => {
  const now = new Date('2026-03-02T00:00:00Z');

  it('rotates deterministically', () => {
    expect(guildQuestForWeek(0, 10, now).title).toBe(guildQuestForWeek(0, 10, now).title);
    expect(guildQuestForWeek(0, 10, now).title).not.toBe(guildQuestForWeek(1, 10, now).title);
  });

  it('scales the target to roster size', () => {
    const small = guildQuestForWeek(0, 6, now);
    const large = guildQuestForWeek(0, 40, now);
    expect(large.target).toBeGreaterThan(small.target);
  });

  it('never asks for less than one', () => {
    expect(guildQuestForWeek(2, 1, now).target).toBeGreaterThanOrEqual(1);
  });

  it('writes a real objective containing the target', () => {
    const quest = guildQuestForWeek(0, 10, now);
    expect(quest.objective).toContain(String(quest.target));
    expect(quest.objective).not.toMatch(/TODO|placeholder|\{\{/i);
  });

  it('expires in seven days', () => {
    const quest = guildQuestForWeek(0, 10, now);
    const days = (new Date(quest.expiresAt).getTime() - now.getTime()) / 86_400_000;
    expect(days).toBe(7);
  });

  it('rewards verified work above unverified', () => {
    const attendance = guildQuestForWeek(0, 10, now);
    const verified = guildQuestForWeek(1, 10, now);
    expect(verified.rewardGuildXp).toBeGreaterThan(attendance.rewardGuildXp);
  });
});
