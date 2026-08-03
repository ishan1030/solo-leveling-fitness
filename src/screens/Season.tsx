import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Divider,
  Notice,
  Panel,
  Screen,
  SectionLabel,
  TierSigil,
} from '../design/components';
import { palette, space, surface, tierVisuals, type } from '../design/tokens';
import {
  PASS_TIER_COUNT,
  PASS_XP_PER_TIER,
  SEASON_LENGTH_WEEKS,
  daysRemainingInSeason,
  passProgressWithinTier,
  rolloverSeason,
  seasonRewardsFor,
} from '../engine/seasons';
import {
  PREMIUM_TRIAL_DAYS,
  entitlementMatrix,
  entitlementsFor,
  type Capability,
} from '../engine/entitlements';
import { STATIC_COPY } from '../data/copy';
import { useApp } from '../state/store';
import { useWorld } from '../state/world';

/**
 * §17 + §18 — the season hub, the pass, and the monetization surface.
 *
 * These live on one screen because they are one argument: the season is what you
 * are climbing, the pass is what you can buy, and the entitlement matrix is the
 * proof that buying it does not help you climb.
 */

type Tab = 'season' | 'pass' | 'premium';

export function SeasonScreen() {
  const [tab, setTab] = useState<Tab>('season');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.tabs}>
          {(
            [
              ['season', 'SEASON'],
              ['pass', 'PASS'],
              ['premium', 'PREMIUM'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setTab(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              accessibilityLabel={label}
              style={[styles.tab, tab === value && styles.tabActive]}
            >
              <Text style={[type.label, { color: tab === value ? palette.base : palette.muted }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ height: space.lg }} />

        {tab === 'season' && <SeasonTab />}
        {tab === 'pass' && <PassTab />}
        {tab === 'premium' && <PremiumTab />}

        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function SeasonTab() {
  const season = useWorld((s) => s.season);
  const standing = useApp((s) => s.standing());
  const profile = useApp((s) => s.profile);

  const daysLeft = daysRemainingInSeason(season, new Date());
  const weeksLeft = Math.ceil(daysLeft / 7);

  // What the §17 partial reset will actually do to this operator, shown before
  // it happens rather than explained after.
  const carry = useMemo(() => {
    if (!profile || !standing) return null;
    return rolloverSeason({
      level: standing.level,
      xpIntoLevel: standing.xpIntoLevel,
      pillars: profile.pillars,
      achievementIds: [],
      titleIds: [],
      guildId: null,
      rivalryRecords: [],
      seasonPeakTier: profile.seasonPeakTier,
      currentTier: standing.tier,
    });
  }, [profile, standing]);

  if (!standing || !carry) return null;

  return (
    <View>
      <Text style={[type.label, { color: palette.muted }]}>SEASON {season.seasonNumber}</Text>
      <Text style={[type.display, { color: palette.ink }]}>
        {daysLeft} days remaining
      </Text>
      <Text style={[type.small, { color: palette.muted, marginTop: space.xxs }]}>
        {SEASON_LENGTH_WEEKS} weeks, fixed. {weeksLeft} to go.
      </Text>

      <View style={{ height: space.md }} />
      <Panel>
        <Text style={[type.label, { color: palette.muted }]}>SEASON PROGRESS</Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.max(0, Math.min(100, ((SEASON_LENGTH_WEEKS * 7 - daysLeft) / (SEASON_LENGTH_WEEKS * 7)) * 100))}%`,
              },
            ]}
          />
        </View>
      </Panel>

      <View style={{ height: space.lg }} />
      <SectionLabel>What happens at season close</SectionLabel>
      <Panel>
        <Text style={[type.label, { color: palette.alert }]}>RESETS</Text>
        <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
          Ladder points · seasonal quest progress · your placement on the season
          board
        </Text>

        <Divider />

        <Text style={[type.label, { color: palette.signal }]}>PERSISTS</Text>
        <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
          Level · XP · all four pillar scores · achievements · titles · guild ·
          every rivalry record
        </Text>

        <Divider />

        <Text style={[type.label, { color: palette.muted }]}>SOFT RESET</Text>
        <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
          You finish at {standing.tier} and start next season at{' '}
          <Text style={{ color: tierVisuals[carry.soft.startingTier].color }}>
            {carry.soft.startingTier}
          </Text>
          . A season reset costs exactly one tier and never more, no matter how
          far above the line you finish.
        </Text>
      </Panel>

      <View style={{ height: space.lg }} />
      <SectionLabel>Season rewards</SectionLabel>
      <Panel>
        {[
          ['Season winner', 'Permanent champion mark'],
          ['Top 100', 'Seasonal title'],
          ['Top guilds', 'Guild banner'],
        ].map(([label, reward]) => (
          <View key={label} style={styles.rewardRow}>
            <Text style={[type.small, { color: palette.muted }]}>{label}</Text>
            <Text style={[type.dataSmall, { color: palette.ink }]}>{reward}</Text>
          </View>
        ))}
        <Divider />
        <Text style={[type.small, { color: palette.muted }]}>
          {seasonRewardsFor(1, season.seasonNumber, true).length} rewards would be
          issued at first place. Titles are display text — one equipped at a time,
          all owned titles browsable forever.
        </Text>
      </Panel>
    </View>
  );
}

// ---------------------------------------------------------------------------

function PassTab() {
  const entitlements = useApp((s) => s.entitlements);

  // Demonstration value; in production this is the operator's quest XP this season.
  const questXpThisSeason = 12_400;
  const progress = passProgressWithinTier(questXpThisSeason);

  return (
    <View>
      <Text style={[type.label, { color: palette.muted }]}>SEASON PASS</Text>
      <Text style={[type.display, { color: palette.ink }]}>
        Tier {progress.tier} of {PASS_TIER_COUNT}
      </Text>

      <View style={{ height: space.md }} />
      <Panel>
        <Text style={[type.label, { color: palette.muted }]}>
          {progress.xpIntoTier} / {progress.xpForNextTier} XP TO NEXT TIER
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(progress.xpIntoTier / progress.xpForNextTier) * 100}%` },
            ]}
          />
        </View>
      </Panel>

      <View style={{ height: space.md }} />

      {/*
        §17: "Tier XP is earned through quests ONLY and can never be purchased."
        Stated where someone might otherwise look for a shortcut.
      */}
      <Notice tone="info">
        {`Pass tier XP comes from quests only. There is no way to buy it, and there is no parameter in the code that could accept a purchase — ${PASS_XP_PER_TIER} XP per tier, earned.`}
      </Notice>

      <View style={{ height: space.lg }} />
      <SectionLabel>Tracks</SectionLabel>
      <Panel>
        <View style={styles.trackRow}>
          <Text style={[type.label, { color: palette.signal }]}>FREE TRACK</Text>
          <Text style={[type.dataSmall, { color: palette.ink }]}>Cosmetics · titles · XP</Text>
        </View>
        <Divider />
        <View style={styles.trackRow}>
          <Text style={[type.label, { color: palette.muted }]}>PAID TRACK</Text>
          <Text style={[type.dataSmall, { color: palette.ink }]}>
            Cosmetics and titles only
          </Text>
        </View>
      </Panel>

      <View style={{ height: space.md }} />
      <Panel>
        <Text style={[type.small, { color: palette.muted }]}>
          Sold per season, independent of any subscription. Free operators can buy
          it. Subscribers do not get it automatically. Both tracks advance at
          exactly the same rate, because both advance on quest XP.
        </Text>
      </Panel>

      <View style={{ height: space.lg }} />
      <Button
        label={entitlements.ownsSeasonPass ? 'Pass owned' : 'Buy season pass'}
        disabled={entitlements.ownsSeasonPass}
        onPress={() => {}}
      />
      <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
        Price to be confirmed — see docs/14-open-questions.md.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

function PremiumTab() {
  const entitlements = useApp((s) => s.entitlements);
  const granted = useMemo(
    () => entitlementsFor(entitlements, new Date()),
    [entitlements],
  );
  const matrix = useMemo(() => entitlementMatrix(), []);

  const paidRows = matrix.filter((row) => !row.free);
  const competitiveRows = matrix.filter((row) => row.category === 'competitive_core');

  return (
    <View>
      <Text style={[type.label, { color: palette.muted }]}>PREMIUM</Text>
      <Text style={[type.display, { color: palette.ink }]}>AXIOM speaks.</Text>
      <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
        {PREMIUM_TRIAL_DAYS}-day trial. Cancel in one tap, any time.
      </Text>

      <View style={{ height: space.md }} />

      {/* §18's fairness rule, stated to the user before anything is sold. */}
      <Panel accent={palette.signal}>
        <Text style={[type.label, { color: palette.signal }]}>THE RULE</Text>
        <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
          {STATIC_COPY.fairnessPromise}
        </Text>
      </Panel>

      <View style={{ height: space.lg }} />
      <SectionLabel>What premium buys</SectionLabel>
      <Panel>
        {paidRows.map((row, index) => (
          <View key={row.capability}>
            {index > 0 && <View style={styles.rowDivider} />}
            <View
              style={styles.matrixRow}
              accessible
              accessibilityLabel={`${humanise(row.capability)}, ${row.category}, ${
                granted.has(row.capability as Capability) ? 'included' : 'not included'
              }`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.small, { color: palette.ink }]}>
                  {humanise(row.capability)}
                </Text>
                <Text style={[type.dataSmall, { color: palette.muted }]}>
                  {row.category.toUpperCase()}
                </Text>
              </View>
              <Text
                style={[
                  type.label,
                  {
                    color: granted.has(row.capability as Capability)
                      ? palette.signal
                      : palette.muted,
                  },
                ]}
              >
                {granted.has(row.capability as Capability) ? 'ACTIVE' : row.pass ? 'PASS' : 'PREMIUM'}
              </Text>
            </View>
          </View>
        ))}
      </Panel>

      <View style={{ height: space.lg }} />
      <SectionLabel>Free forever — the entire competitive game</SectionLabel>
      <Panel>
        <Text style={[type.small, { color: palette.ink }]}>
          {competitiveRows.map((row) => humanise(row.capability)).join(' · ')}
        </Text>
      </Panel>

      <View style={{ height: space.lg }} />
      <SectionLabel>Never for sale, at any price</SectionLabel>
      <Panel>
        <Text style={[type.small, { color: palette.ink }]}>
          XP multipliers · stat bonuses · ladder points · extra quest slots ·
          faster verification · raid reward bonuses · decay immunity · tier cap
          bypass
        </Text>
        <Divider />
        <Text style={[type.small, { color: palette.muted }]}>
          Not "we don't currently sell those". The function that grants
          entitlements returns a type that cannot contain a competitive
          capability, so selling one would not compile.
        </Text>
      </Panel>

      <View style={{ height: space.lg }} />
      <Button label={`Start ${PREMIUM_TRIAL_DAYS}-day trial`} onPress={() => {}} />
      <View style={{ height: space.xs }} />
      <Button label="Restore purchases" variant="ghost" onPress={() => {}} />
      <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
        Price to be confirmed — see docs/14-open-questions.md. Renews automatically
        until cancelled; cancel any time from this screen.
      </Text>
    </View>
  );
}

function humanise(capability: string): string {
  return capability
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------

/** §19 moment screen 5 — SEASON CLOSE. */
export function SeasonCloseScreen({ onDone }: { onDone: () => void }) {
  const standing = useApp((s) => s.standing());
  const season = useWorld((s) => s.season);
  if (!standing) return null;

  return (
    <Screen>
      <View style={styles.momentRoot}>
        <Text style={[type.label, { color: palette.muted }]}>SEASON {season.seasonNumber} CLOSED</Text>
        <View style={{ height: space.xl }} />
        <TierSigil tier={standing.tier} size={120} />
        <Text style={[type.moment, { color: tierVisuals[standing.tier].color, marginTop: space.md }]}>
          {standing.tier}
        </Text>
        <Text style={[type.label, { color: palette.muted, marginTop: space.xs }]}>
          LEVEL {standing.level} · CPS {standing.cps.toFixed(1)}
        </Text>
        <View style={{ height: space.lg }} />
        <Text style={[type.small, { color: palette.ink, textAlign: 'center' }]}>
          Added to your career timeline. That entry does not move again.
        </Text>
        <View style={{ height: space.xxl }} />
        <Button label="Continue" onPress={onDone} />
      </View>
    </Screen>
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
  progressTrack: {
    height: 3,
    backgroundColor: palette.hairline,
    marginTop: space.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.signal,
  },
  rewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.xxs,
  },
  trackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xs,
  },
  rowDivider: {
    height: surface.hairlineWidth,
    backgroundColor: surface.borderColor,
  },
  momentRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
