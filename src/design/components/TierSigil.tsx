import React from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { palette, tierVisuals } from '../tokens';
import type { Tier } from '../../engine/types';

/**
 * §3: "Each tier gets its own sigil, its own colour, its own sound signature,
 * and its own rank-up animation. ECLIPSE should be visually rare enough that
 * seeing one in the wild is an event."
 *
 * §3 HARD RULE: these marks are original. Each is constructed from instrument
 * geometry — dial markings, tolerance bands, aperture rings — rather than from
 * the heraldic or arcane vocabulary the genre defaults to.
 *
 * §20: "Colour is never the sole carrier of tier or state — always paired with
 * sigil and label." Each shape is distinguishable in monochrome, which is what
 * makes the pairing meaningful rather than decorative.
 */

export interface TierSigilProps {
  tier: Tier;
  size?: number;
  /** Renders the mark in `palette.ink` instead of the tier colour. */
  monochrome?: boolean;
}

export function TierSigil({ tier, size = 64, monochrome = false }: TierSigilProps) {
  const visual = tierVisuals[tier];
  const stroke = monochrome ? palette.ink : visual.color;
  const isEclipse = tier === 'ECLIPSE' && !monochrome;
  const paint = isEclipse ? 'url(#eclipse)' : stroke;

  // Geometry is authored on a 100x100 grid and scaled by viewBox, so a sigil is
  // pixel-identical at 16px in a ladder row and at 320px on a rank card.
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${visual.label} tier sigil`}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {isEclipse && (
          <Defs>
            {/* §19: the only gradient in the entire app. */}
            <LinearGradient id="eclipse" x1="0" y1="0" x2="1" y2="1">
              {visual.gradient!.map((color, index) => (
                <Stop
                  key={color}
                  offset={`${(index / (visual.gradient!.length - 1)) * 100}%`}
                  stopColor={color}
                />
              ))}
            </LinearGradient>
          </Defs>
        )}
        <G>{renderShape(tier, paint)}</G>
      </Svg>
    </View>
  );
}

function renderShape(tier: Tier, paint: string): React.ReactElement {
  switch (tier) {
    /**
     * ASH — scattered particulate settling toward a baseline. Four marks of
     * decreasing size: the beginning of something, not yet consolidated.
     */
    case 'ASH':
      return (
        <G>
          <Rect x="20" y="70" width="60" height="2" fill={paint} />
          <Rect x="30" y="52" width="10" height="10" fill={paint} opacity={0.9} />
          <Rect x="48" y="44" width="8" height="8" fill={paint} opacity={0.7} />
          <Rect x="63" y="56" width="6" height="6" fill={paint} opacity={0.5} />
          <Rect x="40" y="30" width="4" height="4" fill={paint} opacity={0.35} />
        </G>
      );

    /**
     * IRON — a single consolidated bar between two tolerance marks. The scatter
     * of ASH has become one solid thing.
     */
    case 'IRON':
      return (
        <G>
          <Rect x="18" y="24" width="64" height="3" fill={paint} />
          <Rect x="26" y="40" width="48" height="20" fill={paint} />
          <Rect x="18" y="73" width="64" height="3" fill={paint} />
        </G>
      );

    /**
     * COBALT — a double chevron, the first mark that points somewhere. Read as
     * "advancing" on any instrument panel.
     */
    case 'COBALT':
      return (
        <G>
          <Path
            d="M 22 62 L 50 32 L 78 62"
            stroke={paint}
            strokeWidth={7}
            fill="none"
            strokeLinecap="square"
          />
          <Path
            d="M 22 80 L 50 50 L 78 80"
            stroke={paint}
            strokeWidth={7}
            fill="none"
            strokeLinecap="square"
            opacity={0.55}
          />
        </G>
      );

    /**
     * STORM — a discharge fork crossing a horizontal band. Energy passing
     * through a measured plane.
     */
    case 'STORM':
      return (
        <G>
          <Rect x="14" y="48" width="72" height="2" fill={paint} opacity={0.45} />
          <Path
            d="M 56 14 L 34 52 L 48 52 L 42 86 L 68 44 L 53 44 Z"
            fill={paint}
          />
        </G>
      );

    /**
     * SOLAR — a full aperture ring with radial ticks. The first sigil that
     * closes: a complete, self-sustaining system.
     */
    case 'SOLAR':
      return (
        <G>
          <Circle cx="50" cy="50" r="22" stroke={paint} strokeWidth={6} fill="none" />
          <Circle cx="50" cy="50" r="7" fill={paint} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const inner = 32;
            const outer = 42;
            return (
              <Path
                key={angle}
                d={`M ${50 + Math.cos(rad) * inner} ${50 + Math.sin(rad) * inner} L ${
                  50 + Math.cos(rad) * outer
                } ${50 + Math.sin(rad) * outer}`}
                stroke={paint}
                strokeWidth={4}
                strokeLinecap="square"
              />
            );
          })}
        </G>
      );

    /**
     * ECLIPSE — one disc occulting another, with the corona escaping around the
     * edge. The only iridescent mark in the app, and structurally different from
     * every other sigil: it is the only one built from overlap.
     */
    case 'ECLIPSE':
      return (
        <G>
          <Circle cx="50" cy="50" r="30" fill={paint} />
          <Circle cx="50" cy="50" r="30" stroke={paint} strokeWidth={2} fill="none" />
          {/* The occulting body, punched out in the page background. */}
          <Circle cx="58" cy="43" r="26" fill={palette.base} />
          <Circle cx="50" cy="50" r="38" stroke={paint} strokeWidth={1.5} fill="none" opacity={0.5} />
          <Circle cx="50" cy="50" r="45" stroke={paint} strokeWidth={1} fill="none" opacity={0.25} />
        </G>
      );

    default:
      return assertNever(tier);
  }
}

function assertNever(tier: never): never {
  throw new Error(`unhandled tier: ${String(tier)}`);
}
