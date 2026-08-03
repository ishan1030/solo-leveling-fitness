import { round1 } from './progression';
import type { Pillar } from './types';

/**
 * §11 — GUILDS.
 *
 * "5–50 members. Guild level rises from aggregate member activity, with a
 * per-member contribution cap so a single power user can't carry the roster.
 * Weekly guild quests. Roles: Leader, Officer, Member."
 *
 * The contribution cap is the whole design. Without it a guild's level is a
 * measure of its single most active member, which makes recruiting one obsessive
 * operator strictly better than building a roster — and turns every other member
 * into a spectator on their own team.
 */

export const GUILD_MIN_MEMBERS = 5;
export const GUILD_MAX_MEMBERS = 50;

/**
 * §11: "a per-member contribution cap so a single power user can't carry the
 * roster."
 *
 * Expressed as a multiple of the roster's *median* contribution rather than a
 * flat number, so the cap scales with the guild. A casual guild is not measured
 * against an elite one's ceiling, and an elite guild's cap does not become
 * meaningless as everyone climbs.
 *
 * 2.5x means the hardest-training member can contribute at most two and a half
 * times what the typical member does. They are still the most valuable person on
 * the roster — they just cannot be the only one who matters.
 */
export const CONTRIBUTION_CAP_MULTIPLE = 2.5;

/** Floor for the cap, so a guild of near-inactive members is not capped at ~0. */
export const MIN_CONTRIBUTION_CAP = 100;

export type GuildRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export interface GuildMember {
  operatorId: string;
  displayName: string;
  role: GuildRole;
  /** Raw contribution this cycle, before the cap. */
  rawContribution: number;
  joinedAt: string;
}

