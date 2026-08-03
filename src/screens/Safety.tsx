import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Divider,
  Notice,
  Panel,
  Screen,
  SectionLabel,
} from '../design/components';
import { palette, space, surface, type } from '../design/tokens';
import { FREE_REST_DAYS_PER_WEEK, STREAK_FREEZES_PER_MONTH } from '../engine/streaks';
import type { PauseReason } from '../engine/types';
import { STATIC_COPY, lineFor } from '../data/copy';
import { useApp } from '../state/store';

/**
 * §21 — the safety surfaces.
 *
 * The design rule running through all of these: **nothing here costs the
 * operator anything.** Not rank, not streak, not progress, not standing. §21
 * forbids any mechanic that penalises rest, illness or injury, and these screens
 * are where that promise is either kept visibly or quietly broken.
 */

// ---------------------------------------------------------------------------

/**
 * §21: "If an operator logs chest pain, dizziness, fainting, or severe pain:
 * surface a clear 'stop and seek medical attention' state and suppress all
 * challenge prompts."
 *
 * Full-screen and unmissable, but **not modal** — it never traps the operator.
 * They can leave it. What they cannot do is receive a challenge prompt while it
 * is active, which is enforced upstream in the quest engine and the notification
 * gate rather than here.
 */
export function MedicalStopScreen({ onDismiss }: { onDismiss: () => void }) {
  const personality = useApp((s) => s.coachPersonality);
  const voice = lineFor('MEDICAL_STOP', personality);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.stopContent}>
        <View style={styles.stopRule} />
        <Text style={[type.label, { color: palette.alert }]}>STOP</Text>
        <Text style={[type.display, { color: palette.ink, marginTop: space.sm }]}>
          Speak to a doctor before you train again.
        </Text>

        <View style={{ height: space.lg }} />
        <Text style={[type.body, { color: palette.ink }]}>{voice.caption}</Text>

        <View style={{ height: space.lg }} />
        <Panel accent={palette.alert}>
          <Text style={[type.label, { color: palette.muted }]}>WHILE THIS IS ACTIVE</Text>
          <View style={{ height: space.xs }} />
          {[
            'Your rank is frozen exactly where it is',
            'Nothing decays, no matter how long this takes',
            'Your streak is paused',
            'No quests, trials or challenge prompts will reach you',
            'Everything you have earned stays earned',
          ].map((line) => (
            <View key={line} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={[type.small, { color: palette.ink, flex: 1 }]}>{line}</Text>
            </View>
          ))}
        </Panel>

        <View style={{ height: space.lg }} />
        <Notice tone="stop">{STATIC_COPY.medicalDisclaimer}</Notice>

        <View style={{ height: space.lg }} />
        <Button
          label="I understand"
          onPress={onDismiss}
          accessibilityLabel="Dismiss this notice. It will remain on your profile until you clear it."
        />
        <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
          This stays on your profile until you tell us a doctor has cleared you.
          Dismissing it here only closes this screen.
        </Text>
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

/**
 * §16 / §21: "Logging injury or illness pauses the streak indefinitely, no
 * penalty, no guilt copy."
 *
 * The copy on this screen was written to be read by someone who feels bad about
 * missing training. It contains no encouragement to return early, no countdown,
 * and no mention of what they will miss.
 */
