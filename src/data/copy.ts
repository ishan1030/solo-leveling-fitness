import type { CoachPersonality } from '../engine/calibration';
import type { Tier } from '../engine/types';

/**
 * §14 — THE VOICE. Complete copy bank for AXIOM, organised by trigger.
 *
 * "Write the actual copy bank for every one of these triggers."
 *
 * Every line here is final user-facing copy. Nothing is templated at runtime
 * beyond the named substitution slots, which are typed below.
 *
 * §14 constraints applied to every line in this file:
 *   - NEVER prescribes calories, weight targets, body-fat goals, or fasting
 *   - NEVER comments on the user's body or appearance
 *   - §21: no shame, guilt, ultimatums, or appearance references
 *   - §20: every spoken line has a written caption — `spoken` and `caption` are
 *     the same string unless the spoken form needs different phrasing for TTS,
 *     in which case both are given explicitly
 */

export type VoiceTrigger =
  | 'CALIBRATION_COMPLETE'
  | 'TIER_UP'
  | 'TIER_DOWN'
  | 'LEVEL_UP'
  | 'ANOMALY_DISCOVERED'
  | 'RAID_COMPLETE'
  | 'RAID_ABANDONED'
  | 'SEASON_START'
  | 'SEASON_CLOSE'
  | 'RIVAL_WON'
  | 'RIVAL_LOST'
  | 'RIVAL_DRAW'
  | 'STREAK_MILESTONE'
  | 'NEW_PR'
  | 'SESSION_COMPLETE'
  | 'DELOAD_WEEK'
  | 'INJURY_LOGGED'
  | 'RETURN_AFTER_LAYOFF'
  | 'TRUST_CAP_REACHED'
  | 'VERIFICATION_EARNED'
  | 'MEDICAL_STOP';

/** Substitution slots. Anything not listed here cannot appear in a line. */
export interface CopySlots {
  name?: string;
  tier?: Tier;
  level?: number;
  streak?: number;
  cps?: number;
  count?: number;
  value?: string;
  rival?: string;
  pillar?: string;
  season?: number;
}

export interface VoiceLine {
  /** What the TTS engine speaks. */
  spoken: string;
  /** §20: what appears on screen. The app must be fully usable on mute. */
  caption: string;
}

/**
 * §14: "PERSONALITIES — these change intensity and content, not just timbre."
 *
 * Each trigger carries a distinct line per personality. The CALM_MENTOR variant
 * is always recovery-forward, and is the default for readiness-flagged
 * operators (§6).
 */
export type PersonalityLines = Record<CoachPersonality, VoiceLine[]>;

function line(text: string): VoiceLine {
  return { spoken: text, caption: text };
}

/** For lines where the spoken cadence differs from the on-screen text. */
function split(spoken: string, caption: string): VoiceLine {
  return { spoken, caption };
}

