import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  Button,
  Divider,
  Notice,
  Panel,
  Screen,
  SectionLabel,
} from '../design/components';
import { palette, space, surface, type } from '../design/tokens';
import { CALIBRATION_TABLES, ageBandFor, benchmarkFor } from '../engine/calibration';
import { NO_READINESS_FLAGS, type ReadinessFlags, type Sex } from '../engine/types';
import { STATIC_COPY } from '../data/copy';
import { useApp } from '../state/store';

/**
 * §4 — THE FIRST 90 SECONDS.
 *
 * "App opens directly into CALIBRATION. No splash carousel. No 'welcome!' No
 * sign-up wall. First frame the user sees is a live interface asking them a
 * question about their body."
 *
 * Flow, in order:
 *   0. Demographics      — age and sex, needed to pick the right lookup table
 *   1. Readiness         — §6, mandatory, BEFORE any physical test question
 *   2-9. Eight questions — one per screen, large tap targets, visible progress
 *
 * "Calibration takes under 90 seconds: 8 questions, one per screen, large tap
 * targets, visible progress. No typing beyond numbers."
 */

/**
 * The eight question screens. Several tables are grouped onto one screen where
 * they are the same physical test — that is what keeps it to eight screens
 * without dropping any input §6 requires.
 */
const QUESTION_SCREENS: { title: string; prompt: string; tableIds: string[] }[] = [
  {
    title: 'UPPER BODY',
    prompt: 'How many push-ups can you do in one unbroken set?',
    tableIds: ['pushups'],
  },
  {
    title: 'PULLING',
    prompt: 'How many pull-ups can you do in one unbroken set?',
    tableIds: ['pullups'],
  },
  {
    title: 'LOWER BODY',
    prompt: 'How many bodyweight squats can you do in one unbroken set?',
    tableIds: ['squats'],
  },
  {
    title: 'LOADED STRENGTH',
    prompt: 'Best bench press single, as a multiple of your bodyweight. Skip if you do not train it.',
    tableIds: ['bench'],
  },
  {
    title: 'DISTANCE',
    prompt: 'Longest continuous run in the last three months, and your pace for it.',
    tableIds: ['run_distance', 'run_pace'],
  },
  {
    title: 'RECOVERY',
    prompt: 'Resting heart rate, if you know it. Skip if you do not.',
    tableIds: ['resting_hr'],
  },
  {
    title: 'CONSISTENCY',
    prompt: 'How you train right now.',
    tableIds: ['sessions_per_week', 'months_training'],
  },
  {
    title: 'RANGE',
    prompt: 'Three quick mobility checks.',
    tableIds: ['sit_reach', 'overhead_squat', 'shoulder_rotation'],
  },
];

const TOTAL_STEPS = QUESTION_SCREENS.length + 2; // demographics + readiness

export function CalibrationScreen() {
  const draft = useApp((s) => s.calibrationDraft);
  const setAnswer = useApp((s) => s.setCalibrationAnswer);
  const setDemographics = useApp((s) => s.setDemographics);
  const setReadiness = useApp((s) => s.setReadiness);
  const advance = useApp((s) => s.advanceCalibration);
  const complete = useApp((s) => s.completeCalibration);

  const step = draft.stepIndex;

  if (step === 0) {
    return <DemographicsStep onDone={(age, sex) => { setDemographics(age, sex); advance(); }} />;
  }
  if (step === 1) {
    return (
      <ReadinessStep
        value={draft.readiness}
        onDone={(flags) => {
          setReadiness(flags);
          advance();
        }}
      />
    );
  }

  const questionIndex = step - 2;
  if (questionIndex >= QUESTION_SCREENS.length) {
    return <NameStep onDone={complete} />;
  }

  return (
    <QuestionStep
      screen={QUESTION_SCREENS[questionIndex]!}
      stepNumber={step + 1}
      totalSteps={TOTAL_STEPS}
      ageYears={draft.ageYears ?? 25}
      sex={draft.sex ?? 'unspecified'}
      values={draft.inputs}
      onAnswer={setAnswer}
      onNext={advance}
    />
  );
}

