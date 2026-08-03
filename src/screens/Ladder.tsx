import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Divider,
  Notice,
  Panel,
  Screen,
  SectionLabel,
  TierBadge,
} from '../design/components';
import { palette, space, surface, tierVisuals, type } from '../design/tokens';
import {
  buildLadder,
  buildVenueStandings,
  rankOf,
  withheldForVerification,
  type LadderEntry,
  type LadderScope,
} from '../engine/ladder';
import { isVerified } from '../engine/types';
import { useApp } from '../state/store';
import { useWorld } from '../state/world';

/**
 * §12 + §F — the ladder.
 *
 * Three boards, in deliberate order: **VENUE first, then CITY, then GLOBAL.**
 *
 * §12: "This gives smaller markets a realistic path to the top of a board, which
 * is exactly why early users in Nepal will care. Do not design this as a
 * global-only ladder." An operator in Bharatpur who opens this screen should see
 * a board they can plausibly top before they see one they cannot.
 */

type Board = 'venue' | 'city' | 'global';

export function LadderScreen() {
  const profile = useApp((s) => s.profile);
  const standing = useApp((s) => s.standing());
  const operators = useWorld((s) => s.operators);
  const venues = useWorld((s) => s.venues);
  const cities = useWorld((s) => s.cities);

  const [board, setBoard] = useState<Board>('venue');

  // The operator's own row, resolved through the same trust cap as every other
  // surface — so an unverified operator sees themselves filtered out of the
  // boards they are not eligible for, exactly like everyone else.
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

  const roster: LadderEntry[] = useMemo(
    () => (you ? [...operators, you] : operators),
    [operators, you],
  );

  const homeVenueId = you?.venueId ?? 'v_bharatpur_iron';
  const homeCityId = you?.cityId ?? 'bharatpur';

  const scope: LadderScope =
    board === 'venue'
      ? { kind: 'venue', venueId: homeVenueId }
      : board === 'city'
        ? { kind: 'city', cityId: homeCityId }
        : { kind: 'global' };

  const ranked = useMemo(() => buildLadder(roster, scope, { limit: 25 }), [roster, scope]);
  const withheld = useMemo(() => withheldForVerification(roster, scope), [roster, scope]);
  const yourRank = you ? rankOf(roster, you.operatorId, scope) : null;

  const venueStandings = useMemo(
    () => buildVenueStandings(roster, venues, { cityId: homeCityId }),
    [roster, venues, homeCityId],
  );

  const venueName = venues.find((v) => v.id === homeVenueId)?.name ?? 'Your venue';
  const cityName = cities.find((c) => c.id === homeCityId)?.name ?? 'Your city';

  const boardTitle =
    board === 'venue' ? venueName : board === 'city' ? cityName : 'Global';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionLabel>Ladder</SectionLabel>

        <View style={styles.tabs}>
          {(
            [
              ['venue', 'VENUE'],
              ['city', 'CITY'],
              ['global', 'GLOBAL'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setBoard(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: board === value }}
              accessibilityLabel={`${label} leaderboard`}
              style={[styles.tab, board === value && styles.tabActive]}
            >
              <Text
                style={[type.label, { color: board === value ? palette.base : palette.muted }]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[type.title, { color: palette.ink, marginTop: space.md }]}>
          {boardTitle}
        </Text>
        {yourRank !== null ? (
          <Text style={[type.small, { color: palette.muted, marginTop: space.xxs }]}>
            You are ranked {yourRank} of {ranked.length >= 25 ? '25+' : ranked.length}.
          </Text>
        ) : (
          <Text style={[type.small, { color: palette.alert, marginTop: space.xxs }]}>
            You are not on this board yet.
          </Text>
        )}

        <View style={{ height: space.md }} />

        {/*
          §10, made visible. The operators filtered out for being unverified are
          counted and named rather than silently dropped — which turns the rule
          from an invisible policy into the product's clearest argument.
        */}
        {withheld.length > 0 && (
          <Notice tone="caution">
            {`${withheld.length} operator${withheld.length === 1 ? '' : 's'} ${
              withheld.length === 1 ? 'is' : 'are'
            } scoring high enough for this board but ${
              withheld.length === 1 ? 'is' : 'are'
            } not verified. Above COBALT, this ladder shows verified operators only. That is the whole point of it.`}
          </Notice>
        )}

        <View style={{ height: space.sm }} />

        <Panel>
          {ranked.map(({ entry, rank }, index) => (
            <View key={entry.operatorId}>
              {index > 0 && <View style={styles.rowDivider} />}
              <LadderRow entry={entry} rank={rank} isYou={entry.operatorId === you?.operatorId} />
            </View>
          ))}
          {ranked.length === 0 && (
            <Text style={[type.small, { color: palette.muted }]}>
              No verified operators on this board yet. Be the first.
            </Text>
          )}
        </Panel>

        {board === 'venue' && (
          <>
            <View style={{ height: space.xl }} />
            <SectionLabel>{`Territory · ${cityName}`}</SectionLabel>
            <Text style={[type.small, { color: palette.muted, marginBottom: space.sm }]}>
              Every verified session contributes to your venue. Unverified
              sessions contribute nothing — a venue standing is a claim about
              people who physically trained there.
            </Text>
            <Panel>
              {venueStandings.map((venue, index) => (
                <View key={venue.venueId}>
                  {index > 0 && <View style={styles.rowDivider} />}
                  <View
                    style={styles.territoryRow}
                    accessible
                    accessibilityLabel={`Rank ${venue.rank}, ${venue.venueName}, ${venue.memberCount} verified members, ${venue.points} points`}
                  >
                    <Text style={[type.data, { color: palette.muted, width: 28 }]}>
                      {String(venue.rank).padStart(2, '0')}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          type.body,
                          {
                            color:
                              venue.venueId === homeVenueId ? palette.signal : palette.ink,
                          },
                        ]}
                      >
                        {venue.venueName}
                      </Text>
                      <Text style={[type.dataSmall, { color: palette.muted }]}>
                        {venue.memberCount} verified
                      </Text>
                    </View>
                    <Text style={[type.data, { color: palette.ink }]}>{venue.points}</Text>
                  </View>
                </View>
              ))}
            </Panel>
            <View style={{ height: space.sm }} />
            <Panel>
              <Text style={[type.label, { color: palette.muted }]}>MONTHLY CYCLE</Text>
              <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
                The top venue in {cityName} holds the city publicly for a month.
                Its members carry a temporary badge for as long as they hold it.
              </Text>
            </Panel>
          </>
        )}

        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

function LadderRow({
  entry,
  rank,
  isYou,
}: {
  entry: LadderEntry;
  rank: number;
  isYou: boolean;
}) {
  const visual = tierVisuals[entry.tier];
  const verified = isVerified(entry.verification);

  return (
    <View
      style={[styles.row, isYou && styles.rowYou]}
      accessible
      accessibilityLabel={`Rank ${rank}. ${entry.displayName}. ${entry.tier} tier, level ${
        entry.level
      }, power score ${entry.cps.toFixed(1)}, ${verified ? 'verified' : 'unverified'}.${
        isYou ? ' This is you.' : ''
      }`}
    >
      <Text style={[type.data, { color: palette.muted, width: 32 }]}>
        {String(rank).padStart(2, '0')}
      </Text>

      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: isYou ? palette.signal : palette.ink }]}>
          {entry.displayName}
          {isYou ? '  ·  YOU' : ''}
        </Text>
        <View style={styles.rowMeta}>
          <TierBadge tier={entry.tier} size={12} />
          <Text style={[type.dataSmall, { color: palette.muted }]}>LV {entry.level}</Text>
          {verified && (
            <Text style={[type.dataSmall, { color: palette.signal }]}>VERIFIED</Text>
          )}
        </View>
      </View>

      <Text style={[type.dataLarge, { color: visual.color }]}>{entry.cps.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xl,
  },
  tabs: {
    flexDirection: 'row',
    gap: space.xs,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
  },
  tabActive: {
    backgroundColor: palette.signal,
    borderColor: palette.signal,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  rowYou: {
    // A single accent, per §19 — no fill, no shadow, just a rule.
    borderLeftWidth: 2,
    borderLeftColor: palette.signal,
    paddingLeft: space.xs,
    marginLeft: -space.xs - 2,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: 2,
  },
  rowDivider: {
    height: surface.hairlineWidth,
    backgroundColor: surface.borderColor,
  },
  territoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
});

export { Divider };
