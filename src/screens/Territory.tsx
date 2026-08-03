import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Divider,
  Notice,
  Panel,
  Screen,
  SectionLabel,
  TierBadge,
} from '../design/components';
import { palette, space, surface, type } from '../design/tokens';
import { buildLadder, buildVenueStandings, type LadderEntry } from '../engine/ladder';
import { VENUE_GEOFENCE_METRES } from '../engine/verification';
import { useApp } from '../state/store';
import { useWorld } from '../state/world';

/**
 * §12 — TERRITORY. Screens E2 (city board) and E4 (venue profile).
 *
 * §12: "This gives smaller markets a realistic path to the top of a board,
 * which is exactly why early users in Nepal will care. Do not design this as a
 * global-only ladder."
 *
 * So the city board is a first-class destination rather than a filter on the
 * global one, and it leads with the venues rather than the individuals — a city
 * is a contest between gyms, and an operator's contribution to it is the reason
 * to care about a board they will never personally top.
 */
export function TerritoryScreen({ onDone }: { onDone: () => void }) {
  const profile = useApp((s) => s.profile);
  const standing = useApp((s) => s.standing());
  const operators = useWorld((s) => s.operators);
  const venues = useWorld((s) => s.venues);
  const cities = useWorld((s) => s.cities);

  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const you: LadderEntry | null = useMemo(() => {
    if (!profile || !standing) return null;
    return {
      operatorId: profile.id,
      displayName: profile.displayName,
      tier: standing.tier,
      cps: standing.cps,
      level: standing.level,
      verification: standing.verification,
      venueId: profile.homeVenueId ?? 'v_bharatpur_iron',
      cityId: profile.cityId ?? 'bharatpur',
      ladderPoints: Math.round(standing.cps * 42),
    };
  }, [profile, standing]);

  const roster = useMemo(() => (you ? [...operators, you] : operators), [operators, you]);
  const homeCityId = you?.cityId ?? 'bharatpur';
  const homeVenueId = you?.venueId ?? 'v_bharatpur_iron';

  const cityStandings = useMemo(
    () => buildVenueStandings(roster, venues, { cityId: homeCityId }),
    [roster, venues, homeCityId],
  );
  const nationalStandings = useMemo(
    () => buildVenueStandings(roster, venues, 'national'),
    [roster, venues],
  );

  const cityName = cities.find((c) => c.id === homeCityId)?.name ?? 'Your city';

  if (selectedVenueId) {
    return (
      <VenueProfile
        venueId={selectedVenueId}
        roster={roster}
        onBack={() => setSelectedVenueId(null)}
        onDone={onDone}
      />
    );
  }

  const holder = cityStandings[0];
  const yourVenueStanding = cityStandings.find((s) => s.venueId === homeVenueId);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionLabel>Territory</SectionLabel>
        <Text style={[type.display, { color: palette.ink }]}>{cityName}</Text>
        <Text style={[type.small, { color: palette.muted, marginTop: space.xxs }]}>
          Every verified session contributes to your venue. Unverified sessions
          contribute nothing — a venue standing is a claim about people who
          physically trained there.
        </Text>

        {/* §12: "the winning venue in each city holds it publicly for a month" */}
        {holder && (
          <View style={{ marginTop: space.md }}>
            <Panel accent={palette.signal}>
              <Text style={[type.label, { color: palette.signal }]}>
                HOLDING {cityName.toUpperCase()}
              </Text>
              <Text style={[type.title, { color: palette.ink, marginTop: space.xxs }]}>
                {holder.venueName}
              </Text>
              <Text style={[type.dataSmall, { color: palette.muted, marginTop: 2 }]}>
                {holder.points} POINTS · {holder.memberCount} VERIFIED MEMBERS
              </Text>
              <Divider />
              <Text style={[type.small, { color: palette.muted }]}>
                The top venue holds the city for a calendar month. Its members
                carry a temporary badge for as long as they hold it.
              </Text>
            </Panel>
          </View>
        )}

        {yourVenueStanding && yourVenueStanding.venueId !== holder?.venueId && (
          <View style={{ marginTop: space.sm }}>
            <Notice tone="info">
              {`Your venue sits ${yourVenueStanding.rank} in ${cityName}, ${
                (holder?.points ?? 0) - yourVenueStanding.points
              } points behind. Every verified session you log closes that.`}
            </Notice>
          </View>
        )}

        <View style={{ height: space.lg }} />
        <SectionLabel>{`Venues in ${cityName}`}</SectionLabel>
        <Panel>
          {cityStandings.map((venue, index) => (
            <View key={venue.venueId}>
              {index > 0 && <View style={styles.rowDivider} />}
              <Pressable
                onPress={() => setSelectedVenueId(venue.venueId)}
                accessibilityRole="button"
                accessibilityLabel={`Rank ${venue.rank}, ${venue.venueName}, ${venue.points} points, ${venue.memberCount} verified members. View venue.`}
                style={styles.venueRow}
              >
                <Text style={[type.data, { color: palette.muted, width: 28 }]}>
                  {String(venue.rank).padStart(2, '0')}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      type.body,
                      { color: venue.venueId === homeVenueId ? palette.signal : palette.ink },
                    ]}
                  >
                    {venue.venueName}
                    {venue.venueId === homeVenueId ? '  ·  HOME' : ''}
                  </Text>
                  <Text style={[type.dataSmall, { color: palette.muted }]}>
                    {venue.memberCount} VERIFIED
                  </Text>
                </View>
                <Text style={[type.data, { color: palette.ink }]}>{venue.points}</Text>
              </Pressable>
            </View>
          ))}
        </Panel>

        <View style={{ height: space.lg }} />
        <SectionLabel>Nationally</SectionLabel>
        <Panel>
          {nationalStandings.slice(0, 10).map((venue, index) => (
            <View key={venue.venueId}>
              {index > 0 && <View style={styles.rowDivider} />}
              <View style={styles.venueRow}>
                <Text style={[type.data, { color: palette.muted, width: 28 }]}>
                  {String(venue.rank).padStart(2, '0')}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      type.body,
                      { color: venue.venueId === homeVenueId ? palette.signal : palette.ink },
                    ]}
                  >
                    {venue.venueName}
                  </Text>
                  <Text style={[type.dataSmall, { color: palette.muted }]}>
                    {venue.cityId.toUpperCase()}
                  </Text>
                </View>
                <Text style={[type.data, { color: palette.ink }]}>{venue.points}</Text>
              </View>
            </View>
          ))}
        </Panel>

        <View style={{ height: space.lg }} />
        <Button label="Back" variant="ghost" onPress={onDone} />
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// E4 · Venue profile
// ---------------------------------------------------------------------------

