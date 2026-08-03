import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Button,
  Divider,
  Notice,
  Panel,
  Screen,
  SectionLabel,
  TickingNumber,
} from '../design/components';
import { palette, space, surface, type } from '../design/tokens';
import { METRIC_LABELS, formatRecord } from '../engine/records';
import { detectImplausible } from '../engine/scoring';
import { EXERCISES, getExercise, scoringProfileFor, searchExercises } from '../data/exercises';
import type { Exercise } from '../data/exercises';
import type { LoggedSet } from '../engine/types';
import { useApp } from '../state/store';

/**
 * §7 — WORKOUT LOGGING, and §15 — TRAINING MODE.
 *
 * "Logging must be faster than a notes app or nobody will use it twice."
 * "Log a set in ≤2 taps. Previous session's numbers pre-filled and editable."
 *
 * The two taps are: [+ SET] on the exercise row, then [LOG]. The values are
 * already filled from the previous set, so the common case — repeating a set at
 * the same load — never requires touching the keyboard.
 */

const REST_SECONDS = 90;

export function SessionScreen({ onDone }: { onDone: () => void }) {
  const activeSession = useApp((s) => s.activeSession);
  const logSet = useApp((s) => s.logSet);
  const endSession = useApp((s) => s.endSession);
  const abortForInjury = useApp((s) => s.abortSessionForInjury);

  const [picking, setPicking] = useState(activeSession?.sets.length === 0);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);

  // §7: "Rest timer auto-starts on set completion."
  useEffect(() => {
    if (restRemaining === null) return;
    if (restRemaining <= 0) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setRestRemaining(null);
      return;
    }
    const timer = setTimeout(() => setRestRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(timer);
  }, [restRemaining]);

  if (!activeSession) return null;

  if (picking || !exercise) {
    return (
      <ExercisePicker
        onPick={(picked) => {
          setExercise(picked);
          setPicking(false);
        }}
        onCancel={activeSession.sets.length > 0 ? () => setPicking(false) : undefined}
      />
    );
  }

  const setsForExercise = activeSession.sets.filter((s) => s.exerciseId === exercise.id);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: palette.muted }]}>
              {exercise.muscleGroup.toUpperCase()} · {exercise.pillar.toUpperCase()}
            </Text>
            <Text style={[type.title, { color: palette.ink }]}>{exercise.name}</Text>
          </View>
        </View>

        <Panel>
          <Text style={[type.label, { color: palette.signal }]}>FORM CUE</Text>
          <Text style={[type.small, { color: palette.ink, marginTop: space.xxs }]}>
            {exercise.formCue}
          </Text>
          <Divider />
          <Text style={[type.label, { color: palette.muted }]}>COMMON MISTAKE</Text>
          <Text style={[type.small, { color: palette.muted, marginTop: space.xxs }]}>
            {exercise.commonMistake}
          </Text>
        </Panel>

        {restRemaining !== null && (
          <View style={styles.restBlock}>
            <Text style={[type.label, { color: palette.muted }]}>REST</Text>
            <TickingNumber
              value={restRemaining}
              size="hero"
              color={palette.signal}
              durationMs={0}
              accessibilityLabel={`${restRemaining} seconds of rest remaining`}
            />
          </View>
        )}

        <View style={{ height: space.lg }} />
        <SetEntry
          exercise={exercise}
          previous={setsForExercise[setsForExercise.length - 1]}
          onLog={(loggedSet) => {
            logSet(loggedSet);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setRestRemaining(REST_SECONDS);
          }}
        />

        {setsForExercise.length > 0 && (
          <>
            <View style={{ height: space.lg }} />
            <SectionLabel>{`Logged this session (${setsForExercise.length})`}</SectionLabel>
            {setsForExercise.map((s, index) => (
              <View key={index} style={styles.loggedRow}>
                <Text style={[type.dataSmall, { color: palette.muted }]}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <Text style={[type.data, { color: palette.ink }]}>{describeSet(s)}</Text>
              </View>
            ))}
          </>
        )}

        <View style={{ height: space.xl }} />
        <Button label="Change exercise" variant="secondary" onPress={() => setPicking(true)} />
        <View style={{ height: space.xs }} />
        <Button
          label="Finish session"
          onPress={() => {
            endSession();
            onDone();
          }}
        />

        <View style={{ height: space.xl }} />
        {/* §15: "A permanently visible STOP / I'M INJURED control." */}
        <Button
          label="Stop — I'm injured"
          variant="danger"
          accessibilityLabel="Stop the session because you are injured. This logs the session with no penalty and pauses your streak."
          onPress={() => {
            abortForInjury();
            onDone();
          }}
        />
        <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
          Ends the session, logs it with no penalty, and pauses your streak. Nothing decays.
        </Text>
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function SetEntry({
  exercise,
  previous,
  onLog,
}: {
  exercise: Exercise;
  previous: LoggedSet | undefined;
  onLog: (set: LoggedSet) => void;
}) {
  const kind = exercise.setKinds[0]!;

  // §7: "Previous session's numbers pre-filled and editable."
  const [reps, setReps] = useState(String(previous?.reps ?? 8));
  const [load, setLoad] = useState(String(previous?.loadKg ?? 20));
  const [duration, setDuration] = useState(String(previous?.durationSec ?? 60));
  const [distance, setDistance] = useState(String(previous?.distanceM ?? 1000));

  const candidate: LoggedSet = useMemo(() => {
    const base: LoggedSet = { exerciseId: exercise.id, kind };
    if (kind === 'reps_load') return { ...base, reps: Number(reps), loadKg: Number(load) };
    if (kind === 'reps_bodyweight') return { ...base, reps: Number(reps) };
    if (kind === 'hold' || kind === 'time') return { ...base, durationSec: Number(duration) };
    return { ...base, distanceM: Number(distance), durationSec: Number(duration) };
  }, [exercise.id, kind, reps, load, duration, distance]);

  // §7: implausible values are surfaced at the moment of entry, not after.
  const findings = useMemo(() => {
    const profile = scoringProfileFor(exercise.id);
    if (!profile) return [];
    return detectImplausible(candidate, profile, 70);
  }, [candidate, exercise.id]);

  return (
    <View>
      <View style={styles.entryRow}>
        {(kind === 'reps_load' || kind === 'reps_bodyweight') && (
          <NumberField label="Reps" value={reps} onChange={setReps} />
        )}
        {kind === 'reps_load' && <NumberField label="Load (kg)" value={load} onChange={setLoad} />}
        {(kind === 'hold' || kind === 'time' || kind === 'distance') && (
          <NumberField label="Seconds" value={duration} onChange={setDuration} />
        )}
        {kind === 'distance' && (
          <NumberField label="Metres" value={distance} onChange={setDistance} />
        )}
      </View>

      {findings.map((finding) => (
        <Notice key={finding.code} tone="caution">
          {finding.message}
        </Notice>
      ))}

      <View style={{ height: space.md }} />
      <Button label="Log set" onPress={() => onLog(candidate)} />
    </View>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.label, { color: palette.muted }]}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numbers-and-punctuation"
        style={styles.numberInput}
        accessibilityLabel={label}
        selectTextOnFocus
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

