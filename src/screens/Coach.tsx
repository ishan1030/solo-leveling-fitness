import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import {
  Button,
  Divider,
  Notice,
  Panel,
  Screen,
  SectionLabel,
} from '../design/components';
import { palette, space, surface, type } from '../design/tokens';
import type { CoachPersonality } from '../engine/calibration';
import {
  DELOAD_EVERY_N_WEEKS,
  MAX_WEEKLY_LOAD_INCREASE,
  describeProgression,
  recommend,
  weeksUntilDeload,
} from '../engine/coach';
import { can, describeLapse } from '../engine/entitlements';
import { MAX_FREE_NOTIFICATIONS_PER_DAY, STATIC_COPY } from '../data/copy';
import { useApp } from '../state/store';
import { useWorld } from '../state/world';

/**
 * §14 — THE VOICE. Screens H1–H4.
 *
 * The premium proposition, and the one screen where the free/paid boundary is
 * visible. §18's fairness rule means everything here is voice, coaching and
 * analytics — none of it moves the ladder, and the screen says so.
 */

type Tab = 'coach' | 'voice' | 'history';

export function CoachScreen({ onDone }: { onDone: () => void }) {
  const [tab, setTab] = useState<Tab>('coach');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionLabel>AXIOM</SectionLabel>

        <View style={styles.tabs}>
          {(
            [
              ['coach', 'SESSION'],
              ['voice', 'VOICE'],
              ['history', 'HISTORY'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setTab(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              accessibilityLabel={label}
              style={[styles.tab, tab === value && styles.tabActive]}
            >
              <Text style={[type.label, { color: tab === value ? palette.base : palette.muted }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ height: space.lg }} />

        {tab === 'coach' && <CoachTab />}
        {tab === 'voice' && <VoiceTab />}
        {tab === 'history' && <HistoryTab />}

        <View style={{ height: space.lg }} />
        <Button label="Back" variant="ghost" onPress={onDone} />
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// H1 · Coach hub — the recommendation
// ---------------------------------------------------------------------------

/** Shared by the hub and the Home panel, so both read the identical engine output. */
export function useRecommendation() {
  const profile = useApp((s) => s.profile);
  const sessions = useApp((s) => s.sessions);
  const personality = useApp((s) => s.coachPersonality);
  const season = useWorld((s) => s.season);

  return useMemo(() => {
    if (!profile) return null;

    const weeksElapsed = Math.floor(
      (Date.now() - new Date(season.startedAt).getTime()) / (7 * 86_400_000),
    );

    return recommend({
      pillars: profile.pillars,
      sessions,
      readiness: profile.readiness,
      paused: profile.pausedFor !== null,
      personality,
      weekIndex: Math.max(0, weeksElapsed),
      // Demonstration anchors. In production these come from the operator's last
      // logged working set for the focus movement.
      currentLoadKg: 60,
      currentReps: 8,
      weeksAtLoad: 2,
      now: new Date(),
    });
  }, [profile, sessions, personality, season.startedAt]);
}

function CoachTab() {
  const recommendation = useRecommendation();
  const entitlements = useApp((s) => s.entitlements);
  const isPremium = can(entitlements, 'VOICE_COACH', new Date());

  if (!recommendation) return null;

  const weekIndex = Math.max(
    0,
    Math.floor((Date.now() - new Date('2026-01-05T00:00:00Z').getTime()) / (7 * 86_400_000)),
  );

  // §21: a suppressed recommendation shows why, and offers nothing else.
  if (recommendation.suppressed) {
    return (
      <View>
        <Notice tone={recommendation.suppressed === 'medical_stop' ? 'stop' : 'info'}>
          {recommendation.motivationalLine}
        </Notice>
        <View style={{ height: space.md }} />
        <Panel>
          <Text style={[type.small, { color: palette.muted }]}>
            {recommendation.suppressed === 'medical_stop'
              ? 'AXIOM will not suggest training until you tell us a doctor has cleared you. Nothing decays in the meantime.'
              : 'No sessions are scheduled while you are paused. Nothing decays, and your streak is held.'}
          </Text>
        </Panel>
      </View>
    );
  }

  return (
    <View>
      <Text style={[type.label, { color: palette.muted }]}>NEXT SESSION</Text>
      <Text style={[type.display, { color: palette.ink }]}>
        {recommendation.focusPillar.toUpperCase()}
      </Text>
      <Text style={[type.small, { color: palette.muted, marginTop: space.xxs }]}>
        {recommendation.muscleGroups.map((g) => g.replace('_', ' ').toUpperCase()).join(' · ')}
      </Text>

      <View style={{ height: space.md }} />

      {/* §15 — the prescribed step. */}
      <Panel accent={recommendation.isDeloadWeek ? '#F2A93B' : palette.signal}>
        <Text style={[type.label, { color: palette.muted }]}>
          {recommendation.isDeloadWeek ? 'DELOAD WEEK' : 'PROGRESSION'}
        </Text>
        <Text style={[type.body, { color: palette.ink, marginTop: space.xxs }]}>
          {describeProgression(recommendation.progression)}
        </Text>

        <Divider />

        <Text style={[type.small, { color: palette.muted }]}>
          Load never rises more than {Math.round(MAX_WEEKLY_LOAD_INCREASE * 100)}% in a week, and
          only one variable changes at a time. Deload every {DELOAD_EVERY_N_WEEKS}th week —{' '}
          {recommendation.isDeloadWeek
            ? 'that is this one.'
            : `${weeksUntilDeload(weekIndex)} week${weeksUntilDeload(weekIndex) === 1 ? '' : 's'} away.`}
        </Text>
      </Panel>

      <View style={{ height: space.sm }} />

      {/* §14 — recovery guidance. */}
      <Panel>
        <Text style={[type.label, { color: palette.muted }]}>
          RECOVERY · {recommendation.recovery.state.replace('_', ' ')}
        </Text>
        <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
          {recommendation.recovery.guidance}
        </Text>
        <Text style={[type.dataSmall, { color: palette.muted, marginTop: space.xs }]}>
          {recommendation.recovery.recentSessionCount} SESSIONS IN 7 DAYS
          {recommendation.recovery.daysSinceLastSession !== null &&
            ` · ${recommendation.recovery.daysSinceLastSession} SINCE LAST`}
        </Text>
      </Panel>

      {recommendation.conservative && (
        <View style={{ marginTop: space.sm }}>
          <Notice tone="caution">
            Conservative loading is in force based on your readiness answers.
            AXIOM progresses you at half the standard rate. Nothing is locked.
          </Notice>
        </View>
      )}

      <View style={{ height: space.md }} />

      {/* §14: one motivational line. Exactly one. */}
      <Panel>
        <Text style={[type.body, { color: palette.ink }]}>
          {recommendation.motivationalLine}
        </Text>
        {isPremium && (
          <>
            <View style={{ height: space.sm }} />
            <Button
              label="Speak"
              variant="secondary"
              accessibilityLabel="Read this line aloud"
              onPress={() => Speech.speak(recommendation.motivationalLine)}
            />
          </>
        )}
      </Panel>

      {!isPremium && (
        <View style={{ marginTop: space.md }}>
          <Notice tone="info">
            {`Free operators get AXIOM in text, up to ${MAX_FREE_NOTIFICATIONS_PER_DAY} notifications a day. Premium adds the voice. The recommendation itself is identical either way — coaching quality is not the paid tier.`}
          </Notice>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// H2 · Personality  +  H4 · Voice packs
// ---------------------------------------------------------------------------

const PERSONALITY_COPY: Record<
  CoachPersonality,
  { name: string; intensity: string; blurb: string }
> = {
  CALM_MENTOR: {
    name: 'CALM MENTOR',
    intensity: 'LOW',
    blurb:
      'Supportive and recovery-forward. Defaults here if your readiness answers flagged anything.',
  },
  STRICT_TRAINER: {
    name: 'STRICT TRAINER',
    intensity: 'MID',
    blurb: 'Direct and demanding. Never shaming — it pushes the work, not you.',
  },
  ELITE_COMMANDER: {
    name: 'ELITE COMMANDER',
    intensity: 'HIGH',
    blurb: 'Theatrical. Talks about the ladder like a campaign.',
  },
};

function VoiceTab() {
  const personality = useApp((s) => s.coachPersonality);
  const setPersonality = useApp((s) => s.setPersonality);
  const commanderOptIn = useApp((s) => s.commanderOptIn);
  const acceptCommanderOptIn = useApp((s) => s.acceptCommanderOptIn);
  const entitlements = useApp((s) => s.entitlements);

  const [showOptIn, setShowOptIn] = useState(false);
  const isPremium = can(entitlements, 'VOICE_COACH', new Date());
  const lapse = describeLapse();

  return (
    <View>
      <SectionLabel>Personality</SectionLabel>
      <Text style={[type.small, { color: palette.muted, marginBottom: space.sm }]}>
        These change what AXIOM says and how hard it pushes — not just the timbre.
        The recommendation underneath is the same in all three.
      </Text>

      {(Object.keys(PERSONALITY_COPY) as CoachPersonality[]).map((option) => {
        const copy = PERSONALITY_COPY[option];
        const selected = personality === option;
        const locked = option === 'ELITE_COMMANDER' && !commanderOptIn;

        return (
          <Pressable
            key={option}
            onPress={() => {
              if (locked) setShowOptIn(true);
              else setPersonality(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${copy.name}, ${copy.intensity} intensity. ${copy.blurb}${
              locked ? ' Requires an opt-in.' : ''
            }`}
            style={[styles.personalityRow, selected && styles.personalityRowSelected]}
          >
            <View style={[styles.radio, selected && styles.radioSelected]} />
            <View style={{ flex: 1 }}>
              <View style={styles.personalityHeader}>
                <Text style={[type.body, { color: palette.ink }]}>{copy.name}</Text>
                <Text style={[type.label, { color: palette.muted }]}>{copy.intensity}</Text>
              </View>
              <Text style={[type.small, { color: palette.muted, marginTop: 2 }]}>
                {copy.blurb}
              </Text>
              {locked && (
                <Text style={[type.label, { color: palette.alert, marginTop: space.xxs }]}>
                  REQUIRES OPT-IN
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}

      {/*
        §14: ELITE_COMMANDER is "gated behind an explicit opt-in that states
        plainly that it is roleplay flavour, not coaching advice."
      */}
      {showOptIn && !commanderOptIn && (
        <View style={{ marginTop: space.sm }}>
          <Panel accent={palette.alert}>
            <Text style={[type.label, { color: palette.alert }]}>BEFORE YOU PICK THIS</Text>
            <Text style={[type.small, { color: palette.ink, marginTop: space.xs }]}>
              Elite Commander is roleplay flavour. It is a voice, not coaching
              advice. The training it prescribes is identical to the other two —
              same loads, same deloads, same recovery rules — because the
              programming comes from your logged history, not from the character.
            </Text>
            <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
              It will never shame you or tell you to push through pain. If it ever
              reads that way, switch back and tell us.
            </Text>
            <View style={{ height: space.sm }} />
            <Button
              label="I understand — it's flavour, not advice"
              onPress={() => {
                acceptCommanderOptIn();
                setShowOptIn(false);
              }}
            />
            <View style={{ height: space.xs }} />
            <Button label="Never mind" variant="ghost" onPress={() => setShowOptIn(false)} />
          </Panel>
        </View>
      )}

      {/* H4 · Voice packs */}
      <View style={{ height: space.lg }} />
      <SectionLabel>Voice</SectionLabel>
      <Panel>
        <View style={styles.settingRow}>
          <Text style={[type.small, { color: palette.muted }]}>Status</Text>
          <Text style={[type.data, { color: isPremium ? palette.signal : palette.muted }]}>
            {isPremium ? 'SPOKEN' : 'TEXT ONLY'}
          </Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={[type.small, { color: palette.muted }]}>Engine</Text>
          <Text style={[type.dataSmall, { color: palette.ink }]}>ON-DEVICE</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={[type.small, { color: palette.muted }]}>Language</Text>
          <Text style={[type.dataSmall, { color: palette.ink }]}>ENGLISH</Text>
        </View>

        <Divider />

        <Text style={[type.small, { color: palette.muted }]}>
          Voice runs on your device. Nothing you say or hear leaves the phone.
          Offline, cached lines still play and personalised ones queue until you
          reconnect.
        </Text>
      </Panel>

      <View style={{ height: space.sm }} />
      <Panel>
        <Text style={[type.label, { color: palette.muted }]}>EVERY LINE IS CAPTIONED</Text>
        <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
          The app is fully usable on mute. Captions are the primary channel, not
          an accessibility afterthought — every cinematic is skippable and every
          spoken line is written on screen first.
        </Text>
      </Panel>

      {!isPremium && (
        <View style={{ marginTop: space.md }}>
          <Notice tone="info">{STATIC_COPY.fairnessPromise}</Notice>
        </View>
      )}

      <View style={{ height: space.md }} />
      <Panel>
        <Text style={[type.label, { color: palette.muted }]}>IF YOUR SUBSCRIPTION LAPSES</Text>
        <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
          {lapse.message}
        </Text>
      </Panel>
    </View>
  );
}

// ---------------------------------------------------------------------------
// H3 · Coaching history
// ---------------------------------------------------------------------------

function HistoryTab() {
  const history = useApp((s) => s.coachingHistory);

  return (
    <View>
      <SectionLabel>Coaching history</SectionLabel>
      <Text style={[type.small, { color: palette.muted, marginBottom: space.sm }]}>
        Everything AXIOM has said to you. This stays readable forever, including
        if you stop paying — §14 is explicit that nothing earned is ever removed.
      </Text>

      {history.length === 0 ? (
        <Panel>
          <Text style={[type.body, { color: palette.ink }]}>Nothing yet.</Text>
          <Text style={[type.small, { color: palette.muted, marginTop: space.xxs }]}>
            AXIOM starts talking after your first logged session.
          </Text>
        </Panel>
      ) : (
        <Panel>
          {history.map((entry, index) => (
            <View key={`${entry.at}_${index}`}>
              {index > 0 && <View style={styles.rowDivider} />}
              <View
                style={styles.historyRow}
                accessible
                accessibilityLabel={`${entry.trigger} on ${entry.at.slice(0, 10)}: ${entry.line}`}
              >
                <Text style={[type.label, { color: palette.muted }]}>
                  {entry.trigger.replace(/_/g, ' ')} · {entry.at.slice(0, 10)}
                </Text>
                <Text style={[type.small, { color: palette.ink, marginTop: 2 }]}>
                  {entry.line}
                </Text>
              </View>
            </View>
          ))}
        </Panel>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xl,
  },
  tabs: {
    flexDirection: 'row',
    gap: space.xs,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
  },
  tabActive: {
    backgroundColor: palette.signal,
    borderColor: palette.signal,
  },
  personalityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    minHeight: 64,
    padding: space.md,
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
    marginBottom: space.xs,
  },
  personalityRowSelected: {
    borderColor: palette.signal,
  },
  personalityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.muted,
    marginTop: 4,
  },
  radioSelected: {
    backgroundColor: palette.signal,
    borderColor: palette.signal,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.xxs,
  },
  rowDivider: {
    height: surface.hairlineWidth,
    backgroundColor: surface.borderColor,
  },
  historyRow: {
    paddingVertical: space.xs,
  },
});
