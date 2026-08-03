import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  Button,
  Divider,
  Panel,
  Screen,
  SectionLabel,
} from '../design/components';
import { palette, space, surface, type } from '../design/tokens';
import {
  METRIC_LABELS,
  METRIC_UNITS,
  formatRecord,
  lowerIsBetter,
  progressionSeries,
  recentRecords,
  recordsForExercise,
  type HistoryPoint,
  type RecordMetric,
} from '../engine/records';
import { scoreSession } from '../engine/scoring';
import { getExercise, scoringProfileFor } from '../data/exercises';
import { useApp } from '../state/store';

/**
 * §C4 / §7 — "PR history per movement with a simple progression graph."
 *
 * "Simple" is taken literally. This is a best-so-far line, not a scatter of
 * every set ever logged: §7 asks for a *progression* graph, and a chart that
 * goes down on a light day answers a different question than the one an operator
 * is asking when they open this screen.
 */
export function RecordsScreen({ onDone }: { onDone: () => void }) {
  const book = useApp((s) => s.records);
  const sessions = useApp((s) => s.sessions);

  const [selected, setSelected] = useState<string | null>(null);

  // Sessions rescored so the graph excludes flagged sets exactly as PR detection
  // did. Cheap for a personal log; if history grows past a few thousand
  // sessions this moves behind a memoised selector keyed on session count.
  const scored = useMemo(
    () =>
      sessions.map((session) => ({
        id: session.id,
        startedAt: session.startedAt,
        score: scoreSession(session, scoringProfileFor, 70),
      })),
    [sessions],
  );

  const recent = useMemo(() => recentRecords(book, 20), [book]);

  const movements = useMemo(() => {
    const ids = new Set(Object.values(book).map((record) => record.exerciseId));
    return [...ids].sort((a, b) =>
      (getExercise(a)?.name ?? a).localeCompare(getExercise(b)?.name ?? b),
    );
  }, [book]);

  if (Object.keys(book).length === 0) {
    return (
      <Screen>
        <View style={styles.content}>
          <SectionLabel>Records</SectionLabel>
          <Text style={[type.title, { color: palette.ink }]}>Nothing recorded yet.</Text>
          <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
            Your first logged set of any movement becomes its baseline. After
            that, every time you beat it, it lands here.
          </Text>
          <View style={{ height: space.lg }} />
          <Button label="Back" variant="ghost" onPress={onDone} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionLabel>Records</SectionLabel>

        {selected === null ? (
          <>
            <Text style={[type.small, { color: palette.muted, marginBottom: space.sm }]}>
              {recent.length} record{recent.length === 1 ? '' : 's'} across{' '}
              {movements.length} movement{movements.length === 1 ? '' : 's'}.
            </Text>

            <Panel>
              {recent.map((record, index) => (
                <View key={`${record.exerciseId}_${record.metric}`}>
                  {index > 0 && <View style={styles.rowDivider} />}
                  <Pressable
                    onPress={() => setSelected(record.exerciseId)}
                    accessibilityRole="button"
                    accessibilityLabel={`${
                      getExercise(record.exerciseId)?.name ?? record.exerciseId
                    }, ${METRIC_LABELS[record.metric]}: ${formatRecord(record)}. View history.`}
                    style={styles.recordRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { color: palette.ink }]}>
                        {getExercise(record.exerciseId)?.name ?? record.exerciseId}
                      </Text>
                      <Text style={[type.dataSmall, { color: palette.muted }]}>
                        {METRIC_LABELS[record.metric].toUpperCase()} ·{' '}
                        {record.achievedAt.slice(0, 10)}
                      </Text>
                    </View>
                    <Text style={[type.data, { color: palette.ink }]}>
                      {formatRecord(record)}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </Panel>
          </>
        ) : (
          <MovementDetail
            exerciseId={selected}
            book={book}
            scored={scored}
            onBack={() => setSelected(null)}
          />
        )}

        <View style={{ height: space.lg }} />
        <Button label="Back" variant="ghost" onPress={onDone} />
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function MovementDetail({
  exerciseId,
  book,
  scored,
  onBack,
}: {
  exerciseId: string;
  book: ReturnType<typeof useApp.getState>['records'];
  scored: { id: string; startedAt: string; score: ReturnType<typeof scoreSession> }[];
  onBack: () => void;
}) {
  const exercise = getExercise(exerciseId);
  const records = useMemo(() => recordsForExercise(book, exerciseId), [book, exerciseId]);
  const [metric, setMetric] = useState<RecordMetric>(records[0]?.metric ?? 'load');

  const series = useMemo(
    () => progressionSeries(scored, exerciseId, metric),
    [scored, exerciseId, metric],
  );

  return (
    <View>
      <Pressable onPress={onBack} accessibilityRole="button" style={styles.backRow}>
        <Text style={[type.label, { color: palette.signal }]}>ALL RECORDS</Text>
      </Pressable>

      <Text style={[type.title, { color: palette.ink }]}>
        {exercise?.name ?? exerciseId}
      </Text>
      {exercise && (
        <Text style={[type.dataSmall, { color: palette.muted, marginTop: 2 }]}>
          {exercise.muscleGroup.toUpperCase()} · {exercise.pillar.toUpperCase()}
        </Text>
      )}

      <View style={{ height: space.md }} />

      <View style={styles.metricTabs}>
        {records.map((record) => (
          <Pressable
            key={record.metric}
            onPress={() => setMetric(record.metric)}
            accessibilityRole="tab"
            accessibilityState={{ selected: metric === record.metric }}
            accessibilityLabel={METRIC_LABELS[record.metric]}
            style={[styles.metricTab, metric === record.metric && styles.metricTabActive]}
          >
            <Text
              style={[
                type.dataSmall,
                { color: metric === record.metric ? palette.base : palette.ink },
              ]}
            >
              {METRIC_LABELS[record.metric].toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ height: space.md }} />

      <Panel>
        <Text style={[type.label, { color: palette.muted }]}>CURRENT BEST</Text>
        <Text style={[type.dataHero, { color: palette.ink }]}>
          {records.find((r) => r.metric === metric)
            ? formatRecord(records.find((r) => r.metric === metric)!)
            : '—'}
        </Text>

        <Divider />

        <Text style={[type.label, { color: palette.muted }]}>PROGRESSION</Text>
        <ProgressionGraph series={series} metric={metric} />

        {series.length < 2 && (
          <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
            One data point so far. The line appears once you beat it.
          </Text>
        )}
      </Panel>
    </View>
  );
}

// ---------------------------------------------------------------------------

/**
 * §7's "simple progression graph".
 *
 * No axes, no grid, no legend — the numbers either side of the line say what it
 * is, and §19's surface language does not have room for chart furniture. The
 * line is a single accent stroke with a node at each record.
 */
function ProgressionGraph({
  series,
  metric,
}: {
  series: HistoryPoint[];
  metric: RecordMetric;
}) {
  const width = 280;
  const height = 96;
  const padding = 8;

  if (series.length === 0) {
    return (
      <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
        No history for this metric yet.
      </Text>
    );
  }

  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (index: number) =>
    series.length === 1
      ? width / 2
      : padding + (index / (series.length - 1)) * (width - padding * 2);

  // A pace graph improves downward in value, so it is flipped to still read as
  // "up and to the right" — which is what the operator means by progress.
  const y = (value: number) => {
    const normalised = (value - min) / span;
    const oriented = lowerIsBetter(metric) ? 1 - normalised : normalised;
    return height - padding - oriented * (height - padding * 2);
  };

  const path = series
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.value)}`)
    .join(' ');

  const first = series[0]!;
  const last = series[series.length - 1]!;

  return (
    <View
      accessible
      accessibilityLabel={`Progression from ${first.value} ${METRIC_UNITS[metric]} on ${first.achievedAt.slice(
        0,
        10,
      )} to ${last.value} ${METRIC_UNITS[metric]} on ${last.achievedAt.slice(0, 10)}, across ${
        series.length
      } records`}
      style={{ marginTop: space.xs }}
    >
      <Svg width={width} height={height}>
        {series.length > 1 && (
          <Path d={path} stroke={palette.signal} strokeWidth={1.5} fill="none" />
        )}
        {series.map((point, index) => (
          <Circle
            key={point.achievedAt}
            cx={x(index)}
            cy={y(point.value)}
            r={index === series.length - 1 ? 3.5 : 2}
            fill={index === series.length - 1 ? palette.alert : palette.signal}
          />
        ))}
      </Svg>

      <View style={styles.graphFooter}>
        <Text style={[type.dataSmall, { color: palette.muted }]}>
          {first.value} · {first.achievedAt.slice(0, 10)}
        </Text>
        <Text style={[type.dataSmall, { color: palette.ink }]}>
          {last.value} · {last.achievedAt.slice(0, 10)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xl,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  rowDivider: {
    height: surface.hairlineWidth,
    backgroundColor: surface.borderColor,
  },
  backRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  metricTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  metricTab: {
    minHeight: 44,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
  },
  metricTabActive: {
    backgroundColor: palette.signal,
    borderColor: palette.signal,
  },
  graphFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xxs,
  },
});
