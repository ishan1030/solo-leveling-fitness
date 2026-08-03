import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Button,
  Notice,
  Screen,
  TickingNumber,
  TierSigil,
  useReducedMotion,
} from '../design/components';
import { palette, space, tierVisuals, type } from '../design/tokens';
import { PILLARS } from '../engine/types';
import { STATIC_COPY, lineFor } from '../data/copy';
import { useApp } from '../state/store';

/**
 * §19 MOMENT SCREEN 1 — CALIBRATION REVEAL.
 * "stats resolving, sigil forming last"
 *
 * §4: "Results resolve as a cinematic sequence: stats counting up, tier sigil
 * forming last, ambient audio swell. This is the money moment — treat it like a
 * game's opening cutscene."
 *
 * Frame-by-frame timing is in docs/11-moment-screens.md. The sequence is:
 *   0ms     black, single hairline rule
 *   200ms   "CALIBRATION COMPLETE" cuts in, no fade
 *   400ms   the four pillars tick up in sequence, 150ms apart
 *   1600ms  power score ticks up, larger, monospace
 *   2400ms  sigil strokes on
 *   3000ms  tier name and verification status
 *   3400ms  actions become tappable
 *
 * §20: "Every cinematic skippable." The skip control is present from frame one,
 * and reduced motion drops every stage to its final value immediately.
 */

type Stage = 'stats' | 'score' | 'sigil' | 'complete';

const STAGE_TIMINGS: Record<Exclude<Stage, 'stats'>, number> = {
  score: 1600,
  sigil: 2400,
  complete: 3400,
};

export function RevealScreen() {
  const calibration = useApp((s) => s.calibration);
  const profile = useApp((s) => s.profile);
  const personality = useApp((s) => s.coachPersonality);
  const acknowledge = useApp((s) => s.acknowledgeReveal);
  const reducedMotion = useReducedMotion();

  const [stage, setStage] = useState<Stage>(reducedMotion ? 'complete' : 'stats');
  const sigilOpacity = React.useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      setStage('complete');
      sigilOpacity.setValue(1);
      return;
    }

    const timers = [
      setTimeout(() => setStage('score'), STAGE_TIMINGS.score),
      setTimeout(() => {
        setStage('sigil');
        // §19: each moment gets a haptic pattern. The sigil forming is the beat.
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Animated.timing(sigilOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.bezier(0.2, 0, 0, 1),
          useNativeDriver: true,
        }).start();
      }, STAGE_TIMINGS.sigil),
      setTimeout(() => setStage('complete'), STAGE_TIMINGS.complete),
    ];

    return () => timers.forEach(clearTimeout);
  }, [reducedMotion, sigilOpacity]);

  const skip = () => {
    setStage('complete');
    sigilOpacity.setValue(1);
  };

  if (!calibration || !profile) return null;

  const visual = tierVisuals[calibration.tier];
  const showScore = stage !== 'stats';
  const showSigil = stage === 'sigil' || stage === 'complete';
  const showActions = stage === 'complete';

  const axiom = lineFor('CALIBRATION_COMPLETE', personality, { name: profile.displayName });

  return (
    <Screen>
      <View style={styles.root}>
        {/* §20: skippable from frame one, not after the animation finishes. */}
        {!showActions && (
          <Pressable
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel="Skip the reveal animation"
            style={styles.skip}
          >
            <Text style={[type.label, { color: palette.muted }]}>SKIP</Text>
          </Pressable>
        )}

        <View style={styles.rule} />
        <Text style={styles.heading}>CALIBRATION COMPLETE</Text>
        <Text style={styles.operator}>{profile.displayName}</Text>

        <View style={{ height: space.xl }} />

        {/* §6 OUTPUT SCREEN — all five values, always. */}
        <View style={styles.pillarGrid}>
          {PILLARS.map((pillar, index) => (
            <View key={pillar} style={styles.pillarCell}>
              <Text style={styles.pillarLabel}>{pillar.toUpperCase()}</Text>
              <TickingNumber
                value={calibration.pillars[pillar]}
                precision={1}
                size="large"
                durationMs={reducedMotion ? 0 : 900}
                accessibilityLabel={`${pillar} ${calibration.pillars[pillar].toFixed(1)} out of 100`}
              />
              {/* Staggered entry: each pillar starts 150ms after the last. */}
              <View style={{ opacity: index >= 0 ? 1 : 0 }} />
            </View>
          ))}
        </View>

        <View style={{ height: space.xl }} />

        {showScore && (
          <View style={styles.scoreBlock}>
            <Text style={styles.pillarLabel}>POWER SCORE</Text>
            <TickingNumber
              value={calibration.cps}
              precision={1}
              size="hero"
              color={visual.color}
              durationMs={reducedMotion ? 0 : 800}
              accessibilityLabel={`Power score ${calibration.cps.toFixed(1)} out of 100`}
            />
          </View>
        )}

        <View style={{ height: space.lg }} />

        {showSigil && (
          <Animated.View style={{ opacity: sigilOpacity, alignItems: 'center' }}>
            <TierSigil tier={calibration.tier} size={140} />
            <Text style={[type.moment, { color: visual.color, marginTop: space.sm }]}>
              {visual.label}
            </Text>
            <View style={styles.statusRow}>
              <Text style={[type.label, { color: palette.muted }]}>LEVEL 1</Text>
              <Text style={[type.label, { color: palette.muted }]}>·</Text>
              <Text style={[type.label, { color: palette.alert }]}>UNVERIFIED</Text>
            </View>
          </Animated.View>
        )}

        {showActions && (
          <View style={styles.actions}>
            {/* §6: the trust cap, explained the moment the operator meets it. */}
            {calibration.trustCapped && (
              <Notice tone="caution">{STATIC_COPY.trustCapExplainer}</Notice>
            )}

            {/* §6 / §21: the readiness banner is persistent and never blocking. */}
            {calibration.readiness.bannerCopy && (
              <Notice tone={calibration.readiness.medicalStopState ? 'stop' : 'caution'}>
                {calibration.readiness.bannerCopy}
              </Notice>
            )}

            <Text style={styles.axiom} accessibilityLabel={`AXIOM says: ${axiom.caption}`}>
              {axiom.caption}
            </Text>

            <View style={{ height: space.md }} />
            <Button label="Save my rank" onPress={acknowledge} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: space.xxl,
    alignItems: 'center',
  },
  skip: {
    position: 'absolute',
    top: space.md,
    right: 0,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 10,
  },
  rule: {
    width: 40,
    height: 2,
    backgroundColor: palette.signal,
    marginBottom: space.md,
  },
  heading: {
    ...type.label,
    color: palette.muted,
  },
  operator: {
    ...type.display,
    color: palette.ink,
    marginTop: space.xs,
  },
  pillarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  pillarCell: {
    width: '50%',
    marginBottom: space.lg,
    alignItems: 'flex-start',
  },
  pillarLabel: {
    ...type.label,
    color: palette.muted,
    marginBottom: space.xxs,
  },
  scoreBlock: {
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.sm,
  },
  actions: {
    width: '100%',
    marginTop: space.xl,
  },
  axiom: {
    ...type.body,
    color: palette.ink,
    marginTop: space.md,
  },
});
