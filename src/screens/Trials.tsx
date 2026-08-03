import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { trialForWeek } from '../engine/quests';
import { isVerified } from '../engine/types';
import { useApp, useStanding } from '../state/store';
import { useWorld } from '../state/world';

/**
 * §F3 / §8 — TRIAL. "Solo timed challenge, opt-in, leaderboarded, one per week."
 *
 * Opt-in is doing real work here. §16 forbids anything that penalises rest, and
 * a timed maximal effort is exactly the kind of thing an operator should be able
 * to skip without the app treating it as a missed obligation. So the trial is
 * never on the quest board, never notified about, and shows no streak.
 */
export function TrialsScreen({ onDone }: { onDone: () => void }) {
  const operators = useWorld((s) => s.operators);
  const season = useWorld((s) => s.season);
  const profile = useApp((s) => s.profile);
  const standing = useStanding();

  const weekIndex = useMemo(
    () =>
      Math.max(
        0,
        Math.floor((Date.now() - new Date(season.startedAt).getTime()) / (7 * 86_400_000)),
      ),
    [season.startedAt],
  );

  const trial = useMemo(() => trialForWeek(weekIndex, new Date()), [weekIndex]);

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(trial.closesAt).getTime() - Date.now()) / 86_400_000),
  );

  /**
   * Demonstration board. In production these are submitted trial times for the
   * current week, verified-only above COBALT exactly like every other board.
   *
   * Times are derived from each operator's CPS so the ordering is plausible
   * rather than arbitrary — a stronger operator posts a faster time.
   */
  const board = useMemo(() => {
    const eligible = operators.filter((o) => isVerified(o.verification));
    return eligible
      .map((operator) => ({
        operator,
        seconds: Math.round(trial.timeLimitSec * (1.35 - operator.cps / 160)),
      }))
      .filter((row) => row.seconds <= trial.timeLimitSec)
      .sort((a, b) => a.seconds - b.seconds)
      .slice(0, 15)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [operators, trial.timeLimitSec]);

  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionLabel>{`Trial · week ${weekIndex + 1}`}</SectionLabel>
        <Text style={[type.display, { color: palette.ink }]}>{trial.title}</Text>
        <Text style={[type.body, { color: palette.ink, marginTop: space.xs }]}>
          {trial.objective}
        </Text>

        <View style={{ height: space.md }} />
        <Panel accent={palette.alert}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[type.label, { color: palette.muted }]}>TIME LIMIT</Text>
              <Text style={[type.dataHero, { color: palette.alert }]}>
                {formatTime(trial.timeLimitSec)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[type.label, { color: palette.muted }]}>CLOSES IN</Text>
              <Text style={[type.dataLarge, { color: palette.ink }]}>
                {daysLeft}d
              </Text>
            </View>
          </View>
        </Panel>

        <View style={{ height: space.sm }} />
        <Notice tone="info">
          Trials are opt-in. Skipping one costs nothing — no streak, no quest
          slot, no notification chasing you about it. One per week, the same one
          for every operator.
        </Notice>

        <View style={{ height: space.lg }} />
        <SectionLabel>Leaderboard</SectionLabel>
        <Text style={[type.small, { color: palette.muted, marginBottom: space.sm }]}>
          Verified operators only, like every board above COBALT.
        </Text>

        <Panel>
          {board.map(({ operator, seconds, rank }, index) => (
            <View key={operator.operatorId}>
              {index > 0 && <View style={styles.rowDivider} />}
              <View
                style={styles.row}
                accessible
                accessibilityLabel={`Rank ${rank}, ${operator.displayName}, ${formatTime(seconds)}`}
              >
                <Text style={[type.data, { color: palette.muted, width: 28 }]}>
                  {String(rank).padStart(2, '0')}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: palette.ink }]}>
                    {operator.displayName}
                  </Text>
                  <TierBadge tier={operator.tier} size={12} />
                </View>
                <Text style={[type.dataLarge, { color: palette.ink }]}>
                  {formatTime(seconds)}
                </Text>
              </View>
            </View>
          ))}
          {board.length === 0 && (
            <Text style={[type.small, { color: palette.muted }]}>
              Nobody has posted a time yet this week.
            </Text>
          )}
        </Panel>

        {profile && standing && (
          <View style={{ marginTop: space.sm }}>
            <Panel>
              <Text style={[type.label, { color: palette.muted }]}>YOU</Text>
              <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
                {isVerified(standing.verification)
                  ? 'No time posted this week. The clock starts when you tap in.'
                  : 'Post a time and it logs — but the trial board, like every board above COBALT, shows verified operators only.'}
              </Text>
              <Divider />
              <Button label="Start the trial" onPress={onDone} />
            </Panel>
          </View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  rowDivider: {
    height: surface.hairlineWidth,
    backgroundColor: surface.borderColor,
  },
});
