import { describe, expect, it } from 'vitest';
import {
  COPY_BANK,
  DEFAULT_QUIET_HOURS,
  MAX_FREE_NOTIFICATIONS_PER_DAY,
  STATIC_COPY,
  fillSlots,
  isWithinQuietHours,
  lineFor,
  shouldSendNotification,
  type VoiceTrigger,
} from './copy';
import type { CoachPersonality } from '../engine/calibration';

const PERSONALITIES: CoachPersonality[] = ['CALM_MENTOR', 'STRICT_TRAINER', 'ELITE_COMMANDER'];
const TRIGGERS = Object.keys(COPY_BANK) as VoiceTrigger[];

/** §14 / §21: the things AXIOM must never say. */
const FORBIDDEN_CONTENT =
  /\b(calorie|calories|kcal|body ?fat|body ?composition|weigh(t)? (loss|goal|target)|lose weight|fasting|fast(ed)? (for|until)|slim|skinny|lean out|toned|shred|bulk|beach body|six.?pack|physique|look(s|ing)? (good|better)|attractive)\b/i;

const FORBIDDEN_TONE =
  /\b(pathetic|weak|lazy|excuse|shame|ashamed|disappoint|failure|you failed|loser|embarrass|don'?t lose|last chance|or else)\b/i;

describe('§14 — copy bank completeness', () => {
  it('covers every trigger for every personality', () => {
    for (const trigger of TRIGGERS) {
      for (const personality of PERSONALITIES) {
        const lines = COPY_BANK[trigger][personality];
        expect(lines.length, `${trigger}/${personality}`).toBeGreaterThan(0);
      }
    }
  });

  it('covers every moment §14 says the voice owns', () => {
    const owned: VoiceTrigger[] = [
      'TIER_UP',
      'LEVEL_UP',
      'ANOMALY_DISCOVERED',
      'RAID_COMPLETE',
      'SEASON_START',
      'RIVAL_WON',
      'RIVAL_LOST',
      'STREAK_MILESTONE',
    ];
    for (const trigger of owned) {
      expect(TRIGGERS, `${trigger} missing`).toContain(trigger);
    }
  });

  it('gives every line a written caption — §20, usable on mute', () => {
    for (const trigger of TRIGGERS) {
      for (const personality of PERSONALITIES) {
        for (const line of COPY_BANK[trigger][personality]) {
          expect(line.caption.length, `${trigger}/${personality}`).toBeGreaterThan(0);
          expect(line.spoken.length, `${trigger}/${personality}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('contains no placeholder copy — §25', () => {
    for (const trigger of TRIGGERS) {
      for (const personality of PERSONALITIES) {
        for (const line of COPY_BANK[trigger][personality]) {
          expect(line.spoken, trigger).not.toMatch(/TODO|placeholder|engaging microcopy|lorem/i);
        }
      }
    }
  });
});

describe('§14 / §21 — what AXIOM must never say', () => {
  it('never prescribes calories, weight, body fat or fasting', () => {
    for (const trigger of TRIGGERS) {
      for (const personality of PERSONALITIES) {
        for (const line of COPY_BANK[trigger][personality]) {
          expect(line.spoken, `${trigger}/${personality}`).not.toMatch(FORBIDDEN_CONTENT);
          expect(line.caption, `${trigger}/${personality}`).not.toMatch(FORBIDDEN_CONTENT);
        }
      }
    }
  });

  it('never uses shame, guilt or ultimatums', () => {
    for (const trigger of TRIGGERS) {
      for (const personality of PERSONALITIES) {
        for (const line of COPY_BANK[trigger][personality]) {
          expect(line.spoken, `${trigger}/${personality}`).not.toMatch(FORBIDDEN_TONE);
        }
      }
    }
  });

  it('keeps the same rules in static UI copy', () => {
    for (const [key, value] of Object.entries(STATIC_COPY)) {
      // The disclaimer legitimately mentions medical advice; the content filter
      // targets body and diet prescription, which none of these should contain.
      expect(value, key).not.toMatch(FORBIDDEN_CONTENT);
      expect(value, key).not.toMatch(FORBIDDEN_TONE);
    }
  });

  it('frames a tier drop without loss language', () => {
    for (const personality of PERSONALITIES) {
      for (const line of COPY_BANK.TIER_DOWN[personality]) {
        expect(line.spoken).not.toMatch(/lost|losing|demot|dropped|fell|failed/i);
      }
    }
  });

  it('frames a rival loss as a rematch, never as a personal verdict', () => {
    for (const personality of PERSONALITIES) {
      for (const line of COPY_BANK.RIVAL_LOST[personality]) {
        expect(line.spoken).not.toMatch(FORBIDDEN_TONE);
      }
    }
  });
});

describe('§21 — safety triggers override personality', () => {
  it('uses the calm register for a medical stop whatever the operator picked', () => {
    const commander = lineFor('MEDICAL_STOP', 'ELITE_COMMANDER');
    const calm = lineFor('MEDICAL_STOP', 'CALM_MENTOR');
    expect(commander.spoken).toBe(calm.spoken);
  });

  it('uses the calm register for a logged injury', () => {
    const commander = lineFor('INJURY_LOGGED', 'ELITE_COMMANDER');
    const calm = lineFor('INJURY_LOGGED', 'CALM_MENTOR');
    expect(commander.spoken).toBe(calm.spoken);
  });

  it('tells a medical-stop operator their rank is safe', () => {
    expect(lineFor('MEDICAL_STOP', 'STRICT_TRAINER').spoken).toMatch(/rank.*safe|safe.*rank/i);
  });

  it('tells an injured operator nothing decays', () => {
    const copy = lineFor('INJURY_LOGGED', 'CALM_MENTOR').spoken;
    expect(copy).toMatch(/paus|froze|frozen/i);
  });
});

describe('slot filling', () => {
  it('substitutes provided slots', () => {
    expect(fillSlots('Welcome to {tier}, level {level}.', { tier: 'STORM', level: 12 })).toBe(
      'Welcome to STORM, level 12.',
    );
  });

  it('leaves unknown slots intact rather than printing undefined', () => {
    expect(fillSlots('Hello {unknown}.', {})).toBe('Hello {unknown}.');
  });

  it('fills slots in both spoken and caption', () => {
    const line = lineFor('TIER_UP', 'STRICT_TRAINER', { tier: 'SOLAR' });
    expect(line.spoken).toContain('SOLAR');
    expect(line.caption).toContain('SOLAR');
    expect(line.spoken).not.toContain('{tier}');
  });

  it('rotates through variants deterministically', () => {
    const a = lineFor('LEVEL_UP', 'CALM_MENTOR', { level: 5 }, 0);
    const b = lineFor('LEVEL_UP', 'CALM_MENTOR', { level: 5 }, 1);
    expect(a.spoken).not.toBe(b.spoken);
    // Wraps rather than throwing.
    expect(lineFor('LEVEL_UP', 'CALM_MENTOR', { level: 5 }, 99).spoken).toBeTruthy();
  });

  it('leaves no unfilled slot when the expected slots are supplied', () => {
    const line = lineFor('RIVAL_WON', 'STRICT_TRAINER', { rival: 'Sunita', pillar: 'strength' });
    expect(line.spoken).not.toMatch(/\{\w+\}/);
  });
});

describe('§14 — free tier notification gating', () => {
  const base = {
    sentToday: 0,
    localHour: 10,
    quietHours: DEFAULT_QUIET_HOURS,
    medicalStopActive: false,
    isPremium: false,
  };

  it('sends inside waking hours under the cap', () => {
    expect(shouldSendNotification(base).send).toBe(true);
  });

  it('caps free operators at two per day', () => {
    expect(MAX_FREE_NOTIFICATIONS_PER_DAY).toBe(2);
    const decision = shouldSendNotification({ ...base, sentToday: 2 });
    expect(decision.send).toBe(false);
    expect(decision.reason).toBe('daily_cap_reached');
  });

  it('does not cap premium operators at the free limit', () => {
    expect(shouldSendNotification({ ...base, sentToday: 5, isPremium: true }).send).toBe(true);
  });

  it('respects quiet hours across the overnight wrap', () => {
    expect(isWithinQuietHours(22, DEFAULT_QUIET_HOURS)).toBe(true);
    expect(isWithinQuietHours(3, DEFAULT_QUIET_HOURS)).toBe(true);
    expect(isWithinQuietHours(6, DEFAULT_QUIET_HOURS)).toBe(true);
    expect(isWithinQuietHours(7, DEFAULT_QUIET_HOURS)).toBe(false);
    expect(isWithinQuietHours(14, DEFAULT_QUIET_HOURS)).toBe(false);
  });

  it('suppresses quiet-hours notifications for premium too', () => {
    const decision = shouldSendNotification({ ...base, localHour: 23, isPremium: true });
    expect(decision.send).toBe(false);
    expect(decision.reason).toBe('quiet_hours');
  });

  it('suppresses everything in the §21 medical-stop state', () => {
    const decision = shouldSendNotification({ ...base, medicalStopActive: true });
    expect(decision.send).toBe(false);
    expect(decision.reason).toBe('suppressed_medical_stop');
  });
});

describe('static copy obligations', () => {
  it('states the medical disclaimer in plain language', () => {
    expect(STATIC_COPY.medicalDisclaimer).toMatch(/not medical advice/i);
  });

  it('states the location policy plainly — §10', () => {
    expect(STATIC_COPY.privacyLocation).toMatch(/not.*track|never.*track|do not track/i);
    expect(STATIC_COPY.privacyLocation).toMatch(/sell/i);
  });

  it('explains the level-versus-tier tension honestly — §5', () => {
    expect(STATIC_COPY.levelVersusTier).toMatch(/both are true/i);
  });

  it('states the fairness rule to the user — §18', () => {
    expect(STATIC_COPY.fairnessPromise).toMatch(/no XP multipliers/i);
    expect(STATIC_COPY.fairnessPromise).toMatch(/performance only/i);
  });
});