function VenueProfile({
  venueId,
  roster,
  onBack,
  onDone,
}: {
  venueId: string;
  roster: LadderEntry[];
  onBack: () => void;
  onDone: () => void;
}) {
  const venues = useWorld((s) => s.venues);
  const cities = useWorld((s) => s.cities);
  const venue = venues.find((v) => v.id === venueId);

  const board = useMemo(
    () => buildLadder(roster, { kind: 'venue', venueId }, { limit: 20 }),
    [roster, venueId],
  );

  if (!venue) return null;

  const cityName = cities.find((c) => c.id === venue.cityId)?.name ?? venue.cityId;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={onBack} accessibilityRole="button" style={styles.backRow}>
          <Text style={[type.label, { color: palette.signal }]}>TERRITORY</Text>
        </Pressable>

        <Text style={[type.display, { color: palette.ink }]}>{venue.name}</Text>
        <Text style={[type.label, { color: palette.muted, marginTop: space.xxs }]}>
          {cityName.toUpperCase()}
        </Text>

        <View style={{ height: space.md }} />

        <Panel accent={venue.certified ? palette.signal : undefined}>
          <View style={styles.statusRow}>
            <Text
              style={[
                type.title,
                { color: venue.certified ? palette.signal : palette.muted },
              ]}
            >
              {venue.certified ? 'CERTIFIED' : 'NOT A PARTNER'}
            </Text>
          </View>
          <Divider />
          {venue.certified ? (
            <Text style={[type.small, { color: palette.muted }]}>
              A partner venue. Sessions scanned here carry a verified badge and
              lift the COBALT cap. Codes rotate every 60 seconds and are locked
              to within {VENUE_GEOFENCE_METRES} m of this building.
            </Text>
          ) : (
            <Text style={[type.small, { color: palette.muted }]}>
              Not part of the verification network yet. Sessions here log
              normally and everything works — they just do not carry a badge.
              You can nominate this venue from the check-in screen.
            </Text>
          )}
        </Panel>

        <View style={{ height: space.lg }} />
        <SectionLabel>{`Members · ${board.length}`}</SectionLabel>
        {board.length === 0 ? (
          <Panel>
            <Text style={[type.small, { color: palette.muted }]}>
              No verified operators here yet. Be the first.
            </Text>
          </Panel>
        ) : (
          <Panel>
            {board.map(({ entry, rank }, index) => (
              <View key={entry.operatorId}>
                {index > 0 && <View style={styles.rowDivider} />}
                <View
                  style={styles.memberRow}
                  accessible
                  accessibilityLabel={`Rank ${rank}, ${entry.displayName}, ${entry.tier} tier, power score ${entry.cps.toFixed(1)}`}
                >
                  <Text style={[type.data, { color: palette.muted, width: 28 }]}>
                    {String(rank).padStart(2, '0')}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { color: palette.ink }]}>
                      {entry.displayName}
                    </Text>
                    <TierBadge tier={entry.tier} size={12} />
                  </View>
                  <Text style={[type.data, { color: palette.ink }]}>
                    {entry.cps.toFixed(1)}
                  </Text>
                </View>
              </View>
            ))}
          </Panel>
        )}

        <View style={{ height: space.lg }} />
        <Button label="Back" variant="ghost" onPress={onDone} />
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xl,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 56,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  rowDivider: {
    height: surface.hairlineWidth,
    backgroundColor: surface.borderColor,
  },
  backRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
});
