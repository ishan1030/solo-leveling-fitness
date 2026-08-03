import React, { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Button, Panel, Screen, SectionLabel, TierSigil } from '../design/components';
import { palette, space, surface, tierVisuals, type } from '../design/tokens';
import { PILLARS, type OperatorProfile, type Standing } from '../engine/types';
import { useApp, useStanding } from '../state/store';

/**
 * §13 — RANK CARD & SHARE LOOP. "The product's most-seen artifact."
 *
 * "Design these cards as if they are the app's poster. They are."
 *
 * §13 requires the card to be "visually distinct per tier — an ECLIPSE card must
 * look categorically different from an ASH card, not just recoloured." That is
 * implemented as `TIER_LAYOUTS`: each tier changes the composition, not the hue.
 *
 * Sizes (§13): Instagram Story 1080×1920, feed square 1080×1080, WhatsApp status
 * 1080×1920. The card is authored at a 4:5 aspect and letterboxed by the export
 * pipeline, so one layout serves all three without reflowing.
 */

export type CardFormat = 'story' | 'square' | 'status';

export const CARD_DIMENSIONS: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  status: { width: 1080, height: 1920 },
};

/**
 * Per-tier composition. §13's "categorically different" requirement is met by
 * changing sigil scale, alignment and the density of the surrounding rule work —
 * an ASH card is sparse and bottom-weighted, an ECLIPSE card is centred, large,
 * and ringed.
 */
interface CardLayout {
  sigilSize: number;
  sigilAlign: 'flex-start' | 'center';
  /** Number of hairline rules framing the card. Density rises with tier. */
  ruleCount: number;
  /** Whether the tier name is set at moment scale. */
  monumentalLabel: boolean;
}

const TIER_LAYOUTS: Record<string, CardLayout> = {
  ASH: { sigilSize: 72, sigilAlign: 'flex-start', ruleCount: 1, monumentalLabel: false },
  IRON: { sigilSize: 88, sigilAlign: 'flex-start', ruleCount: 2, monumentalLabel: false },
  COBALT: { sigilSize: 104, sigilAlign: 'flex-start', ruleCount: 3, monumentalLabel: true },
  STORM: { sigilSize: 128, sigilAlign: 'center', ruleCount: 4, monumentalLabel: true },
  SOLAR: { sigilSize: 152, sigilAlign: 'center', ruleCount: 5, monumentalLabel: true },
  ECLIPSE: { sigilSize: 188, sigilAlign: 'center', ruleCount: 7, monumentalLabel: true },
};

export interface RankCardProps {
  profile: OperatorProfile;
  standing: Standing;
  /** §13: "a scannable invite code". */
  inviteCode: string;
  season: number;
  venueOrCity: string;
}