function ExercisePicker({
  onPick,
  onCancel,
}: {
  onPick: (exercise: Exercise) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchExercises(query).slice(0, 60), [query]);

  return (
    <Screen>
      <View style={{ paddingTop: space.xl, flex: 1 }}>
        <SectionLabel>{`Exercise library · ${EXERCISES.length} movements`}</SectionLabel>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={palette.muted}
          style={styles.searchInput}
          accessibilityLabel="Search the exercise library"
          autoCorrect={false}
        />

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}. ${item.muscleGroup}, ${item.pillar}.`}
              style={styles.pickerRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: palette.ink }]}>{item.name}</Text>
                <Text style={[type.dataSmall, { color: palette.muted }]}>
                  {item.muscleGroup.toUpperCase()} · {item.equipment.toUpperCase()}
                </Text>
              </View>
            </Pressable>
          )}
        />

        {onCancel && (
          <View style={{ paddingVertical: space.md }}>
            <Button label="Cancel" variant="ghost" onPress={onCancel} />
          </View>
        )}
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function describeSet(set: LoggedSet): string {
  switch (set.kind) {
    case 'reps_load':
      return `${set.reps} × ${set.loadKg} kg`;
    case 'reps_bodyweight':
      return `${set.reps} reps`;
    case 'hold':
    case 'time':
      return `${set.durationSec} s`;
    case 'distance':
      return `${set.distanceM} m in ${set.durationSec} s`;
    default:
      return '—';
  }
}

/** §7: post-session summary — PRs, pillar movement, XP, and what the coach noticed. */
export function SessionSummaryScreen({ onDone }: { onDone: () => void }) {
  const summary = useApp((s) => s.lastSummary);
  if (!summary) {
    return (
      <Screen>
        <View style={styles.content}>
          <Text style={[type.title, { color: palette.ink }]}>Session logged.</Text>
          <Text style={[type.small, { color: palette.muted, marginTop: space.xs }]}>
            Nothing scored, and nothing lost. Recover properly.
          </Text>
          <View style={{ height: space.lg }} />
          <Button label="Done" onPress={onDone} />
        </View>
      </Screen>
    );
  }

  const withheldEntries = Object.entries(summary.withheld).filter(([, v]) => v > 0);
  const aborted = summary.score.scoredAsAborted;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.label, { color: palette.muted }]}>
          {aborted ? 'SESSION STOPPED' : 'SESSION COMPLETE'}
        </Text>
        <Text style={[type.display, { color: palette.ink }]}>
          {summary.score.sets.length} sets logged
        </Text>

        {/*
          §15 / §21: an aborted session leads with recovery, but the numbers
          below are the real ones. Every set completed before stopping counts.
        */}
        {aborted && (
          <View style={{ marginTop: space.sm }}>
            <Notice tone="info">
              Streak paused and nothing will decay while you recover. Everything
              you finished before stopping still counts — it is scored below,
              exactly as it would have been.
            </Notice>
          </View>
        )}

        <View style={{ height: space.lg }} />
        <Panel>
          <Text style={[type.label, { color: palette.muted }]}>XP EARNED</Text>
          <TickingNumber value={summary.xpAwarded} size="large" color={palette.signal} />

          <Divider />

          <Text style={[type.label, { color: palette.muted }]}>PILLAR MOVEMENT</Text>
          {Object.entries(summary.score.proposedPillarPoints)
            .filter(([, v]) => v > 0)
            .map(([pillar, points]) => (
              <View key={pillar} style={styles.summaryRow}>
                <Text style={[type.small, { color: palette.ink }]}>{pillar.toUpperCase()}</Text>
                <Text style={[type.data, { color: palette.signal }]}>+{points.toFixed(2)}</Text>
              </View>
            ))}
        </Panel>

        {/* §5: the cap is explained, never silently applied. */}
        {withheldEntries.length > 0 && (
          <View style={{ marginTop: space.sm }}>
            <Notice tone="info">
              {`The weekly cap held back ${withheldEntries
                .map(([pillar, points]) => `${points.toFixed(2)} ${pillar}`)
                .join(', ')}. Gains cap at 2.0 per pillar per 7 days so nobody can rush a tier — including you.`}
            </Notice>
          </View>
        )}

        {summary.score.flaggedSetCount > 0 && (
          <View style={{ marginTop: space.sm }}>
            <Notice tone="caution">
              {`${summary.score.flaggedSetCount} set${
                summary.score.flaggedSetCount === 1 ? '' : 's'
              } could not be scored because the numbers looked like a typo. They are still in your log — correct them and they will count.`}
            </Notice>
          </View>
        )}

        {summary.levelsGained.length > 0 && (
          <View style={{ marginTop: space.sm }}>
            <Notice tone="info">
              {`Level ${summary.levelsGained[summary.levelsGained.length - 1]}.`}
            </Notice>
          </View>
        )}

        {/* §7: PRs hit, per movement. */}
        {summary.records.length > 0 && (
          <>
            <View style={{ height: space.lg }} />
            <SectionLabel>
              {summary.celebratedRecords.length > 0 ? 'Personal records' : 'First recorded'}
            </SectionLabel>
            <Panel accent={summary.celebratedRecords.length > 0 ? palette.alert : undefined}>
              {summary.records.map((detected, index) => {
                const exercise = getExercise(detected.record.exerciseId);
                return (
                  <View
                    key={`${detected.record.exerciseId}_${detected.record.metric}`}
                    style={index > 0 ? { marginTop: space.sm } : undefined}
                    accessible
                    accessibilityLabel={`${exercise?.name ?? detected.record.exerciseId}, ${
                      METRIC_LABELS[detected.record.metric]
                    }: ${formatRecord(detected.record)}${
                      detected.isFirst
                        ? ', first recorded'
                        : `, up from ${detected.previous!.value} ${detected.previous!.unit}`
                    }`}
                  >
                    <Text style={[type.body, { color: palette.ink }]}>
                      {exercise?.name ?? detected.record.exerciseId}
                    </Text>
                    <View style={styles.summaryRow}>
                      <Text style={[type.small, { color: palette.muted }]}>
                        {METRIC_LABELS[detected.record.metric]}
                      </Text>
                      <Text
                        style={[
                          type.data,
                          { color: detected.isFirst ? palette.ink : palette.alert },
                        ]}
                      >
                        {formatRecord(detected.record)}
                      </Text>
                    </View>
                    {!detected.isFirst && detected.previous && (
                      <Text style={[type.dataSmall, { color: palette.muted }]}>
                        WAS {detected.previous.value} {detected.previous.unit}
                      </Text>
                    )}
                  </View>
                );
              })}
            </Panel>
          </>
        )}

        <View style={{ height: space.xl }} />
        <Button label="Done" onPress={onDone} />
        <View style={{ height: space.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  restBlock: {
    alignItems: 'center',
    marginTop: space.lg,
  },
  entryRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  numberInput: {
    ...type.dataLarge,
    color: palette.ink,
    borderBottomWidth: surface.hairlineWidth,
    borderBottomColor: palette.hairline,
    paddingVertical: space.xs,
    minHeight: 56,
  },
  searchInput: {
    ...type.body,
    color: palette.ink,
    borderBottomWidth: surface.hairlineWidth,
    borderBottomColor: palette.hairline,
    paddingVertical: space.sm,
    minHeight: 48,
    marginBottom: space.sm,
  },
  pickerRow: {
    minHeight: 56,
    justifyContent: 'center',
    borderBottomWidth: surface.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  loggedRow: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
    minHeight: 36,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.xxs,
  },
});

export { getExercise };
