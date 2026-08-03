import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Button,
  Screen,
  TickingNumber,
  TierSigil,
  useReducedMotion,
} from '../design/components';
import { motion, palette, space, tierVisuals, type } from '../design/tokens';
import type { Tier } from '../engine/types';
import { lineFor } from '../data/copy';
import { useApp, useStanding } from '../state/store';

/**
 * §19 moment screens 2 and 3, specified frame by frame in
 * docs/11-moment-screens.md.
 *
 * §20 applies to both: skippable from frame one, and under reduced motion every
 * stage resolves immediately — the content always arrives, only the transition
 * is removed.
 */

// ---------------------------------------------------------------------------
// MOMENT 2 — TIER-UP
// ---------------------------------------------------------------------------

type TierUpStage = 'rest' | 'fracture' | 'reform' | 'complete';

const TIER_UP_TIMINGS: Record<Exclude<TierUpStage, 'rest'>, number> = {
  fracture: 150,
  reform: 600,
  complete: 1400,
};

/**
 * "sigil shatters and reforms in the new tier's colour and sound"
 *
 * The fracture is rendered as three offset copies of the sigil drifting outward
 * and dimming, then collapsing back recoloured. Real per-path fragmentation
 * along each sigil's own construction lines is the production treatment
 * (documented in docs/11); this is the same choreography at component level, so
 * the timing, haptics and copy are all exercised.
 */