export function RankCard({ profile, standing, inviteCode, season, venueOrCity }: RankCardProps) {
  const visual = tierVisuals[standing.tier];
  const layout = TIER_LAYOUTS[standing.tier] ?? TIER_LAYOUTS.ASH!;

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`Rank card. ${profile.displayName}, ${standing.tier} tier, level ${standing.level}, power score ${standing.cps.toFixed(1)}, ${standing.verification === 'SELF_REPORTED' ? 'unverified' : 'verified'}.`}
    >
      {/* Framing rules — density rises with tier. */}
      {Array.from({ length: layout.ruleCount }, (_, i) => (
        <View
          key={i}
          style={[
            styles.frameRule,
            { top: space.md + i * 4, opacity: 1 - i * 0.12, backgroundColor: visual.color },
          ]}
        />
      ))}

      <View style={styles.cardHeader}>
        <Text style={[type.label, { color: palette.muted }]}>MERIDIAN · SEASON {season}</Text>
        <Text style={[type.label, { color: visual.color }]}>
          {standing.verification === 'SELF_REPORTED' ? 'UNVERIFIED' : 'VERIFIED'}
        </Text>
      </View>

      <View style={{ alignItems: layout.sigilAlign, marginVertical: space.xl }}>
        <TierSigil tier={standing.tier} size={layout.sigilSize} />
        <Text
          style={[
            layout.monumentalLabel ? type.moment : type.display,
            { color: visual.color, marginTop: space.md },
          ]}
        >
          {visual.label}
        </Text>
      </View>

      <Text style={[type.title, { color: palette.ink }]}>{profile.displayName}</Text>
      <Text style={[type.label, { color: palette.muted, marginTop: space.xxs }]}>
        LEVEL {standing.level} · {venueOrCity.toUpperCase()}
      </Text>

      <View style={{ height: space.lg }} />

      {/* §13: four pillar bars. */}
      {PILLARS.map((pillar) => (
        <View key={pillar} style={styles.cardPillar}>
          <Text style={[type.label, { color: palette.muted, width: 96 }]}>
            {pillar.slice(0, 4).toUpperCase()}
          </Text>
          <View style={styles.cardTrack}>
            <View
              style={[
                styles.cardFill,
                { width: `${profile.pillars[pillar]}%`, backgroundColor: visual.color },
              ]}
            />
          </View>
          <Text style={[type.dataSmall, { color: palette.ink, width: 40, textAlign: 'right' }]}>
            {profile.pillars[pillar].toFixed(0)}
          </Text>
        </View>
      ))}

      <View style={{ height: space.lg }} />

      <View style={styles.cardFooter}>
        <View>
          <Text style={[type.label, { color: palette.muted }]}>POWER SCORE</Text>
          <Text style={[type.dataHero, { color: visual.color }]}>{standing.cps.toFixed(1)}</Text>
        </View>

        {/* §13: "No app-name watermark clutter; one clean mark plus the scan code." */}
        <View style={styles.codeBlock}>
          <ScanCode value={inviteCode} />
          <Text style={[type.dataSmall, { color: palette.muted, marginTop: space.xxs }]}>
            {inviteCode}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * A deterministic block-code rendered from the invite string.
 *
 * Production replaces this with a real QR encoder; the visual footprint and the
 * quiet zone are identical, so the card layout does not change when it is
 * swapped in. Rendering it from the code's own hash means the placeholder is at
 * least unique per operator rather than a static square.
 */
function ScanCode({ value, size = 72 }: { value: string; size?: number }) {
  const modules = 9;
  const cell = size / modules;

  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  const cells: boolean[] = [];
  let state = hash;
  for (let i = 0; i < modules * modules; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    cells.push((state & 0x10000) !== 0);
  }

  return (
    <View
      style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap' }}
      accessible
      accessibilityLabel={`Invite code ${value}`}
    >
      {cells.map((filled, index) => (
        <View
          key={index}
          style={{
            width: cell,
            height: cell,
            backgroundColor: filled ? palette.ink : 'transparent',
          }}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------

export function RankCardScreen({ onDone }: { onDone: () => void }) {
  const profile = useApp((s) => s.profile);
  const standing = useStanding();
  const cardRef = useRef<View>(null);

  if (!profile || !standing) return null;

  const share = async () => {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch {
      // Sharing is a convenience, never a blocker — a failure here leaves the
      // card on screen for the operator to screenshot, which §13 says it must
      // already be worth doing unedited.
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: space.xl, paddingBottom: space.xxxl }}>
        <SectionLabel>Your rank card</SectionLabel>

        <View ref={cardRef} collapsable={false}>
          <RankCard
            profile={profile}
            standing={standing}
            inviteCode={profile.id.slice(-7).toUpperCase()}
            season={1}
            venueOrCity={profile.cityId ?? 'Bharatpur'}
          />
        </View>

        <View style={{ height: space.lg }} />
        <Panel>
          <Text style={[type.small, { color: palette.muted }]}>
            Anyone who scans this code starts their own calibration with your
            referral attached. You get a cosmetic for it — never ladder points.
          </Text>
        </Panel>

        <View style={{ height: space.lg }} />
        <Button label="Share" onPress={share} />
        <View style={{ height: space.xs }} />
        <Button label="Back" variant="ghost" onPress={onDone} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.base,
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    padding: space.lg,
    // 4:5 authoring aspect. The export pipeline letterboxes to each §13 size.
    aspectRatio: 4 / 5,
    justifyContent: 'space-between',
  },
  frameRule: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    height: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
  cardPillar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.xs,
  },
  cardTrack: {
    flex: 1,
    height: 2,
    backgroundColor: palette.hairline,
  },
  cardFill: {
    height: '100%',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  codeBlock: {
    alignItems: 'center',
  },
});