export const COPY_BANK: Record<VoiceTrigger, PersonalityLines> = {
  // -------------------------------------------------------------------------
  CALIBRATION_COMPLETE: {
    CALM_MENTOR: [
      line('Calibration complete. This is your starting point, not your ceiling. We build from here.'),
      line('That is your baseline recorded. Nothing about it is a verdict. It is a measurement.'),
    ],
    STRICT_TRAINER: [
      line('Calibration complete. Now we know exactly what we are working with. Nothing is hidden from here.'),
      line('Baseline set. Every number you just saw is a number we are going to move.'),
    ],
    ELITE_COMMANDER: [
      line('Calibration complete. You have a rank. Nobody handed it to you and nobody can take it without you letting them.'),
      split(
        'Baseline established, Operator. The ladder is above you. Start climbing.',
        'Baseline established, Operator. The ladder is above you. Start climbing.',
      ),
    ],
  },

  TIER_UP: {
    CALM_MENTOR: [
      line('{tier}. That is a real change in what your body can do. Take a moment with it.'),
      line('You have moved up to {tier}. The work did that, not luck.'),
    ],
    STRICT_TRAINER: [
      line('{tier}. Earned, verified, recorded. Next tier is already in range.'),
      line('Up to {tier}. That is the standard now. We do not go back down to visit.'),
    ],
    ELITE_COMMANDER: [
      line('{tier}. The board just moved. Everyone below you noticed.'),
      line('{tier}, Operator. Very few get this far. Fewer stay.'),
    ],
  },

  TIER_DOWN: {
    // §21: never shaming, never loss-framed as failure.
    CALM_MENTOR: [
      line('Your tier reads {tier} this week. Capability moves in both directions. That is what makes it honest.'),
      line('{tier} for now. Tiers measure today, not your history. Your level and your record are untouched.'),
    ],
    STRICT_TRAINER: [
      line('{tier} this cycle. The number reflects the last few weeks. Change the weeks, change the number.'),
      line('Reading {tier}. Nothing to explain away. Just work to log.'),
    ],
    ELITE_COMMANDER: [
      line('{tier} this cycle. The ladder does not care about last month. Neither should you. Climb.'),
      line('Back to {tier}. It is a position, not a sentence.'),
    ],
  },

  LEVEL_UP: {
    CALM_MENTOR: [
      line('Level {level}. That is time and consistency, and it counts on its own terms.'),
      line('Level {level}. Every session you logged is inside that number.'),
    ],
    STRICT_TRAINER: [
      line('Level {level}. Volume banked. Keep the sessions coming.'),
      line('Level {level}. That is the work adding up exactly the way it should.'),
    ],
    ELITE_COMMANDER: [
      line('Level {level}. Mileage on the clock, Operator.'),
      line('Level {level}. The hours are showing.'),
    ],
  },

  ANOMALY_DISCOVERED: {
    CALM_MENTOR: [
      line('You found something. {value}. Most operators never trip this one.'),
      line('Anomaly unlocked: {value}. That came from a pattern, not a single session.'),
    ],
    STRICT_TRAINER: [
      line('Anomaly. {value}. That was earned by behaviour, not by asking.'),
      line('{value}. Hidden until you did the thing that reveals it. Now it is yours.'),
    ],
    ELITE_COMMANDER: [
      line('Anomaly detected. {value}. Very few find this.'),
      line('{value}. The system was watching. It noticed.'),
    ],
  },

  RAID_COMPLETE: {
    CALM_MENTOR: [
      line('Raid complete. All {count} of you logged your portion. That is the whole point of it.'),
      line('Raid closed out. Everyone carried their own weight. Good session.'),
    ],
    STRICT_TRAINER: [
      line('Raid complete. {count} operators, every portion logged. Nobody carried anybody.'),
      line('Raid done. That is what a full party looks like.'),
    ],
    ELITE_COMMANDER: [
      line('Raid complete. {count} operators, one clean run. The counter just ticked.'),
      line('Party cleared it. All {count} of you are on the record.'),
    ],
  },

  RAID_ABANDONED: {
    // §9: never blames the operator who left.
    CALM_MENTOR: [
      line('Raid closed early. Everything you logged still counts as a normal session. People have lives.'),
      line('Party broke up. Your work stands on its own. Nothing lost.'),
    ],
    STRICT_TRAINER: [
      line('Raid closed early. Your portion is logged and scored as a solo session. Move on.'),
      line('Party did not finish. Your sets still count. Next one.'),
    ],
    ELITE_COMMANDER: [
      line('Raid stood down. Your work is on the record regardless. Regroup.'),
      line('Party dissolved. Your log is intact. Open another.'),
    ],
  },

  SEASON_START: {
    CALM_MENTOR: [
      line('Season {season} is open. Thirteen weeks. Your level, stats and record all carried over.'),
      line('New season. Ladder points reset, everything you built stays with you.'),
    ],
    STRICT_TRAINER: [
      line('Season {season}. Thirteen weeks on the clock. Ladder starts level; you do not.'),
      line('Season {season} live. Your stats came with you. Your placement did not. Go get it.'),
    ],
    ELITE_COMMANDER: [
      line('Season {season}. Thirteen weeks. The board is clear and everyone can see it.'),
      line('Season {season} open, Operator. Position is earned again from here.'),
    ],
  },

  SEASON_CLOSE: {
    CALM_MENTOR: [
      line('Season {season} is closed. It is on your timeline permanently now.'),
      line('That is thirteen weeks logged and archived. One more entry in a long record.'),
    ],
    STRICT_TRAINER: [
      line('Season {season} closed. Finished at {tier}. Archived, permanent, unarguable.'),
      line('Season done. {tier} on the record. Next one starts from what you can actually hold.'),
    ],
    ELITE_COMMANDER: [
      line('Season {season} is history. {tier} carved into the timeline.'),
      line('Season closed at {tier}. That entry does not move again.'),
    ],
  },

  RIVAL_WON: {
    CALM_MENTOR: [
      line('You took the week from {rival} on {pillar}. Both of you trained harder for it.'),
      line('Week goes to you against {rival}. That is what a rival is for.'),
    ],
    STRICT_TRAINER: [
      line('You beat {rival} on {pillar} this week. Do it again.'),
      line('Week won against {rival}. They will come back sharper. Be ready.'),
    ],
    ELITE_COMMANDER: [
      line('{rival} came up short. The week is yours.'),
      line('You held the line against {rival}. Recorded.'),
    ],
  },

  RIVAL_LOST: {
    // §21: no shame. The framing is always "next week", never "you failed".
    CALM_MENTOR: [
      line('{rival} took the week on {pillar}. Close ones like that are why the rivalry works.'),
      line('Week goes to {rival}. Your record keeps every one of these, wins and losses both.'),
    ],
    STRICT_TRAINER: [
      line('{rival} took this one on {pillar}. Seven days to answer it.'),
      line('Week to {rival}. Nothing to say about it. Something to do about it.'),
    ],
    ELITE_COMMANDER: [
      line('{rival} took the week. The rematch is already scheduled.'),
      line('Point to {rival}. The record is long. Keep writing it.'),
    ],
  },

  RIVAL_DRAW: {
    CALM_MENTOR: [line('Dead level with {rival} on {pillar}. You both showed up.')],
    STRICT_TRAINER: [line('Drawn with {rival}. Split points. Settle it next week.')],
    ELITE_COMMANDER: [line('Deadlock with {rival}. Neither of you gave ground.')],
  },

  STREAK_MILESTONE: {
    // §16: encouraging only. Never "don't lose it".
    CALM_MENTOR: [
      line('{streak} sessions. Consistency is a pillar here for exactly this reason.'),
      line('{streak} deep. Rest days are built into that number, as they should be.'),
    ],
    STRICT_TRAINER: [
      line('{streak} sessions logged. That is the habit doing its job.'),
      line('{streak}. Showing up is scored here. This is the score.'),
    ],
    ELITE_COMMANDER: [
      line('{streak} sessions on the record, Operator.'),
      line('{streak} straight. That is the part most people never reach.'),
    ],
  },

  NEW_PR: {
    CALM_MENTOR: [
      line('New best: {value}. Your body did something today it had not done before.'),
      line('{value}. That is a genuine personal record. Worth noticing.'),
    ],
    STRICT_TRAINER: [
      line('{value}. New personal record. That number is the new floor.'),
      line('Personal record: {value}. Logged. Next.'),
    ],
    ELITE_COMMANDER: [
      line('{value}. Personal record. Nobody can take that one.'),
      line('New best. {value}. On the board.'),
    ],
  },

  SESSION_COMPLETE: {
    CALM_MENTOR: [
      line('Session logged. Rest properly before the next one — that is when the adaptation happens.'),
      line('Done. Everything you did is measured and recorded.'),
    ],
    STRICT_TRAINER: [
      line('Session logged. Every set counted toward something.'),
      line('Complete. The numbers moved because of what you actually lifted.'),
    ],
    ELITE_COMMANDER: [
      line('Session recorded, Operator.'),
      line('Logged. The ladder saw it.'),
    ],
  },

  DELOAD_WEEK: {
    // §15: mandatory deload every 4th week.
    CALM_MENTOR: [
      line('Deload week. Load comes down deliberately. This is scheduled training, not a break from it.'),
      line('This week is a deload. Lighter on purpose. It is part of the programme.'),
    ],
    STRICT_TRAINER: [
      line('Deload week. Cut the load, keep the schedule. This is how the next block gets heavier.'),
      line('Deload. Do not fight it. It is why the fourth week works.'),
    ],
    ELITE_COMMANDER: [
      line('Deload week, Operator. Even the best cycles have one.'),
      line('Load drops this week. That is the plan, not a concession.'),
    ],
  },

  INJURY_LOGGED: {
    // §16 / §21: no penalty, no guilt copy, ever. Only the calm register is used
    // regardless of the operator's chosen personality — see lineFor().
    CALM_MENTOR: [
      line('Logged. Your streak is paused and your rank is frozen where it is. Take the time you need.'),
      line('Understood. Nothing decays while you recover. Come back when you are ready, not before.'),
    ],
    STRICT_TRAINER: [
      line('Logged. Streak paused, nothing decays. Recovery is training too.'),
      line('Noted. Everything holds where it is until you are back.'),
    ],
    ELITE_COMMANDER: [
      line('Logged. Everything freezes. Recover properly.'),
      line('Understood. Your position holds. Get right first.'),
    ],
  },

  RETURN_AFTER_LAYOFF: {
    CALM_MENTOR: [
      line('Good to see you. We are starting lighter than where you left off, on purpose.'),
      line('Back in. First week is deliberately conservative. Nothing to prove today.'),
    ],
    STRICT_TRAINER: [
      line('Back in. First session is lighter than your last one. That is not negotiable.'),
      line('Returning block starts conservative. Earn the load back.'),
    ],
    ELITE_COMMANDER: [
      line('Operator returns. We rebuild from a lower load. Standard procedure.'),
      line('Back on the board. Start light. Climb again.'),
    ],
  },

  TRUST_CAP_REACHED: {
    // §6: the cap must read as an invitation, never as a punishment.
    CALM_MENTOR: [
      split(
        'Your score is worth {tier}, but self-reported profiles cap at COBALT. One verified session at any partner venue unlocks the rest.',
        'Your score is worth {tier}, but self-reported profiles cap at COBALT. One verified session at any partner venue unlocks the rest.',
      ),
    ],
    STRICT_TRAINER: [
      line('You are scoring {tier} and being shown COBALT. That gap closes the moment you scan into a real gym.'),
    ],
    ELITE_COMMANDER: [
      line('{tier} on the numbers. COBALT on the board. The top of this ladder is verified only — that is what makes it worth standing on.'),
    ],
  },

  VERIFICATION_EARNED: {
    CALM_MENTOR: [line('Verified session recorded. Your profile now carries a verification badge.')],
    STRICT_TRAINER: [line('Verified. The cap is off. Your rank is now worth exactly what you earned.')],
    ELITE_COMMANDER: [line('Verified, Operator. The whole ladder is open to you now.')],
  },

  MEDICAL_STOP: {
    // §21: identical across personalities. This one is not a performance.
    CALM_MENTOR: [
      line('Stop training now and speak to a doctor. This is not something to push through. Your rank and your record are safe and will be here afterwards.'),
    ],
    STRICT_TRAINER: [
      line('Stop training now and speak to a doctor. This is not something to push through. Your rank and your record are safe and will be here afterwards.'),
    ],
    ELITE_COMMANDER: [
      line('Stop training now and speak to a doctor. This is not something to push through. Your rank and your record are safe and will be here afterwards.'),
    ],
  },
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const SLOT_PATTERN = /\{(\w+)\}/g;

export function fillSlots(text: string, slots: CopySlots): string {
  return text.replace(SLOT_PATTERN, (match, key: string) => {
    const value = slots[key as keyof CopySlots];
    return value === undefined ? match : String(value);
  });
}

/**
 * Resolves a line for a trigger.
 *
 * Two overrides are applied regardless of the operator's chosen personality:
 *   - MEDICAL_STOP and INJURY_LOGGED always use CALM_MENTOR. §21 forbids
 *     theatrical framing around a safety event, and ELITE_COMMANDER is
 *     explicitly roleplay flavour (§14).
 */
export function lineFor(
  trigger: VoiceTrigger,
  personality: CoachPersonality,
  slots: CopySlots = {},
  variantIndex = 0,
): VoiceLine {
  const safetyTriggers: VoiceTrigger[] = ['MEDICAL_STOP', 'INJURY_LOGGED'];
  const effective = safetyTriggers.includes(trigger) ? 'CALM_MENTOR' : personality;

  const options = COPY_BANK[trigger][effective];
  const chosen = options[variantIndex % options.length]!;

  return {
    spoken: fillSlots(chosen.spoken, slots),
    caption: fillSlots(chosen.caption, slots),
  };
}

// ---------------------------------------------------------------------------
// §14 FREE TIER — text notifications, maximum 2/day, quiet hours respected
// ---------------------------------------------------------------------------

export const MAX_FREE_NOTIFICATIONS_PER_DAY = 2;

export interface QuietHours {
  /** Local hour, inclusive. */
  startHour: number;
  /** Local hour, exclusive. */
  endHour: number;
}

export const DEFAULT_QUIET_HOURS: QuietHours = { startHour: 21, endHour: 7 };

export function isWithinQuietHours(localHour: number, quiet: QuietHours): boolean {
  // Handles the overnight wrap (21:00 → 07:00).
  if (quiet.startHour <= quiet.endHour) {
    return localHour >= quiet.startHour && localHour < quiet.endHour;
  }
  return localHour >= quiet.startHour || localHour < quiet.endHour;
}

export interface NotificationDecision {
  send: boolean;
  reason: 'ok' | 'quiet_hours' | 'daily_cap_reached' | 'suppressed_medical_stop';
}

/**
 * §14 free tier gating, and §21's rule that a medical-stop state suppresses all
 * challenge prompts.
 */
export function shouldSendNotification(args: {
  sentToday: number;
  localHour: number;
  quietHours: QuietHours;
  medicalStopActive: boolean;
  isPremium: boolean;
}): NotificationDecision {
  if (args.medicalStopActive) {
    return { send: false, reason: 'suppressed_medical_stop' };
  }
  if (isWithinQuietHours(args.localHour, args.quietHours)) {
    return { send: false, reason: 'quiet_hours' };
  }
  if (!args.isPremium && args.sentToday >= MAX_FREE_NOTIFICATIONS_PER_DAY) {
    return { send: false, reason: 'daily_cap_reached' };
  }
  return { send: true, reason: 'ok' };
}

// ---------------------------------------------------------------------------
// Static UI copy that carries a spec obligation
// ---------------------------------------------------------------------------

export const STATIC_COPY = {
  /** §21: persistent, plain-language disclaimer. */
  medicalDisclaimer:
    'Meridian measures training performance. It is not medical advice and it is not a substitute for a clinician. If something hurts, stop.',

  /** §10 PRIVACY, in plain language, in-product. */
  privacyLocation:
    'We read your location once, at the moment you scan into a venue, to confirm you are there. We do not track you in the background, we do not build a location history, and we do not sell it. Leaderboards outside your venue are opt-in.',

  /** §5: the level-versus-tier tension, communicated as honest rather than punishing. */
  levelVersusTier:
    'Level is what you have invested. Tier is what you can do right now. They move at different speeds on purpose — a high level with a lower tier means you have put in real time and your capability is still catching up. Both are true.',

  /** §6: the trust cap, explained where the operator first meets it. */
  trustCapExplainer:
    'Calibration is self-reported, so it caps at COBALT. That is not a judgement of your answers — it is what keeps the top of this ladder worth climbing. One scanned session at a partner venue lifts the cap permanently.',

  /** §18: the fairness rule, stated to the user. */
  fairnessPromise:
    'Nothing on the store page affects your rank. No XP multipliers, no stat boosts, no ladder points, no faster verification. Subscriptions buy voice coaching, analytics and cosmetics. The ladder is performance only.',

  /** §16: shown next to the streak counter. */
  streakPhilosophy:
    'Two rest days a week are built in. Injury and illness pause the streak with no penalty. You get one freeze a month, automatically. This counter is here to show you what you have done, not to threaten you.',
} as const;
