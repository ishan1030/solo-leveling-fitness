import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { a11y, motion, palette, radius, space, surface, tierVisuals, type } from '../tokens';
import type { Pillar, Tier } from '../../engine/types';

export { TierSigil } from './TierSigil';

/**
 * §19 component library. Every component here obeys the surface language rules:
 * hairline borders, no shadows, no gradients, one accent per screen.
 *
 * §20 is handled at this layer rather than per-screen, so a screen cannot
 * accidentally ship an unlabelled stat or a sub-44pt control.
 */

// ---------------------------------------------------------------------------
// Reduced motion — §20
// ---------------------------------------------------------------------------

/**
 * "prefers-reduced-motion disables all set-piece animation; content still
 * delivered."
 *
 * Components call this and skip straight to the final value. The content always
 * arrives; only the transition is removed.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface PanelProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Raised panels sit one step above the base surface. */
  raised?: boolean;
  /** A single accent edge. §19 allows one accent per screen — use sparingly. */
  accent?: string;
}

export function Panel({ children, style, raised = false, accent }: PanelProps) {
  return (
    <View
      style={[
        styles.panel,
        raised && { backgroundColor: palette.surfaceRaised },
        accent ? { borderLeftWidth: 2, borderLeftColor: accent } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={styles.sectionLabel} accessibilityRole="header">
      {children.toUpperCase()}
    </Text>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

// ---------------------------------------------------------------------------
// Numbers — §19: "Numbers tick rather than fade."
// ---------------------------------------------------------------------------

export interface TickingNumberProps {
  value: number;
  /** Decimal places. Fixed width prevents the layout shifting as digits change. */
  precision?: number;
  size?: 'hero' | 'large' | 'normal';
  color?: string;
  durationMs?: number;
  /** Announced to screen readers instead of the raw digits. */
  accessibilityLabel?: string;
}

/**
 * §19: numbers tick. The value counts up digit by digit rather than crossfading,
 * because a readout that fades looks like a label and a readout that counts
 * looks like an instrument.
 *
 * §20: under reduced motion the final value is rendered immediately.
 */
export function TickingNumber({
  value,
  precision = 0,
  size = 'normal',
  color = palette.ink,
  durationMs = motion.moment,
  accessibilityLabel,
}: TickingNumberProps) {
  const reducedMotion = useReducedMotion();
  const [displayed, setDisplayed] = useState(reducedMotion ? value : 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayed(value);
      return;
    }

    const start = Date.now();
    const from = displayed;
    const delta = value - from;

    const step = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      // Matches the §19 easing: sharp attack, hard settle, no overshoot.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(from + delta * eased);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // `displayed` is deliberately excluded: including it would restart the
    // animation on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reducedMotion, durationMs]);

  const textStyle =
    size === 'hero' ? type.dataHero : size === 'large' ? type.dataLarge : type.data;

  return (
    <Text
      style={[textStyle, { color }]}
      accessibilityLabel={accessibilityLabel ?? `${value.toFixed(precision)}`}
      // The animated intermediate values would otherwise be announced as they tick.
      accessibilityLiveRegion="none"
      allowFontScaling
    >
      {displayed.toFixed(precision)}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Pillar bar
// ---------------------------------------------------------------------------

const PILLAR_LABELS: Record<Pillar, string> = {
  strength: 'STRENGTH',
  endurance: 'ENDURANCE',
  consistency: 'CONSISTENCY',
  mobility: 'MOBILITY',
};

export interface PillarBarProps {
  pillar: Pillar;
  value: number;
  /** Recent change, rendered as a delta chip. */
  delta?: number;
  accent?: string;
}

/**
 * §20: "Full screen-reader labelling on every stat, tier, and control."
 * The bar is one accessible element carrying the pillar name, its value and any
 * delta, rather than three separate nodes a screen reader would read as fragments.
 */
export function PillarBar({ pillar, value, delta, accent = palette.signal }: PillarBarProps) {
  const reducedMotion = useReducedMotion();
  const width = useRef(new Animated.Value(reducedMotion ? value : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      width.setValue(value);
      return;
    }
    Animated.timing(width, {
      toValue: value,
      duration: motion.slow,
      easing: Easing.bezier(motion.easing.x1, motion.easing.y1, motion.easing.x2, motion.easing.y2),
      useNativeDriver: false,
    }).start();
  }, [value, reducedMotion, width]);

  const deltaText = delta === undefined || delta === 0 ? null : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;

  return (
    <View
      style={styles.pillarRow}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${PILLAR_LABELS[pillar]} ${value.toFixed(1)} out of 100${
        deltaText ? `, changed by ${deltaText}` : ''
      }`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
    >
      <View style={styles.pillarHeader}>
        <Text style={styles.pillarLabel}>{PILLAR_LABELS[pillar]}</Text>
        <View style={styles.pillarValueGroup}>
          {deltaText && (
            <Text style={[type.dataSmall, { color: delta! > 0 ? palette.signal : palette.muted }]}>
              {deltaText}
            </Text>
          )}
          <Text style={[type.data, { color: palette.ink }]}>{value.toFixed(1)}</Text>
        </View>
      </View>
      <View style={styles.pillarTrack}>
        <Animated.View
          style={[
            styles.pillarFill,
            {
              backgroundColor: accent,
              width: width.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tier badge
// ---------------------------------------------------------------------------

export interface TierBadgeProps {
  tier: Tier;
  /** §20: the label always accompanies the colour. */
  showLabel?: boolean;
  size?: number;
}

export function TierBadge({ tier, showLabel = true, size = 20 }: TierBadgeProps) {
  const visual = tierVisuals[tier];
  return (
    <View style={styles.tierBadge} accessible accessibilityLabel={`${visual.label} tier`}>
      <View
        style={[
          styles.tierDot,
          { width: size / 2, height: size / 2, backgroundColor: visual.color },
        ]}
      />
      {showLabel && <Text style={[type.label, { color: visual.color }]}>{visual.label}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  /** Overrides the accessible label when the visible label is not descriptive enough. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * §19: no purple gradient buttons, no shadows. A button is a bordered plane that
 * fills with the accent when it is the primary action.
 * §20: every button is at least 44pt tall.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'ghost' && styles.buttonGhost,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Text
        style={[
          type.body,
          styles.buttonLabel,
          variant === 'primary' && { color: palette.base },
          variant === 'danger' && { color: palette.ink },
          disabled && { color: palette.muted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Persistent notices — §6, §21
// ---------------------------------------------------------------------------

export interface NoticeProps {
  tone: 'info' | 'caution' | 'stop';
  children: string;
  /** Rendered as a secondary action inside the notice. */
  action?: { label: string; onPress: () => void };
}

/**
 * §21: the medical-stop state uses `tone="stop"`. §6 requires the physician
 * banner to be persistent but never blocking — none of these variants trap focus
 * or gate the screen behind them.
 */
export function Notice({ tone, children, action }: NoticeProps) {
  const accent =
    tone === 'stop' ? palette.alert : tone === 'caution' ? '#F2A93B' : palette.signal;

  return (
    <View
      style={[styles.notice, { borderLeftColor: accent }]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={children}
    >
      <Text style={[type.small, { color: palette.ink }]}>{children}</Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          style={styles.noticeAction}
        >
          <Text style={[type.label, { color: accent }]}>{action.label.toUpperCase()}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen scaffold
// ---------------------------------------------------------------------------

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Stat({
  label,
  value,
  accent = palette.ink,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.stat}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      <Text style={[type.dataLarge, { color: accent }]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.base,
    paddingHorizontal: space.lg,
  },
  panel: {
    backgroundColor: palette.surface,
    borderWidth: surface.hairlineWidth,
    borderColor: surface.borderColor,
    borderRadius: radius.md,
    padding: space.md,
    // §19: explicitly no shadow. Depth comes from the surface step and the
    // hairline, which is what instrumentation actually looks like.
  },
  sectionLabel: {
    ...type.label,
    color: palette.muted,
    marginBottom: space.xs,
  },
  divider: {
    height: surface.hairlineWidth,
    backgroundColor: surface.borderColor,
    marginVertical: space.md,
  },
  pillarRow: {
    marginBottom: space.md,
  },
  pillarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: space.xxs,
  },
  pillarLabel: {
    ...type.label,
    color: palette.muted,
  },
  pillarValueGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs,
  },
  pillarTrack: {
    height: 3,
    backgroundColor: palette.hairline,
    overflow: 'hidden',
  },
  pillarFill: {
    height: '100%',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  tierDot: {
    borderRadius: radius.pill,
  },
  button: {
    minHeight: a11y.minTapTarget,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: surface.hairlineWidth,
    borderColor: surface.borderColor,
  },
  buttonPrimary: {
    backgroundColor: palette.signal,
    borderColor: palette.signal,
  },
  buttonSecondary: {
    backgroundColor: palette.surface,
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    borderColor: palette.alert,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    color: palette.ink,
  },
  notice: {
    backgroundColor: palette.surface,
    borderLeftWidth: 2,
    padding: space.md,
    marginVertical: space.xs,
    gap: space.xs,
  },
  noticeAction: {
    minHeight: a11y.minTapTarget,
    justifyContent: 'center',
  },
  stat: {
    gap: space.xxs,
  },
});