// ---------------------------------------------------------------------------

function ProgressRail({ step, total }: { step: number; total: number }) {
  return (
    <View
      style={styles.rail}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.railSegment, i < step && { backgroundColor: palette.signal }]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------

function DemographicsStep({ onDone }: { onDone: (age: number, sex: Sex) => void }) {
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);

  const ageNumber = Number(age);
  // §21: minimum age 16, gated at signup.
  const ageValid = Number.isFinite(ageNumber) && ageNumber >= 16 && ageNumber <= 100;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProgressRail step={1} total={TOTAL_STEPS} />

        <Text style={styles.stepLabel}>CALIBRATION · 01</Text>
        <Text style={styles.prompt}>
          Two things, so we score you against the right people.
        </Text>

        <SectionLabel>Age</SectionLabel>
        <TextInput
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          placeholder="—"
          placeholderTextColor={palette.muted}
          style={styles.numberInput}
          accessibilityLabel="Your age in years"
          maxLength={3}
        />
        {age.length > 0 && !ageValid && (
          <Text style={styles.hint}>
            {ageNumber < 16
              ? 'Meridian is for operators aged 16 and over.'
              : 'Enter an age between 16 and 100.'}
          </Text>
        )}

        <View style={{ height: space.lg }} />

        <SectionLabel>Scored against</SectionLabel>
        <View style={styles.choiceRow}>
          {(['female', 'male', 'unspecified'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setSex(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected: sex === option }}
              accessibilityLabel={
                option === 'unspecified'
                  ? 'Prefer not to say. You will be scored against the midpoint of both reference curves.'
                  : option
              }
              style={[styles.choice, sex === option && styles.choiceSelected]}
            >
              <Text style={[type.body, { color: sex === option ? palette.base : palette.ink }]}>
                {option === 'unspecified' ? 'Rather not say' : option[0]!.toUpperCase() + option.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          Reference tables are banded by age and sex so the ladder is fair across
          bodies. Choosing not to say scores you against the midpoint of both.
        </Text>

        <View style={{ height: space.xl }} />
        <Button
          label="Continue"
          disabled={!ageValid || sex === null}
          onPress={() => ageValid && sex && onDone(ageNumber, sex)}
        />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

const READINESS_QUESTIONS: { key: keyof ReadinessFlags; label: string }[] = [
  { key: 'chestPain', label: 'Chest pain during or after activity' },
  { key: 'dizzinessOrFainting', label: 'Dizziness or fainting' },
  { key: 'jointInjury', label: 'A joint or bone injury that activity affects' },
  { key: 'pregnancy', label: 'Pregnant, or recently given birth' },
  { key: 'cardiacHistory', label: 'Heart condition, or told to only train under supervision' },
  { key: 'medication', label: 'Prescribed medication for blood pressure or a heart condition' },
];

/**
 * §6: "READINESS SCREEN (mandatory, before any physical test)."
 *
 * Note what this screen does not do: there is no way to fail it, no path that
 * exits the app, and no warning styling on the options themselves. A positive
 * answer changes the coaching posture, never the user's access.
 */
function ReadinessStep({
  value,
  onDone,
}: {
  value: ReadinessFlags;
  onDone: (flags: ReadinessFlags) => void;
}) {
  const [flags, setFlags] = useState<ReadinessFlags>(value ?? NO_READINESS_FLAGS);

  const toggle = (key: keyof ReadinessFlags) =>
    setFlags((current) => ({ ...current, [key]: !current[key] }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ProgressRail step={2} total={TOTAL_STEPS} />

        <Text style={styles.stepLabel}>CALIBRATION · 02 · READINESS</Text>
        <Text style={styles.prompt}>Does any of this apply to you?</Text>
        <Text style={styles.hint}>
          Tap everything that does. Nothing here locks you out or lowers your
          rank — it tells AXIOM how to load your training.
        </Text>

        <View style={{ height: space.md }} />

        {READINESS_QUESTIONS.map((question) => {
          const checked = flags[question.key];
          return (
            <Pressable
              key={question.key}
              onPress={() => toggle(question.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={question.label}
              style={[styles.readinessRow, checked && styles.readinessRowChecked]}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]} />
              <Text style={[type.body, { color: palette.ink, flex: 1 }]}>{question.label}</Text>
            </Pressable>
          );
        })}

        <View style={{ height: space.md }} />
        <Notice tone="info">{STATIC_COPY.medicalDisclaimer}</Notice>

        <View style={{ height: space.lg }} />
        <Button label="Continue" onPress={() => onDone(flags)} />
        <View style={{ height: space.xs }} />
        <Button label="None of these apply" variant="ghost" onPress={() => onDone(NO_READINESS_FLAGS)} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function QuestionStep({
  screen,
  stepNumber,
  totalSteps,
  ageYears,
  sex,
  values,
  onAnswer,
  onNext,
}: {
  screen: (typeof QUESTION_SCREENS)[number];
  stepNumber: number;
  totalSteps: number;
  ageYears: number;
  sex: Sex;
  values: Record<string, number | undefined>;
  onAnswer: (tableId: string, value: number) => void;
  onNext: () => void;
}) {
  const [showTable, setShowTable] = useState(false);
  const tables = useMemo(
    () => screen.tableIds.map((id) => CALIBRATION_TABLES.find((t) => t.id === id)!),
    [screen.tableIds],
  );

  const allOptional = tables.every((t) => t.optional);
  const anyAnswered = tables.some((t) => typeof values[t.id] === 'number');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProgressRail step={stepNumber} total={totalSteps} />

        <Text style={styles.stepLabel}>
          CALIBRATION · {String(stepNumber).padStart(2, '0')} · {screen.title}
        </Text>
        <Text style={styles.prompt}>{screen.prompt}</Text>

        <View style={{ height: space.lg }} />

        {tables.map((table) => (
          <View key={table.id} style={{ marginBottom: space.lg }}>
            <SectionLabel>{`${table.label} (${table.unit})`}</SectionLabel>
            <TextInput
              value={values[table.id] === undefined ? '' : String(values[table.id])}
              onChangeText={(text) => {
                const parsed = Number(text);
                if (text === '') return;
                if (Number.isFinite(parsed)) onAnswer(table.id, parsed);
              }}
              keyboardType="numbers-and-punctuation"
              placeholder="—"
              placeholderTextColor={palette.muted}
              style={styles.numberInput}
              accessibilityLabel={`${table.label}, in ${table.unit}`}
            />
            {table.optional && (
              <Text style={styles.hint}>
                Optional. Skipping it moves its weight onto the answers you did give.
              </Text>
            )}
          </View>
        ))}

        {/* §6: "Show the user the table. Fairness must be legible." */}
        <Pressable
          onPress={() => setShowTable((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showTable }}
          style={styles.tableToggle}
        >
          <Text style={[type.label, { color: palette.signal }]}>
            {showTable ? 'HIDE SCORING TABLE' : 'SHOW SCORING TABLE'}
          </Text>
        </Pressable>

        {showTable && (
          <Panel style={{ marginTop: space.sm }}>
            <Text style={styles.hint}>
              Your band: {ageBandFor(ageYears)} · {sex === 'unspecified' ? 'blended' : sex}
            </Text>
            <Divider />
            {tables.map((table) => {
              const benchmark = benchmarkFor(table, ageYears, sex);
              return (
                <View key={table.id} style={{ marginBottom: space.md }}>
                  <Text style={[type.label, { color: palette.muted }]}>{table.label}</Text>
                  {benchmark.points.map((point, index) => (
                    <View key={index} style={styles.tableRow}>
                      <Text style={[type.data, { color: palette.ink }]}>
                        {point} {table.unit}
                      </Text>
                      <Text style={[type.data, { color: palette.signal }]}>
                        {benchmark.scores[index]}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </Panel>
        )}

        <View style={{ height: space.xl }} />
        <Button
          label="Next"
          disabled={!allOptional && !anyAnswered}
          onPress={onNext}
        />
        {allOptional && (
          <>
            <View style={{ height: space.xs }} />
            <Button
              label="Skip — I don't train this"
              variant="ghost"
              onPress={onNext}
              accessibilityLabel="Skip this question. Its weight is redistributed across the questions you did answer."
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

/**
 * §4: "ONLY NOW: 'Save your rank' → account creation. The user has something to
 * lose."
 *
 * A display name is the entire ask. No email, no password, no social login
 * before the reveal — those come after the rank card exists.
 */
function NameStep({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState('');
  const valid = name.trim().length >= 2;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProgressRail step={TOTAL_STEPS} total={TOTAL_STEPS} />
        <Text style={styles.stepLabel}>CALIBRATION · COMPLETE</Text>
        <Text style={styles.prompt}>What should we call you?</Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Operator name"
          placeholderTextColor={palette.muted}
          style={styles.textInput}
          accessibilityLabel="Your operator name"
          maxLength={24}
          autoCapitalize="words"
        />

        <View style={{ height: space.xl }} />
        <Button label="Reveal my rank" disabled={!valid} onPress={() => onDone(name.trim())} />
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

/** §4: what an abandoned calibration looks like on return. */
export function CalibrationResumeScreen() {
  const draft = useApp((s) => s.calibrationDraft);
  const advance = useApp((s) => s.advanceCalibration);
  const answered = Object.keys(draft.inputs).length;

  return (
    <Screen>
      <View style={[styles.content, { justifyContent: 'center', flex: 1 }]}>
        <Text style={styles.stepLabel}>CALIBRATION · PAUSED</Text>
        <Text style={styles.prompt}>You were {answered} answers in.</Text>
        <Text style={styles.hint}>
          Nothing was lost. Pick up exactly where you stopped, or start again
          from the first question.
        </Text>

        <View style={{ height: space.xl }} />
        <Button label="Continue where I left off" onPress={advance} />
        <View style={{ height: space.xs }} />
        <Button label="Start over" variant="ghost" onPress={() => useApp.getState().reset()} />
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xxl,
    paddingBottom: space.xxxl,
  },
  rail: {
    flexDirection: 'row',
    gap: space.xxs,
    marginBottom: space.xl,
  },
  railSegment: {
    flex: 1,
    height: 2,
    backgroundColor: palette.hairline,
  },
  stepLabel: {
    ...type.label,
    color: palette.muted,
    marginBottom: space.sm,
  },
  prompt: {
    ...type.display,
    color: palette.ink,
    marginBottom: space.sm,
  },
  hint: {
    ...type.small,
    color: palette.muted,
    marginTop: space.xs,
  },
  numberInput: {
    ...type.dataHero,
    color: palette.ink,
    borderBottomWidth: surface.hairlineWidth,
    borderBottomColor: palette.hairline,
    paddingVertical: space.xs,
    minHeight: 72,
  },
  textInput: {
    ...type.display,
    color: palette.ink,
    borderBottomWidth: surface.hairlineWidth,
    borderBottomColor: palette.hairline,
    paddingVertical: space.sm,
    minHeight: 56,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  choice: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
    paddingHorizontal: space.xs,
  },
  choiceSelected: {
    backgroundColor: palette.signal,
    borderColor: palette.signal,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 56,
    paddingHorizontal: space.md,
    borderWidth: surface.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
    marginBottom: space.xs,
  },
  readinessRowChecked: {
    borderColor: palette.signal,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: palette.muted,
  },
  checkboxChecked: {
    backgroundColor: palette.signal,
    borderColor: palette.signal,
  },
  tableToggle: {
    minHeight: 44,
    justifyContent: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.xxs,
  },
});