export function TierUpScreen({
  from,
  to,
  onDone,
}: {
  from: Tier;
  to: Tier;
  onDone: () => void;
}) {
  const personality = useApp((s) => s.coachPersonality);
  const standing = useStanding();
  const reducedMotion = useReducedMotion();

  const [stage, setStage] = useState<TierUpStage>(reducedMotion ? 'complete' : 'rest');
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      setStage('complete');
      drift.setValue(0);
      return;
    }

    const timers = [
      setTimeout(() => {
        setStage('fracture');
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Animated.timing(drift, {
          toValue: 1,
          duration: 450,
          easing: Easing.bezier(motion.easing.x1, motion.easing.y1, motion.easing.x2, motion.easing.y2),
          useNativeDriver: true,
        }).start();
      }, TIER_UP_TIMINGS.fracture),

      setTimeout(() => {
        setStage('reform');
        Animated.timing(drift, {
          toValue: 0,
          duration: 250,
          easing: Easing.bezier(motion.easing.x1, motion.easing.y1, motion.easing.x2, motion.easing.y2),
          useNativeDriver: true,
        }).start(() => {
          // The landing is the beat — heavy impact, not the fracture.
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        });
      }, TIER_UP_TIMINGS.reform),

      setTimeout(() => setStage('complete'), TIER_UP_TIMINGS.complete),
    ];

    return () => timers.forEach(clearTimeout);
  }, [reducedMotion, drift]);

  const skip = () => {
    setStage('complete');
    drift.setValue(0);
  };

  const displayTier = stage === 'rest' || stage === 'fracture' ? from : to;
  const visual = tierVisuals[displayTier];
  const fractured = stage === 'fracture';
  const voice = lineFor('TIER_UP', personality, { tier: to });

  const offset = (direction: number) =>
    drift.interpolate({ inputRange: [0, 1], outputRange: [0, 18 * direction] });

  return (
    <Screen>
      <View style={styles.root}>
        {stage !== 'complete' && (
          <Pressable
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel="Skip the tier-up animation"
            style={styles.skip}
          >
            <Text style={[type.label, { color: palette.muted }]}>SKIP</Text>
          </Pressable>
        )}

        <Text style={[type.label, { color: palette.muted }]}>TIER UP</Text>
        <View style={{ height: space.xl }} />

        <View style={styles.sigilStack}>
          {/* Two drifting copies read as fragments while the fracture holds. */}
          <Animated.View
            style={[
              styles.fragment,
              { opacity: fractured ? 0.4 : 0, transform: [{ translateX: offset(-1) }] },
            ]}
          >
            <TierSigil tier={displayTier} size={132} />
          </Animated.View>
          <Animated.View
            style={[
              styles.fragment,
              { opacity: fractured ? 0.4 : 0, transform: [{ translateX: offset(1) }] },
            ]}
          >
            <TierSigil tier={displayTier} size={132} />
          </Animated.View>

          <Animated.View style={{ opacity: fractured ? 0.5 : 1 }}>
            <TierSigil tier={displayTier} size={132} />
          </Animated.View>
        </View>

        {(stage === 'reform' || stage === 'complete') && (
          <>
            <Text style={[type.moment, { color: visual.color, marginTop: space.lg }]}>
              {visual.label}
            </Text>
            <Text style={[type.label, { color: palette.muted, marginTop: space.xs }]}>
              FROM {from}
            </Text>
          </>
        )}

        {stage === 'complete' && standing && (
          <>
            <View style={{ height: space.lg }} />
            <Text style={[type.label, { color: palette.muted }]}>POWER SCORE</Text>
            <TickingNumber
              value={standing.cps}
              precision={1}
              size="large"
              color={visual.color}
              durationMs={reducedMotion ? 0 : 600}
            />

            <View style={{ height: space.lg }} />
            <Text style={[type.body, { color: palette.ink, textAlign: 'center' }]}>
              {voice.caption}
            </Text>

            <View style={{ height: space.xl }} />
            <Button label="Continue" onPress={onDone} />
          </>
        )}
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// MOMENT 3 — NEW PR
// ---------------------------------------------------------------------------

/**
 * "the number itself is the animation"
 *
 * No confetti, no burst, no badge. The number grows in place from where it
 * already sat in the log. This is where the industrial-futurist direction earns
 * its keep: a PR should look like an instrument registering a new maximum.
 */
export function NewPrScreen({
  movement,
  value,
  unit,
  previousBest,
  onDone,
}: {
  movement: string;
  value: number;
  unit: string;
  previousBest: number | null;
  onDone: () => void;
}) {
  const personality = useApp((s) => s.coachPersonality);
  const reducedMotion = useReducedMotion();

  const scale = useRef(new Animated.Value(reducedMotion ? 1 : 0.5)).current;
  const ruleWidth = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const [showMeta, setShowMeta] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setShowMeta(true);
      return;
    }

    const grow = setTimeout(() => {
      Animated.timing(scale, {
        toValue: 1,
        duration: 350,
        easing: Easing.bezier(motion.easing.x1, motion.easing.y1, motion.easing.x2, motion.easing.y2),
        useNativeDriver: true,
      }).start();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, 250);

    const rule = setTimeout(() => {
      Animated.timing(ruleWidth, {
        toValue: 1,
        duration: 200,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
    }, 400);

    const meta = setTimeout(() => setShowMeta(true), 750);

    return () => {
      clearTimeout(grow);
      clearTimeout(rule);
      clearTimeout(meta);
    };
  }, [reducedMotion, scale, ruleWidth]);

  const voice = lineFor('NEW_PR', personality, { value: `${value} ${unit}` });

  return (
    <Screen>
      <View style={styles.root}>
        <Text style={[type.label, { color: palette.muted }]}>{movement.toUpperCase()}</Text>

        <View style={{ height: space.lg }} />

        <Animated.View style={{ transform: [{ scale }] }}>
          <Text
            style={[type.dataHero, { color: palette.ink }]}
            accessibilityLabel={`New personal record: ${value} ${unit} on ${movement}`}
          >
            {value}
          </Text>
        </Animated.View>
        <Text style={[type.label, { color: palette.muted }]}>{unit.toUpperCase()}</Text>

        <Animated.View
          style={[
            styles.prRule,
            {
              width: ruleWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '60%'],
              }),
            },
          ]}
        />

        {showMeta && (
          <>
            <Text style={[type.label, { color: palette.alert, marginTop: space.sm }]}>
              PERSONAL RECORD
            </Text>

            {previousBest !== null && (
              <Text
                style={[
                  type.data,
                  {
                    color: palette.muted,
                    marginTop: space.xs,
                    textDecorationLine: 'line-through',
                  },
                ]}
              >
                {previousBest} {unit}
              </Text>
            )}

            <View style={{ height: space.lg }} />
            <Text style={[type.body, { color: palette.ink, textAlign: 'center' }]}>
              {voice.caption}
            </Text>

            <View style={{ height: space.xl }} />
            <Button label="Continue" onPress={onDone} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  sigilStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fragment: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prRule: {
    height: 2,
    backgroundColor: palette.alert,
    marginTop: space.sm,
  },
});