export interface Guild {
  id: string;
  name: string;
  cityId: string | null;
  members: GuildMember[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Contribution
// ---------------------------------------------------------------------------

export interface CappedContribution {
  operatorId: string;
  displayName: string;
  role: GuildRole;
  raw: number;
  /** What actually counts toward the guild after the cap. */
  counted: number;
  /** raw − counted. Surfaced, never hidden. */
  withheld: number;
  capped: boolean;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** The cap this roster is currently operating under. */
export function contributionCap(members: GuildMember[]): number {
  const med = median(members.map((m) => m.rawContribution));
  return Math.max(MIN_CONTRIBUTION_CAP, round1(med * CONTRIBUTION_CAP_MULTIPLE));
}

/**
 * Applies the cap to every member.
 *
 * The withheld amount is returned rather than silently dropped, so the guild
 * screen can tell a capped member "you are contributing the maximum one operator
 * can" — which reads as a compliment about their training and an honest
 * statement about the rule, rather than as a penalty they were never told about.
 */
export function applyContributionCap(members: GuildMember[]): CappedContribution[] {
  const cap = contributionCap(members);

  return members.map((member) => {
    const counted = Math.min(member.rawContribution, cap);
    return {
      operatorId: member.operatorId,
      displayName: member.displayName,
      role: member.role,
      raw: member.rawContribution,
      counted: round1(counted),
      withheld: round1(Math.max(0, member.rawContribution - counted)),
      capped: member.rawContribution > cap,
    };
  });
}

// ---------------------------------------------------------------------------
// Guild level
// ---------------------------------------------------------------------------

/** XP required to clear guild level N. Flatter than the operator curve. */
export function guildXpForLevel(level: number): number {
  return Math.round((5000 * Math.pow(level, 1.2)) / 100) * 100;
}

export interface GuildStanding {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  /** Total counted contribution across the roster this cycle. */
  cycleContribution: number;
  contributionCap: number;
  memberCount: number;
  /** True while the roster is below the §11 minimum. */
  belowMinimumRoster: boolean;
  contributions: CappedContribution[];
}

/**
 * A guild's standing from its roster.
 *
 * Note that `cycleContribution` sums the *capped* values. This is the line that
 * makes §11's rule real: a guild cannot raise its level by recruiting one
 * exceptional operator, only by having more members who train.
 */
export function guildStanding(
  guild: Guild,
  accumulatedXp: number,
): GuildStanding {
  const contributions = applyContributionCap(guild.members);
  const cycleContribution = round1(
    contributions.reduce((sum, c) => sum + c.counted, 0),
  );

  let level = 1;
  let remaining = accumulatedXp;
  while (remaining >= guildXpForLevel(level)) {
    remaining -= guildXpForLevel(level);
    level += 1;
  }

  return {
    level,
    xpIntoLevel: Math.round(remaining),
    xpForNextLevel: guildXpForLevel(level),
    cycleContribution,
    contributionCap: contributionCap(guild.members),
    memberCount: guild.members.length,
    belowMinimumRoster: guild.members.length < GUILD_MIN_MEMBERS,
    contributions,
  };
}

// ---------------------------------------------------------------------------
// Roster management
// ---------------------------------------------------------------------------

export type RosterRejection =
  | 'guild_full'
  | 'already_member'
  | 'not_permitted'
  | 'cannot_remove_last_leader';

export function canJoin(guild: Guild, operatorId: string): RosterRejection | null {
  if (guild.members.length >= GUILD_MAX_MEMBERS) return 'guild_full';
  if (guild.members.some((m) => m.operatorId === operatorId)) return 'already_member';
  return null;
}

/** Only leaders and officers may invite. */
export function canInvite(role: GuildRole): boolean {
  return role === 'LEADER' || role === 'OFFICER';
}

/** Only leaders may change roles. */
export function canChangeRole(role: GuildRole): boolean {
  return role === 'LEADER';
}

/**
 * A guild must always have a leader. Removing the last one is refused rather
 * than silently promoting someone — which member gets promoted is a decision the
 * guild should make, not the system.
 */
export function canRemoveMember(
  guild: Guild,
  targetOperatorId: string,
  actingRole: GuildRole,
): RosterRejection | null {
  if (actingRole === 'MEMBER') return 'not_permitted';

  const target = guild.members.find((m) => m.operatorId === targetOperatorId);
  if (!target) return null;

  if (target.role === 'LEADER') {
    const leaderCount = guild.members.filter((m) => m.role === 'LEADER').length;
    if (leaderCount <= 1) return 'cannot_remove_last_leader';
    // An officer may not remove a leader.
    if (actingRole !== 'LEADER') return 'not_permitted';
  }

  return null;
}

// ---------------------------------------------------------------------------
// §11 — Weekly guild quests
// ---------------------------------------------------------------------------

export interface GuildQuest {
  id: string;
  title: string;
  objective: string;
  pillar: Pillar;
  /** Scaled to roster size, so a guild of 6 is not given a guild-of-40 target. */
  target: number;
  unit: 'sessions' | 'verified_sessions' | 'raids';
  rewardGuildXp: number;
  expiresAt: string;
}

const GUILD_QUEST_ROTATION: {
  title: string;
  objective: (target: number) => string;
  pillar: Pillar;
  unit: GuildQuest['unit'];
  perMember: number;
  rewardGuildXp: number;
}[] = [
  {
    title: 'ATTENDANCE',
    objective: (t) => `Log ${t} sessions across the roster this week.`,
    pillar: 'consistency',
    unit: 'sessions',
    perMember: 3,
    rewardGuildXp: 2500,
  },
  {
    title: 'ON THE RECORD',
    objective: (t) => `${t} verified sessions across the roster. Scanned, not claimed.`,
    pillar: 'consistency',
    unit: 'verified_sessions',
    perMember: 1,
    rewardGuildXp: 4000,
  },
  {
    title: 'TOGETHER',
    objective: (t) => `Complete ${t} raids as a guild. Everyone logs their own portion.`,
    pillar: 'strength',
    unit: 'raids',
    perMember: 0.5,
    rewardGuildXp: 5000,
  },
];

/**
 * Deterministic per week, and scaled to the roster.
 *
 * `perMember` scaling matters: a fixed target either makes small guilds fail
 * every week or makes large ones clear it by Tuesday. Both kill the mechanic.
 */
export function guildQuestForWeek(
  weekIndex: number,
  memberCount: number,
  now: Date,
): GuildQuest {
  const template = GUILD_QUEST_ROTATION[weekIndex % GUILD_QUEST_ROTATION.length]!;
  const target = Math.max(1, Math.round(template.perMember * memberCount));

  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + 7);

  return {
    id: `gq_w${weekIndex}`,
    title: template.title,
    objective: template.objective(target),
    pillar: template.pillar,
    target,
    unit: template.unit,
    rewardGuildXp: template.rewardGuildXp,
    expiresAt: expires.toISOString(),
  };
}
