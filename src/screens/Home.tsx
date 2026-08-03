import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Divider,
  Notice,
  Panel,
  Screen,
  SectionLabel,
  Stat,
  TierBadge,
  TierSigil,
} from '../design/components';
import { palette, space, tierVisuals, type } from '../design/tokens';
import { resolveReadiness } from '../engine/calibration';
import { cpsForNextTier, describeLevelTierTension, xpForNextLevel } from '../engine/progression';
import { generateDailyQuests, generateWeeklyQuest } from '../engine/quests';
import { requiresMedicalStop } from '../engine/types';
import { describeProgression } from '../engine/coach';
import { STATIC_COPY } from '../data/copy';
import { useRecommendation } from './Coach';
import { useApp } from '../state/store';

/**
 * The returning-operator home screen.
 *
 * §4: "Also specify: what a returning user sees on open (not the same screen)."
 * A returning operator lands here, never back in calibration. The screen leads
 * with today's obligation — the active quest — rather than with a summary of
 * the past, because the past does not bring anyone back on day 12.
 */
export function HomeScreen({
  onStartSession,
  onCheckIn,
  onOpenSettings,
  onOpenCoach,
}: {
  onStartSession: () => void;
  onCheckIn: () => void;
  onOpenSettings: () => void;
  onOpenCoach: () => void;
}) {
  const recommendation = useRecommendation();
  const profile = useApp((s) => s.profile);
  const standing = useApp((s) => s.standing());
  const streak = useApp((s) => s.streak);
  const resume = useApp((s) => s.resume);

  const readiness = useMemo(
    () => (profile ? resolveReadiness(profile.readiness) : null),
    [profile],
  );

  const quests = useMemo(() => {
    if (!profile) return null;
    return generateDailyQuests({
      operatorId: profile.id,
      pillars: profile.pillars,
      availableDays: [1, 2, 3, 4, 5],
      restDays: [0, 6],
      previousDayMuscleGroups: [],
      loggedCapacity: {
        medianRepsPerSession: 60,
        medianVolumeKgPerSession: 4000,
        medianDistanceMPerSession: 4000,
      },
      medicalStopActive: requiresMedicalStop(profile.readiness),
      paused: profile.pausedFor !== null,
      now: new Date(),
    });
  }, [profile]);

  const weekly = useMemo(() => {
    if (!profile) return null;
    return generateWeeklyQuest({
      operatorId: profile.id,
      pillars: profile.pillars,
      availableDays: [1, 2, 3, 4, 5],
      restDays: [0, 6],
      previousDayMuscleGroups: [],
      loggedCapacity: {
        medianRepsPerSession: 60,
        medianVolumeKgPerSession: 4000,
        medianDistanceMPerSession: 4000,
      },
      medicalStopActive: requiresMedicalStop(profile.readiness),
      paused: profile.pausedFor !== null,
      now: new Date(),
    });
  }, [profile]);

  if (!profile || !standing || !readiness) return null;

  const visual = tierVisuals[standing.tier];
  const nextTierAt = cpsForNextTier(standing.cps);
  const tension = describeLevelTierTension(standing);
  const xpNeeded = xpForNextLevel(standing.level);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* §21: the medical-stop state is the first thing on the screen and it
            suppresses every challenge prompt below it. */}
        {readiness.medicalStopState && <Notice tone="stop">{readiness.bannerCopy!}</Notice>}
        {!readiness.medicalStopState && readiness.showPhysicianBanner && (
          <Notice tone="caution">{readiness.bannerCopy!}</Notice>
        )}

        {/* §16: a paused operator sees no prompting, only a way back. */}
        {profile.pausedFor && (
          <Notice
            tone="info"
            action={{ label: 'I am ready to train', onPress: resume }}
          >
            {profile.pausedFor === 'injury'
              ? 'Recovery mode. Your streak and rank are frozen. Nothing decays while you are here.'
              : 'Illness pause. Everything is held exactly where it is.'}
          </Notice>
        )}

        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: palette.muted }]}>OPERATOR</Text>
            <Text style={[type.title, { color: palette.ink }]}>{profile.displayName}</Text>
            <View style={{ height: space.xs }} />
            <TierBadge tier={standing.tier} />
          </View>
          <TierSigil tier={standing.tier} size={72} />
        </View>

        <Panel style={styles.scorePanel}>
          <View style={styles.scoreRow}>
            <Stat label="Power score" value={standing.cps.toFixed(1)} accent={visual.color} />
            <Stat label="Level" value={String(standing.level)} />
            <Stat label="Streak" value={String(streak.count)} />
          </View>

          <Divider />

          <View style={styles.progressRow}>
            <Text style={[type.dataSmall, { color: palette.muted }]}>
              {nextTierAt === null
                ? 'AT THE TOP OF THE LADDER'
                : `${(nextTierAt - standing.cps).toFixed(1)} CPS TO NEXT TIER`}
            </Text>
            <Text style={[type.dataSmall, { color: palette.muted }]}>
              {xpNeeded === Infinity
                ? 'MAX LEVEL'
                : `${standing.xpIntoLevel} / ${xpNeeded} XP`}
            </Text>
          </View>
        </Panel>

        {/* §5: the level-versus-tier tension, stated as honest rather than punishing. */}
        {tension && (
          <Panel style={{ marginTop: space.sm }}>
            <Text style={[type.small, { color: palette.ink }]}>{tension}</Text>
            <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
              {STATIC_COPY.levelVersusTier}
            </Text>
          </Panel>
        )}

        {/* §6: the trust cap, kept visible rather than mentioned once at onboarding. */}
        {standing.trustCapped && (
          <View style={{ marginTop: space.sm }}>
            <Notice
              tone="caution"
              action={{ label: 'Verify a session', onPress: onCheckIn }}
            >
              {`Your score is worth ${standing.uncappedTier}. Self-reported profiles show as ${standing.tier} until one session is verified.`}
            </Notice>
          </View>
        )}

        {/* §14: AXIOM's next-session recommendation drives the daily loop, so
            it sits above the quest board rather than behind a tab. */}
        {recommendation && !recommendation.suppressed && (
          <>
            <View style={{ height: space.lg }} />
            <SectionLabel>AXIOM</SectionLabel>
            <Panel accent={palette.signal}>
              <Text style={[type.label, { color: palette.signal }]}>
                NEXT SESSION · {recommendation.focusPillar.toUpperCase()}
                {recommendation.isDeloadWeek ? ' · DELOAD' : ''}
              </Text>
              <Text style={[type.small, { color: palette.ink, marginTop: space.xs }]}>
                {describeProgression(recommendation.progression)}
              </Text>
              <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
                {recommendation.recovery.guidance}
              </Text>
              <View style={{ height: space.sm }} />
              <Button label="Open AXIOM" variant="secondary" onPress={onOpenCoach} />
            </Panel>
          </>
        )}

        <View style={{ height: space.lg }} />

        <SectionLabel>Today</SectionLabel>
        {quests?.suppressedReason === 'rest_day' && (
          <Panel>
            <Text style={[type.body, { color: palette.ink }]}>Scheduled rest day.</Text>
            <Text style={[type.small, { color: palette.muted, marginTop: space.xxs }]}>
              {STATIC_COPY.streakPhilosophy}
            </Text>
          </Panel>
        )}
        {quests?.suppressedReason === 'medical_stop' && (
          <Panel>
            <Text style={[type.body, { color: palette.ink }]}>
              Challenges are paused while you get this checked.
            </Text>
          </Panel>
        )}
        {quests?.suppressedReason === 'paused' && (
          <Panel>
            <Text style={[type.body, { color: palette.ink }]}>
              Nothing scheduled. Rest is the training right now.
            </Text>
          </Panel>
        )}

        {quests?.primary && (
          <Panel accent={palette.signal}>
            <Text style={[type.label, { color: palette.signal }]}>
              PRIMARY · {quests.primary.title}
            </Text>
            <Text style={[type.body, { color: palette.ink, marginTop: space.xs }]}>
              {quests.primary.objective}
            </Text>
            <Text style={[type.dataSmall, { color: palette.muted, marginTop: space.xs }]}>
              +{quests.primary.rewardXp} XP
            </Text>
          </Panel>
        )}

        {quests?.optional.map((quest) => (
          <Panel key={quest.id} style={{ marginTop: space.xs }}>
            <Text style={[type.label, { color: palette.muted }]}>OPTIONAL · {quest.title}</Text>
            <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
              {quest.objective}
            </Text>
            <Text style={[type.dataSmall, { color: palette.muted, marginTop: space.xxs }]}>
              +{quest.rewardPillarPoints} {quest.pillar}
            </Text>
          </Panel>
        ))}

        {weekly && (
          <>
            <View style={{ height: space.lg }} />
            <SectionLabel>This week</SectionLabel>
            <Panel>
              <Text style={[type.label, { color: palette.muted }]}>{weekly.title}</Text>
              <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
                {weekly.objective}
              </Text>
            </Panel>
          </>
        )}

        <View style={{ height: space.xl }} />
        <Button label="Start session" onPress={onStartSession} />
        <View style={{ height: space.xs }} />
        <Button
          label="Scan into a venue"
          variant="secondary"
          onPress={onCheckIn}
          accessibilityLabel="Scan into a partner venue to verify this session"
        />
        <View style={{ height: space.xs }} />
        <Button label="Settings and safety" variant="ghost" onPress={onOpenSettings} />

        <View style={{ height: space.lg }} />
        <Text style={[type.small, { color: palette.muted }]}>
          {STATIC_COPY.medicalDisclaimer}
        </Text>
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  scorePanel: {
    gap: space.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
