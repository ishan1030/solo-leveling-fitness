import { create } from 'zustand';
import { computeCps, tierForCps } from '../engine/progression';
import type { Raid, RaidParticipant } from '../engine/raids';
import type { Rivalry, RivalCandidate } from '../engine/rivals';
import type { SeasonArchiveEntry, SeasonState } from '../engine/seasons';
import type { Venue } from '../engine/verification';
import type { Pillar, PillarScores, Tier, VerificationTier } from '../engine/types';

/**
 * Server-provided world state: venues, the ladder, other operators, raids.
 *
 * This is deliberately a separate store from `useApp`. The operator's own state
 * is authoritative on-device and persisted (§7 offline-first); everything here
 * is a **cache of server truth** and is not persisted — a stale leaderboard is
 * worse than an absent one.
 *
 * `seedWorld()` is the swap point. In production it is replaced by a fetch
 * against the endpoints in docs/15-technical-architecture.md; every screen above
 * it reads through the same selectors either way.
 */

export interface LadderRow {
  operatorId: string;
  displayName: string;
  tier: Tier;
  cps: number;
  level: number;
  verification: VerificationTier;
  venueId: string | null;
  venueName: string | null;
  cityId: string;
  ladderPoints: number;
  /** Rank within whichever board this row was requested for. */
  rank: number;
  isYou: boolean;
}

export type LadderScope = 'global' | 'city' | 'venue';

interface WorldState {
  loaded: boolean;
  venues: Venue[];
  cities: { id: string; name: string; countryCode: string }[];
  operators: LadderRow[];
  rivalCandidates: RivalCandidate[];
  rivalries: Rivalry[];
  activeRaid: Raid | null;
  season: SeasonState;
  archive: SeasonArchiveEntry[];
  /** Per-pairing raid streaks, keyed by sorted "a|b". */
  pairStreaks: Record<string, number>;
  /** ISO datetime of the operator's last accepted verified session. */
  lastVerifiedSessionAt: string | null;

  seedWorld: () => void;
  addRivalry: (candidate: RivalCandidate, pillar: Pillar) => void;
  removeRivalry: (rivalryId: string) => void;
  openRaid: (hostOperatorId: string, contributingPillar: Pillar) => void;
  joinRaid: (candidate: RivalCandidate, contributingPillar: Pillar) => void;
  logRaidPortion: (operatorId: string) => void;
  dropFromRaid: (operatorId: string) => void;
  closeRaid: () => void;
  recordVerifiedSession: (at: string) => void;
}

// ---------------------------------------------------------------------------
// Seed data — Bharatpur first, per §12
// ---------------------------------------------------------------------------

const CITIES = [
  { id: 'bharatpur', name: 'Bharatpur', countryCode: 'NP' },
  { id: 'kathmandu', name: 'Kathmandu', countryCode: 'NP' },
  { id: 'pokhara', name: 'Pokhara', countryCode: 'NP' },
];

/**
 * §12: "This gives smaller markets a realistic path to the top of a board, which
 * is exactly why early users in Nepal will care."
 *
 * Coordinates are real Bharatpur locations so the geofence maths in the check-in
 * screen exercises genuine distances rather than a synthetic grid.
 */
const VENUES: Venue[] = [
  {
    id: 'v_bharatpur_iron',
    name: 'Bharatpur Iron',
    cityId: 'bharatpur',
    lat: 27.6766,
    lon: 84.4344,
    certified: true,
    codeSecret: 'seed-bharatpur-iron',
  },
  {
    id: 'v_narayani',
    name: 'Narayani Strength Club',
    cityId: 'bharatpur',
    lat: 27.6840,
    lon: 84.4290,
    certified: true,
    codeSecret: 'seed-narayani',
  },
  {
    id: 'v_chitwan_calisthenics',
    name: 'Chitwan Calisthenics Park',
    cityId: 'bharatpur',
    lat: 27.6712,
    lon: 84.4401,
    certified: true,
    codeSecret: 'seed-chitwan',
  },
  {
    id: 'v_pulchowk',
    name: 'Pulchowk Barbell',
    cityId: 'kathmandu',
    lat: 27.6795,
    lon: 85.3169,
    certified: true,
    codeSecret: 'seed-pulchowk',
  },
  {
    id: 'v_lakeside',
    name: 'Lakeside Athletic',
    cityId: 'pokhara',
    lat: 28.2096,
    lon: 83.9556,
    certified: false,
    codeSecret: 'seed-lakeside',
  },
];

