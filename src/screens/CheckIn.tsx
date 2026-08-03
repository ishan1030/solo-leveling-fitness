import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Button,
  Divider,
  Notice,
  Panel,
  Screen,
  SectionLabel,
} from '../design/components';
import { palette, space, surface, type } from '../design/tokens';
import {
  VENUE_GEOFENCE_METRES,
  VERIFIED_SESSION_COOLDOWN_HOURS,
  deriveVenueCode,
  windowIndexFor,
  validateCheckIn,
  type CheckInResult,
  type Venue,
} from '../engine/verification';
import { STATIC_COPY } from '../data/copy';
import { useApp } from '../state/store';
import { useWorld } from '../state/world';

/**
 * §10 — QR CHECK-IN. The moat, as a screen.
 *
 * This is the single most important conversion in the product: it is what turns
 * a self-reported operator into a verified one and lifts the COBALT cap. So the
 * screen is built around explaining *why* it exists, not just around scanning.
 *
 * In production the code arrives from a camera scan (`expo-camera` barcode
 * scanner) and the location from a single `expo-location` read. Both are
 * injected here as explicit inputs so every rejection path is reachable and
 * demonstrable without a gym and a phone.
 */

type LocationChoice = 'at_venue' | 'nearby' | 'across_town' | 'denied';

const LOCATION_OFFSETS: Record<Exclude<LocationChoice, 'denied'>, { dLat: number; dLon: number }> = {
  // ~0 m — inside the building.
  at_venue: { dLat: 0, dLon: 0 },
  // ~90 m — in the car park, inside the geofence.
  nearby: { dLat: 0.0008, dLon: 0 },
  // ~4.8 km — the screenshotted-code attack.
  across_town: { dLat: 0.0434, dLon: 0 },
};