export function LogInjuryScreen({
  onDone,
  onShowRecoveryPath,
}: {
  onDone: () => void;
  onShowRecoveryPath: () => void;
}) {
  const pauseFor = useApp((s) => s.pauseFor);
  const streak = useApp((s) => s.streak);
  const personality = useApp((s) => s.coachPersonality);
  const [reason, setReason] = useState<Exclude<PauseReason, null>>('injury');

  const voice = lineFor('INJURY_LOGGED', personality);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>Pause training</SectionLabel>
        <Text style={[type.display, { color: palette.ink }]}>What is going on?</Text>

        <View style={{ height: space.lg }} />

        {(
          [
            ['injury', 'Injured', 'Something is hurt and training would make it worse.'],
            ['illness', 'Unwell', 'Sick, run down, or recovering from something.'],
          ] as const
        ).map(([value, label, detail]) => (
          <Pressable
            key={value}
            onPress={() => setReason(value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: reason === value }}
            accessibilityLabel={`${label}. ${detail}`}
            style={[styles.reasonRow, reason === value && styles.reasonRowSelected]}
          >
            <View style={[styles.radio, reason === value && styles.radioSelected]} />
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: palette.ink }]}>{label}</Text>
              <Text style={[type.small, { color: palette.muted }]}>{detail}</Text>
            </View>
          </Pressable>
        ))}

        <View style={{ height: space.lg }} />
        <Panel accent={palette.signal}>
          <Text style={[type.label, { color: palette.signal }]}>WHAT THIS COSTS YOU</Text>
          <Text style={[type.title, { color: palette.ink, marginTop: space.xs }]}>Nothing.</Text>
          <Divider />
          {[
            `Your streak holds at ${streak.count} for as long as you need`,
            'Your power score does not decay, at all, ever, while paused',
            'Your tier is frozen',
            'No quest prompts, no notifications, no nudges to come back',
          ].map((line) => (
            <View key={line} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={[type.small, { color: palette.ink, flex: 1 }]}>{line}</Text>
            </View>
          ))}
        </Panel>

        <View style={{ height: space.md }} />
        <Text style={[type.body, { color: palette.ink }]}>{voice.caption}</Text>

        <View style={{ height: space.lg }} />
        <Button
          label="Pause my training"
          onPress={() => {
            pauseFor(reason);
            // §15: "offers a recovery path."
            onShowRecoveryPath();
          }}
        />
        <View style={{ height: space.xs }} />
        <Button label="Never mind" variant="ghost" onPress={onDone} />
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

/**
 * §J4 / §J5 — privacy and accessibility, stated in-product.
 *
 * §10 requires the location policy to be stated in the product in plain
 * language, not only in a privacy policy nobody opens.
 */
