import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { a11y, palette, space, surface, type } from '../design/tokens';

/**
 * The primary navigation. Five destinations, no more — §11's "No feed. No likes.
 * No infinite scroll. This is deliberate" applies to navigation too: an app with
 * eight tabs is telling the user it does not know what it is for.
 *
 * Icons are drawn from the same instrument geometry as the tier sigils rather
 * than from a generic icon set, so the tab bar belongs to the same object as the
 * rest of the app.
 */

export type Tab = 'home' | 'ladder' | 'social' | 'season' | 'profile';

export const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'TRAIN' },
  { id: 'ladder', label: 'LADDER' },
  { id: 'social', label: 'CREW' },
  { id: 'season', label: 'SEASON' },
  { id: 'profile', label: 'OPERATOR' },
];

export function TabBar({
  active,
  onChange,
  /** §21: a medical-stop state suppresses challenge surfaces, not navigation. */
  alertTab,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
  alertTab?: Tab | null;
}) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const color = isActive ? palette.signal : palette.muted;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
            style={styles.tab}
          >
            <TabIcon tab={tab.id} color={color} />
            <Text style={[type.label, { color, fontSize: 9, letterSpacing: 1.1 }]}>
              {tab.label}
            </Text>
            {alertTab === tab.id && <View style={styles.alertDot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function TabIcon({ tab, color }: { tab: Tab; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" style={{ marginBottom: 4 }}>
      {tab === 'home' && (
        // A loaded bar: the plainest possible statement of "train".
        <>
          <Rect x="2" y="10" width="3" height="4" fill={color} />
          <Rect x="19" y="10" width="3" height="4" fill={color} />
          <Rect x="6" y="11" width="12" height="2" fill={color} />
        </>
      )}
      {tab === 'ladder' && (
        // Ascending rungs, widest at the base.
        <>
          <Rect x="4" y="17" width="16" height="2" fill={color} />
          <Rect x="6" y="12" width="12" height="2" fill={color} />
          <Rect x="8" y="7" width="8" height="2" fill={color} />
        </>
      )}
      {tab === 'social' && (
        // Two nodes on one connecting line — a pairing, not a crowd.
        <>
          <Circle cx="7" cy="9" r="3" stroke={color} strokeWidth={1.8} fill="none" />
          <Circle cx="17" cy="9" r="3" stroke={color} strokeWidth={1.8} fill="none" />
          <Path d="M 4 18 L 20 18" stroke={color} strokeWidth={1.8} />
        </>
      )}
      {tab === 'season' && (
        // An aperture with a quadrant mark: a cycle with a position in it.
        <>
          <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={1.8} fill="none" />
          <Path d="M 12 4 L 12 12 L 18 12" stroke={color} strokeWidth={1.8} fill="none" />
        </>
      )}
      {tab === 'profile' && (
        // A single tolerance band between two rules — the IRON sigil, reduced.
        <>
          <Rect x="4" y="5" width="16" height="1.8" fill={color} />
          <Rect x="7" y="10" width="10" height="4" fill={color} />
          <Rect x="4" y="17" width="16" height="1.8" fill={color} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: surface.hairlineWidth,
    borderTopColor: surface.borderColor,
    backgroundColor: palette.base,
    paddingTop: space.xs,
  },
  tab: {
    flex: 1,
    minHeight: a11y.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: space.xs,
  },
  alertDot: {
    position: 'absolute',
    top: 2,
    right: '32%',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.alert,
  },
});