export function CheckInScreen({ onDone }: { onDone: () => void }) {
  const venues = useWorld((s) => s.venues);
  const lastVerifiedSessionAt = useWorld((s) => s.lastVerifiedSessionAt);
  const recordVerifiedSession = useWorld((s) => s.recordVerifiedSession);
  const profile = useApp((s) => s.profile);
  const startSession = useApp((s) => s.startSession);

  const [venue, setVenue] = useState<Venue | null>(venues[0] ?? null);
  const [location, setLocation] = useState<LocationChoice>('at_venue');
  const [useStaleCode, setUseStaleCode] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);

  const now = new Date();

  const submittedCode = useMemo(() => {
    if (!venue) return '';
    const windowIndex = windowIndexFor(now) - (useStaleCode ? 30 : 0);
    return deriveVenueCode(venue.codeSecret, windowIndex);
    // The code is recomputed whenever the venue or the staleness choice changes;
    // `now` deliberately is not a dependency, because a code that silently
    // refreshed under the user would make the expiry path untestable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue, useStaleCode]);

  const attempt = () => {
    if (!venue) return;

    const operatorLocation =
      location === 'denied'
        ? null
        : {
            lat: venue.lat + LOCATION_OFFSETS[location].dLat,
            lon: venue.lon + LOCATION_OFFSETS[location].dLon,
          };

    const outcome = validateCheckIn({
      operatorId: profile?.id ?? 'op_unknown',
      venue,
      submittedCode,
      operatorLocation,
      lastVerifiedSessionAt,
      now: new Date(),
    });

    setResult(outcome);
    void Haptics.notificationAsync(
      outcome.accepted
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );

    if (outcome.accepted) recordVerifiedSession(new Date().toISOString());
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionLabel>Verify this session</SectionLabel>
        <Text style={[type.display, { color: palette.ink }]}>Scan into a venue.</Text>
        <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
          {STATIC_COPY.trustCapExplainer}
        </Text>

        <View style={{ height: space.lg }} />

        <SectionLabel>Venue</SectionLabel>
        {venues.map((option) => {
          const selected = option.id === venue?.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => {
                setVenue(option);
                setResult(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.name}. ${
                option.certified ? 'Certified partner venue.' : 'Not a partner venue.'
              }`}
              style={[styles.venueRow, selected && styles.venueRowSelected]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: palette.ink }]}>{option.name}</Text>
                <Text style={[type.dataSmall, { color: palette.muted }]}>
                  {option.cityId.toUpperCase()}
                  {option.certified ? '' : ' · NOT A PARTNER'}
                </Text>
              </View>
              {option.certified && (
                <Text style={[type.label, { color: palette.signal }]}>CERTIFIED</Text>
              )}
            </Pressable>
          );
        })}

        <View style={{ height: space.lg }} />

        {/*
          In production this block is replaced by the camera scanner and a single
          location read. It is exposed here so every §10 rejection path is
          reachable in a running build.
        */}
        <Panel>
          <Text style={[type.label, { color: palette.muted }]}>SCAN SIMULATION</Text>
          <Text style={[type.small, { color: palette.muted, marginTop: space.xxs }]}>
            Standing in for the camera and a single location read. Every rejection
            below is produced by the real validator.
          </Text>

          <Divider />

          <Text style={[type.label, { color: palette.muted }]}>WHERE YOU ARE</Text>
          <View style={styles.choiceRow}>
            {(
              [
                ['at_venue', 'Inside'],
                ['nearby', 'Car park'],
                ['across_town', '4.8 km away'],
                ['denied', 'No location'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => {
                  setLocation(value);
                  setResult(null);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: location === value }}
                accessibilityLabel={label}
                style={[styles.chip, location === value && styles.chipSelected]}
              >
                <Text
                  style={[
                    type.dataSmall,
                    { color: location === value ? palette.base : palette.ink },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ height: space.sm }} />

          <Text style={[type.label, { color: palette.muted }]}>CODE</Text>
          <View style={styles.choiceRow}>
            {(
              [
                [false, 'Current'],
                [true, 'Rotated 30 min ago'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={String(value)}
                onPress={() => {
                  setUseStaleCode(value);
                  setResult(null);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: useStaleCode === value }}
                accessibilityLabel={label}
                style={[styles.chip, useStaleCode === value && styles.chipSelected]}
              >
                <Text
                  style={[
                    type.dataSmall,
                    { color: useStaleCode === value ? palette.base : palette.ink },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ height: space.sm }} />
          <Text style={[type.dataLarge, { color: palette.ink, letterSpacing: 4 }]}>
            {submittedCode}
          </Text>
        </Panel>

        <View style={{ height: space.md }} />
        <Button label="Check in" onPress={attempt} />

        {result && (
          <View style={{ marginTop: space.md }}>
            <Notice tone={result.accepted ? 'info' : 'caution'}>{result.message}</Notice>

            {result.accepted && (
              <>
                <View style={{ height: space.sm }} />
                <Panel accent={palette.signal}>
                  <Text style={[type.label, { color: palette.signal }]}>
                    VERIFICATION EARNED
                  </Text>
                  <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
                    The COBALT cap is lifted. Your rank is now worth exactly what
                    you earned. Scan again when you finish — §10 requires both ends
                    of the session.
                  </Text>
                </Panel>
                <View style={{ height: space.sm }} />
                <Button
                  label="Start verified session"
                  onPress={() => {
                    startSession('QR_CHECK_IN', venue?.id ?? null);
                    onDone();
                  }}
                />
              </>
            )}
          </View>
        )}

        <View style={{ height: space.xl }} />
        <SectionLabel>How this works</SectionLabel>
        <Panel>
          <Rule label="Code rotation" value="every 60 seconds" />
          <Rule label="Geofence" value={`${VENUE_GEOFENCE_METRES} m from the venue`} />
          <Rule
            label="Verified sessions"
            value={`max 1 per ${VERIFIED_SESSION_COOLDOWN_HOURS} hours`}
          />
          <Rule label="Scans per session" value="two — start and end" />
        </Panel>

        <View style={{ height: space.md }} />
        <Notice tone="info">{STATIC_COPY.privacyLocation}</Notice>

        <View style={{ height: space.lg }} />
        <Button label="Back" variant="ghost" onPress={onDone} />
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.ruleRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.small, { color: palette.muted }]}>{label}</Text>
      <Text style={[type.dataSmall, { color: palette.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xl,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: space.md,
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
    marginBottom: space.xs,
  },
  venueRowSelected: {
    borderColor: palette.signal,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xxs,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
  },
  chipSelected: {
    backgroundColor: palette.signal,
    borderColor: palette.signal,
  },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.xxs,
  },
});