interface SeedOperator {
  name: string;
  pillars: PillarScores;
  verification: VerificationTier;
  venueId: string | null;
  cityId: string;
  level: number;
}

const SEED_OPERATORS: SeedOperator[] = [
  { name: 'Anjali Thapa', pillars: p(94, 91, 96, 88), verification: 'EQUIPMENT_TAP', venueId: 'v_pulchowk', cityId: 'kathmandu', level: 88 },
  { name: 'Dipesh Rana', pillars: p(92, 88, 94, 82), verification: 'TRAINER_CONFIRM', venueId: 'v_bharatpur_iron', cityId: 'bharatpur', level: 76 },
  { name: 'Sunita Karki', pillars: p(82, 88, 90, 70), verification: 'EQUIPMENT_TAP', venueId: 'v_bharatpur_iron', cityId: 'bharatpur', level: 71 },
  { name: 'Bikash Gurung', pillars: p(86, 74, 82, 66), verification: 'QR_CHECK_IN', venueId: 'v_narayani', cityId: 'bharatpur', level: 64 },
  { name: 'Maya Shrestha', pillars: p(70, 84, 80, 74), verification: 'QR_CHECK_IN', venueId: 'v_chitwan_calisthenics', cityId: 'bharatpur', level: 59 },
  { name: 'Rajesh Adhikari', pillars: p(72, 66, 78, 58), verification: 'QR_CHECK_IN', venueId: 'v_bharatpur_iron', cityId: 'bharatpur', level: 52 },
  { name: 'Prakash Lama', pillars: p(68, 62, 70, 54), verification: 'QR_CHECK_IN', venueId: 'v_pulchowk', cityId: 'kathmandu', level: 47 },
  { name: 'Nisha Poudel', pillars: p(58, 72, 68, 66), verification: 'QR_CHECK_IN', venueId: 'v_narayani', cityId: 'bharatpur', level: 44 },
  { name: 'Kiran Basnet', pillars: p(64, 54, 66, 48), verification: 'TRAINER_CONFIRM', venueId: 'v_chitwan_calisthenics', cityId: 'bharatpur', level: 39 },
  // Two deliberately unverified operators scoring well above COBALT. They exist
  // in the seed so the ladder screen can demonstrate §10's filtering with real
  // rows rather than with an explanation.
  { name: 'Aashish K.', pillars: p(88, 80, 86, 74), verification: 'SELF_REPORTED', venueId: null, cityId: 'bharatpur', level: 12 },
  { name: 'Sabin M.', pillars: p(78, 76, 82, 70), verification: 'SELF_REPORTED', venueId: null, cityId: 'kathmandu', level: 9 },
  { name: 'Puja Tamang', pillars: p(52, 58, 62, 60), verification: 'QR_CHECK_IN', venueId: 'v_bharatpur_iron', cityId: 'bharatpur', level: 31 },
  { name: 'Hari Chaulagain', pillars: p(48, 50, 58, 44), verification: 'QR_CHECK_IN', venueId: 'v_narayani', cityId: 'bharatpur', level: 26 },
  { name: 'Sarita Magar', pillars: p(42, 56, 54, 62), verification: 'QR_CHECK_IN', venueId: 'v_chitwan_calisthenics', cityId: 'bharatpur', level: 22 },
  { name: 'Ramesh Oli', pillars: p(38, 34, 46, 36), verification: 'SELF_REPORTED', venueId: null, cityId: 'bharatpur', level: 14 },
];

function p(s: number, e: number, c: number, m: number): PillarScores {
  return { strength: s, endurance: e, consistency: c, mobility: m };
}

function venueName(venueId: string | null): string | null {
  return VENUES.find((v) => v.id === venueId)?.name ?? null;
}

function toLadderRow(seed: SeedOperator, index: number): LadderRow {
  const cps = computeCps(seed.pillars);
  return {
    operatorId: `op_seed_${index}`,
    displayName: seed.name,
    // The seed stores raw capability; the tier shown is resolved through the
    // same trust cap every other surface uses.
    tier: tierForCps(cps),
    cps,
    level: seed.level,
    verification: seed.verification,
    venueId: seed.venueId,
    venueName: venueName(seed.venueId),
    cityId: seed.cityId,
    // Ladder points are season-scoped and roughly track CPS with variance from
    // rival wins and raid participation.
    ladderPoints: Math.round(cps * 42 + (index % 5) * 37),
    rank: 0,
    isYou: false,
  };
}