export function SettingsScreen({
  onLogInjury,
  onMedicalInfo,
}: {
  onLogInjury: () => void;
  onMedicalInfo: () => void;
}) {
  const profile = useApp((s) => s.profile);
  const resume = useApp((s) => s.resume);
  const streak = useApp((s) => s.streak);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionLabel>Training status</SectionLabel>
        {profile?.pausedFor ? (
          <Panel accent={palette.signal}>
            <Text style={[type.body, { color: palette.ink }]}>
              Paused for {profile.pausedFor}. Nothing is decaying.
            </Text>
            <View style={{ height: space.sm }} />
            <Button label="I'm ready to train" onPress={resume} />
          </Panel>
        ) : (
          <Panel>
            <Text style={[type.body, { color: palette.ink }]}>Training normally.</Text>
            <View style={{ height: space.sm }} />
            <Button label="Log an injury or illness" variant="secondary" onPress={onLogInjury} />
          </Panel>
        )}

        <View style={{ height: space.lg }} />
        <SectionLabel>Streaks</SectionLabel>
        <Panel>
          <Text style={[type.small, { color: palette.ink }]}>
            {STATIC_COPY.streakPhilosophy}
          </Text>
          <Divider />
          <Row label="Current streak" value={String(streak.count)} />
          <Row
            label="Free rest days per week"
            value={String(FREE_REST_DAYS_PER_WEEK)}
          />
          <Row
            label="Freezes remaining this month"
            value={`${streak.freezesRemaining} of ${STREAK_FREEZES_PER_MONTH}`}
          />
        </Panel>

        <View style={{ height: space.lg }} />
        <SectionLabel>Privacy</SectionLabel>
        <Panel>
          <Text style={[type.small, { color: palette.ink }]}>
            {STATIC_COPY.privacyLocation}
          </Text>
          <Divider />
          <Text style={[type.small, { color: palette.muted }]}>
            Background location is not merely unused — the permission is blocked
            in the app's build configuration, so the capability is not compiled
            into the app at all.
          </Text>
        </Panel>

        <View style={{ height: space.lg }} />
        <SectionLabel>What this app does not track</SectionLabel>
        <Panel>
          <Text style={[type.small, { color: palette.ink }]}>
            No calories. No weight targets. No body-fat or body-composition
            anything. No commentary on how you look, ever, from AXIOM or anywhere
            else. Meridian measures training performance and nothing else.
          </Text>
        </Panel>

        <View style={{ height: space.lg }} />
        <SectionLabel>Money</SectionLabel>
        <Panel>
          <Text style={[type.small, { color: palette.ink }]}>
            {STATIC_COPY.fairnessPromise}
          </Text>
        </Panel>

        <View style={{ height: space.lg }} />
        <Button label="Medical information" variant="secondary" onPress={onMedicalInfo} />

        <View style={{ height: space.lg }} />
        <Text style={[type.small, { color: palette.muted }]}>
          {STATIC_COPY.medicalDisclaimer}
        </Text>
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

/**
 * §15 / §J3 — the recovery path, offered after any injury log.
 *
 * Deliberately not a rehab protocol. This app is not qualified to write one and
 * §21's disclaimer says so. What it can honestly offer is the mechanics of
 * coming back without re-injuring yourself: start below where you left off,
 * change one variable at a time, and stop meaning stop.
 */
export function RecoveryPathScreen({ onDone }: { onDone: () => void }) {
  const profile = useApp((s) => s.profile);
  const resume = useApp((s) => s.resume);
  const streak = useApp((s) => s.streak);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>Coming back</SectionLabel>
        <Text style={[type.display, { color: palette.ink }]}>No rush.</Text>
        <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
          Nothing here expires. Your streak is held at {streak.count}, your rank
          is frozen, and no part of this app is counting the days.
        </Text>

        <View style={{ height: space.lg }} />
        <SectionLabel>When you do come back</SectionLabel>
        <Panel accent={palette.signal}>
          {[
            [
              'You start lighter',
              'AXIOM opens your returning block well below where you stopped. That is not a judgement about you — it is how everyone should return, and it is not negotiable in the programming.',
            ],
            [
              'One variable at a time',
              'Load or reps, never both. Progress is capped at 5% a week even when you feel ready for more, because week one is where returning operators get hurt again.',
            ],
            [
              'Stop still means stop',
              'The STOP control is on every session screen. Using it a second time costs exactly as little as the first.',
            ],
            [
              'Everything you completed counts',
              'Including the sets you finished in the session where you got hurt. Losing those would be a penalty for getting injured, and this app does not do that.',
            ],
          ].map(([heading, body]) => (
            <View key={heading} style={{ marginBottom: space.sm }}>
              <Text style={[type.label, { color: palette.signal }]}>
                {String(heading).toUpperCase()}
              </Text>
              <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
                {body}
              </Text>
            </View>
          ))}
        </Panel>

        <View style={{ height: space.md }} />
        <Notice tone="caution">
          If something still hurts, it is too early — regardless of what any app
          tells you. See a clinician before you load it.
        </Notice>

        <View style={{ height: space.lg }} />
        {profile?.pausedFor ? (
          <Button
            label="I'm ready to train"
            onPress={() => {
              resume();
              onDone();
            }}
          />
        ) : (
          <Button label="Done" onPress={onDone} />
        )}
        <View style={{ height: space.xs }} />
        <Button label="Not yet" variant="ghost" onPress={onDone} />

        <View style={{ height: space.lg }} />
        <Text style={[type.small, { color: palette.muted }]}>
          {STATIC_COPY.medicalDisclaimer}
        </Text>
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.settingRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.small, { color: palette.muted }]}>{label}</Text>
      <Text style={[type.data, { color: palette.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xl,
  },
  stopContent: {
    paddingTop: space.xxl,
  },
  stopRule: {
    width: 40,
    height: 2,
    backgroundColor: palette.alert,
    marginBottom: space.md,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    marginBottom: space.xs,
  },
  bullet: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: palette.muted,
    marginTop: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
    marginBottom: space.xs,
  },
  reasonRowSelected: {
    borderColor: palette.signal,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.muted,
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
});