// ---------------------------------------------------------------------------

const INITIAL_SEASON: SeasonState = {
  seasonNumber: 1,
  startedAt: '2026-01-05T00:00:00Z',
  endsAt: '2026-04-06T00:00:00Z',
};

export const useWorld = create<WorldState>()((set, get) => ({
  loaded: false,
  venues: [],
  cities: [],
  operators: [],
  rivalCandidates: [],
  rivalries: [],
  activeRaid: null,
  season: INITIAL_SEASON,
  archive: [],
  pairStreaks: {},
  lastVerifiedSessionAt: null,

  seedWorld: () => {
    if (get().loaded) return;

    const operators = SEED_OPERATORS.map(toLadderRow);

    set({
      loaded: true,
      venues: VENUES,
      cities: CITIES,
      operators,
      rivalCandidates: operators.map((row) => ({
        operatorId: row.operatorId,
        displayName: row.displayName,
        tier: row.tier,
        cityId: row.cityId,
        venueId: row.venueId,
        // A minority opt out, so the §11 filter is exercised rather than assumed.
        acceptingRivals: row.operatorId !== 'op_seed_0',
      })),
      // One season already archived, so the career timeline has a line to draw.
      archive: [
        {
          seasonNumber: 0,
          endedAt: '2026-01-04T00:00:00Z',
          tier: 'IRON',
          level: 18,
          cps: 38.4,
          placement: 2841,
          titleIds: [],
        },
      ],
    });
  },

  addRivalry: (candidate, pillar) =>
    set((state) => ({
      rivalries: [
        ...state.rivalries,
        {
          id: `rv_${candidate.operatorId}`,
          operatorId: 'me',
          rivalOperatorId: candidate.operatorId,
          pillar,
          status: 'ACTIVE',
          record: { wins: 0, losses: 0, draws: 0 },
          currentWeekStartedAt: new Date().toISOString(),
        },
      ],
    })),

  removeRivalry: (rivalryId) =>
    set((state) => ({ rivalries: state.rivalries.filter((r) => r.id !== rivalryId) })),

  openRaid: (hostOperatorId, contributingPillar) =>
    set({
      activeRaid: {
        id: `raid_${Date.now().toString(36)}`,
        hostOperatorId,
        status: 'OPEN',
        isBossRaid: false,
        openedAt: new Date().toISOString(),
        requiresProximity: true,
        participants: [
          {
            operatorId: hostOperatorId,
            contributingPillar,
            verification: 'QR_CHECK_IN',
            loggedPortion: false,
            sessionStartedAt: new Date().toISOString(),
            location: { lat: 27.6766, lon: 84.4344 },
            droppedOut: false,
          },
        ],
      },
    }),

  joinRaid: (candidate, contributingPillar) =>
    set((state) => {
      if (!state.activeRaid) return {};
      const participant: RaidParticipant = {
        operatorId: candidate.operatorId,
        contributingPillar,
        verification: 'QR_CHECK_IN',
        loggedPortion: false,
        sessionStartedAt: new Date().toISOString(),
        location: { lat: 27.6767, lon: 84.4345 },
        droppedOut: false,
      };
      return {
        activeRaid: {
          ...state.activeRaid,
          status: 'ACTIVE',
          participants: [...state.activeRaid.participants, participant],
        },
      };
    }),

  logRaidPortion: (operatorId) =>
    set((state) => {
      if (!state.activeRaid) return {};
      return {
        activeRaid: {
          ...state.activeRaid,
          participants: state.activeRaid.participants.map((participant) =>
            participant.operatorId === operatorId
              ? { ...participant, loggedPortion: true }
              : participant,
          ),
        },
      };
    }),

  dropFromRaid: (operatorId) =>
    set((state) => {
      if (!state.activeRaid) return {};
      return {
        activeRaid: {
          ...state.activeRaid,
          participants: state.activeRaid.participants.map((participant) =>
            participant.operatorId === operatorId
              ? { ...participant, droppedOut: true }
              : participant,
          ),
        },
      };
    }),

  closeRaid: () => set({ activeRaid: null }),

  recordVerifiedSession: (at) => set({ lastVerifiedSessionAt: at }),
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function venueById(venues: Venue[], id: string | null): Venue | undefined {
  return venues.find((v) => v.id === id);
}

export function pillarLabel(pillar: Pillar): string {
  return pillar.toUpperCase();
}
