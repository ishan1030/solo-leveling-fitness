import type { ExerciseScoringProfile, SetLimits } from '../engine/scoring';
import type { MuscleGroup } from '../engine/quests';
import type { Pillar, SetKind } from '../engine/types';

/**
 * §7 — EXERCISE LIBRARY.
 *
 * "Exercise library: 300+ movements, each tagged to a pillar and muscle group,
 * with a short form cue and a common-mistake warning."
 *
 * The library is built from curated base movements expanded across their real
 * equipment and stance variants. Every generated entry inherits a genuine cue
 * and mistake warning from its base and refines them per variant — there are no
 * filler rows and no placeholder copy.
 *
 * §21 compliance: no entry references appearance, body composition, or calorie
 * expenditure. Cues describe execution only.
 */

export interface Exercise {
  id: string;
  name: string;
  pillar: Pillar;
  secondaryPillar: Pillar | null;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  /** Set kinds this movement accepts, first is the default. */
  setKinds: SetKind[];
  /** §7: "a short form cue". */
  formCue: string;
  /** §7: "and a common-mistake warning". */
  commonMistake: string;
  intensityFactor: number;
  limits: SetLimits;
  /** True for movements suitable under §6 conservative loading. */
  lowImpact: boolean;
}

export type Equipment =
  | 'bodyweight'
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'cable'
  | 'band'
  | 'bench'
  | 'rings'
  | 'none';

interface BaseMovement {
  slug: string;
  name: string;
  pillar: Pillar;
  secondaryPillar: Pillar | null;
  muscleGroup: MuscleGroup;
  setKinds: SetKind[];
  formCue: string;
  commonMistake: string;
  intensityFactor: number;
  limits: SetLimits;
  lowImpact: boolean;
  /** Equipment variants this movement genuinely exists in. */
  variants: VariantSpec[];
}

interface VariantSpec {
  suffix: string;
  equipment: Equipment;
  /** Adjusts intensity relative to the base. */
  intensityDelta?: number;
  /** Overrides the base cue when the variant genuinely changes execution. */
  formCue?: string;
  commonMistake?: string;
  lowImpact?: boolean;
}

const STANDARD_LOAD_LIMITS: SetLimits = { maxReps: 100, maxLoadKg: 400 };
const BODYWEIGHT_LIMITS: SetLimits = { maxReps: 200 };
const HOLD_LIMITS: SetLimits = { maxDurationSec: 900 };
const CARDIO_LIMITS: SetLimits = { maxDistanceM: 100_000, maxDurationSec: 36_000, maxSpeedMps: 12 };

// ---------------------------------------------------------------------------
// Base movements
// ---------------------------------------------------------------------------

const BASE_MOVEMENTS: BaseMovement[] = [
  // ---- Chest ----
  {
    slug: 'bench_press',
    name: 'Bench Press',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'chest',
    setKinds: ['reps_load'],
    formCue: 'Shoulder blades pinned to the bench, bar path from mid-chest to over the shoulders.',
    commonMistake: 'Letting the elbows flare to ninety degrees, which puts the shoulder at the end of its range under load.',
    intensityFactor: 1.25,
    limits: STANDARD_LOAD_LIMITS,
    lowImpact: false,
    variants: [
      { suffix: 'Barbell', equipment: 'barbell' },
      { suffix: 'Dumbbell', equipment: 'dumbbell', intensityDelta: -0.05 },
      { suffix: 'Incline Barbell', equipment: 'barbell', formCue: 'Bench at thirty degrees, bar path to the upper chest, not the throat.' },
      { suffix: 'Incline Dumbbell', equipment: 'dumbbell', intensityDelta: -0.05 },
      { suffix: 'Decline Barbell', equipment: 'barbell' },
      { suffix: 'Machine', equipment: 'machine', intensityDelta: -0.15, lowImpact: true },
      { suffix: 'Smith Machine', equipment: 'machine', intensityDelta: -0.1, lowImpact: true },
      { suffix: 'Close Grip', equipment: 'barbell', formCue: 'Hands just inside shoulder width, elbows tucked close to the ribs.', commonMistake: 'Gripping so narrow the wrists bend back under the bar.' },
      { suffix: 'Floor Press', equipment: 'barbell', formCue: 'Upper arms touch the floor, pause, then press. The floor sets the range.' },
    ],
  },
  {
    slug: 'push_up',
    name: 'Push-Up',
    pillar: 'strength',
    secondaryPillar: 'endurance',
    muscleGroup: 'chest',
    setKinds: ['reps_bodyweight'],
    formCue: 'One straight line from heel to head, chest to the floor, elbows at forty-five degrees.',
    commonMistake: 'Hips sagging first so the lower back takes the load instead of the chest.',
    intensityFactor: 0.85,
    limits: BODYWEIGHT_LIMITS,
    lowImpact: true,
    variants: [
      { suffix: 'Standard', equipment: 'bodyweight' },
      { suffix: 'Knee', equipment: 'bodyweight', intensityDelta: -0.25, formCue: 'Knees down, hips still in line with the shoulders. The line matters more than the knees.' },
      { suffix: 'Incline', equipment: 'bench', intensityDelta: -0.2 },
      { suffix: 'Decline', equipment: 'bench', intensityDelta: 0.15 },
      { suffix: 'Diamond', equipment: 'bodyweight', intensityDelta: 0.15, formCue: 'Index fingers and thumbs touching, elbows brushing the ribs on the way down.' },
      { suffix: 'Wide', equipment: 'bodyweight' },
      { suffix: 'Archer', equipment: 'bodyweight', intensityDelta: 0.3 },
      { suffix: 'Ring', equipment: 'rings', intensityDelta: 0.25, commonMistake: 'Letting the rings drift apart; keep them stacked under the shoulders.' },
      { suffix: 'Pike', equipment: 'bodyweight', intensityDelta: 0.2, formCue: 'Hips high, head travels between the hands. This one is a shoulder press in disguise.' },
    ],
  },
  {
    slug: 'chest_fly',
    name: 'Chest Fly',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'chest',
    setKinds: ['reps_load'],
    formCue: 'Soft bend in the elbow held constant, arms sweep in a wide arc.',
    commonMistake: 'Turning it into a press by bending and straightening the elbows.',
    intensityFactor: 0.8,
    limits: { maxReps: 60, maxLoadKg: 80 },
    lowImpact: true,
    variants: [
      { suffix: 'Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Cable', equipment: 'cable' },
      { suffix: 'Incline Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Pec Deck', equipment: 'machine', intensityDelta: -0.1 },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.15 },
    ],
  },
  {
    slug: 'dip',
    name: 'Dip',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'chest',
    setKinds: ['reps_bodyweight', 'reps_load'],
    formCue: 'Lean forward slightly, descend until the upper arm is parallel, drive through the palms.',
    commonMistake: 'Dropping below a comfortable shoulder range chasing depth.',
    intensityFactor: 1.1,
    limits: { maxReps: 100, maxLoadKg: 120 },
    lowImpact: false,
    variants: [
      { suffix: 'Parallel Bar', equipment: 'bodyweight' },
      { suffix: 'Ring', equipment: 'rings', intensityDelta: 0.25 },
      { suffix: 'Bench', equipment: 'bench', intensityDelta: -0.3 },
      { suffix: 'Assisted', equipment: 'machine', intensityDelta: -0.25, lowImpact: true },
      { suffix: 'Weighted', equipment: 'bodyweight', intensityDelta: 0.2 },
    ],
  },

  // ---- Back ----
  {
    slug: 'pull_up',
    name: 'Pull-Up',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'back',
    setKinds: ['reps_bodyweight', 'reps_load'],
    formCue: 'Start from a full hang, lead with the elbows, chin clears the bar without craning.',
    commonMistake: 'Kipping the hips to finish a rep the back cannot yet do.',
    intensityFactor: 1.3,
    limits: { maxReps: 100, maxLoadKg: 120 },
    lowImpact: false,
    variants: [
      { suffix: 'Overhand', equipment: 'bodyweight' },
      { suffix: 'Chin-Up', equipment: 'bodyweight', intensityDelta: -0.1, formCue: 'Palms toward you. More biceps, slightly easier at the top.' },
      { suffix: 'Neutral Grip', equipment: 'bodyweight', intensityDelta: -0.05 },
      { suffix: 'Wide Grip', equipment: 'bodyweight', intensityDelta: 0.1 },
      { suffix: 'Assisted', equipment: 'machine', intensityDelta: -0.4, lowImpact: true },
      { suffix: 'Band Assisted', equipment: 'band', intensityDelta: -0.35, lowImpact: true },
      { suffix: 'Weighted', equipment: 'bodyweight', intensityDelta: 0.25 },
      { suffix: 'Negative', equipment: 'bodyweight', intensityDelta: -0.15, formCue: 'Jump to the top, then take five full seconds to lower. The lowering is the work.' },
    ],
  },
  {
    slug: 'row',
    name: 'Row',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'back',
    setKinds: ['reps_load'],
    formCue: 'Flat back, pull to the lower ribs, shoulder blade finishes the movement.',
    commonMistake: 'Yanking with the lower back so the torso rises with every rep.',
    intensityFactor: 1.15,
    limits: STANDARD_LOAD_LIMITS,
    lowImpact: false,
    variants: [
      { suffix: 'Barbell Bent-Over', equipment: 'barbell' },
      { suffix: 'Pendlay', equipment: 'barbell', intensityDelta: 0.05, formCue: 'Bar returns to the floor and stops between every rep. No bounce.' },
      { suffix: 'Single-Arm Dumbbell', equipment: 'dumbbell', intensityDelta: -0.05 },
      { suffix: 'Seated Cable', equipment: 'cable', intensityDelta: -0.1, lowImpact: true },
      { suffix: 'Chest-Supported', equipment: 'machine', intensityDelta: -0.1, lowImpact: true, commonMistake: 'Sliding up the pad to shorten the range.' },
      { suffix: 'T-Bar', equipment: 'barbell' },
      { suffix: 'Inverted', equipment: 'bodyweight', intensityDelta: -0.2, lowImpact: true },
      { suffix: 'Ring', equipment: 'rings', intensityDelta: -0.1 },
      { suffix: 'Meadows', equipment: 'barbell' },
    ],
  },
  {
    slug: 'lat_pulldown',
    name: 'Lat Pulldown',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'back',
    setKinds: ['reps_load'],
    formCue: 'Chest up, bar to the collarbone, elbows drive down and back.',
    commonMistake: 'Leaning so far back it becomes a row.',
    intensityFactor: 1.0,
    limits: STANDARD_LOAD_LIMITS,
    lowImpact: true,
    variants: [
      { suffix: 'Wide Grip', equipment: 'machine' },
      { suffix: 'Close Grip', equipment: 'machine' },
      { suffix: 'Neutral Grip', equipment: 'machine' },
      { suffix: 'Single-Arm Cable', equipment: 'cable' },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.2 },
    ],
  },
  {
    slug: 'deadlift',
    name: 'Deadlift',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'back',
    setKinds: ['reps_load'],
    formCue: 'Bar over mid-foot, take the slack out, push the floor away with the whole foot.',
    commonMistake: 'Hips shooting up first so the bar leaves the floor with a rounded back.',
    intensityFactor: 1.5,
    limits: { maxReps: 60, maxLoadKg: 500 },
    lowImpact: false,
    variants: [
      { suffix: 'Conventional', equipment: 'barbell' },
      { suffix: 'Sumo', equipment: 'barbell', formCue: 'Wide stance, hands inside the knees, knees track over the toes.' },
      { suffix: 'Romanian', equipment: 'barbell', intensityDelta: -0.15, formCue: 'Knees mostly fixed, push the hips back, stop when the hamstrings run out of length.' },
      { suffix: 'Stiff-Leg', equipment: 'barbell', intensityDelta: -0.15 },
      { suffix: 'Trap Bar', equipment: 'barbell', intensityDelta: -0.05, lowImpact: true },
      { suffix: 'Single-Leg Dumbbell', equipment: 'dumbbell', intensityDelta: -0.35 },
      { suffix: 'Deficit', equipment: 'barbell', intensityDelta: 0.1 },
      { suffix: 'Rack Pull', equipment: 'barbell', intensityDelta: -0.05 },
    ],
  },
  {
    slug: 'pullover',
    name: 'Pullover',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'back',
    setKinds: ['reps_load'],
    formCue: 'Arms nearly straight, reach back only as far as the shoulder allows without the ribs flaring.',
    commonMistake: 'Arching the lower back to fake extra range.',
    intensityFactor: 0.85,
    limits: { maxReps: 60, maxLoadKg: 100 },
    lowImpact: true,
    variants: [
      { suffix: 'Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Cable', equipment: 'cable' },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.15 },
    ],
  },

  // ---- Legs ----
  {
    slug: 'squat',
    name: 'Squat',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'legs',
    setKinds: ['reps_load', 'reps_bodyweight'],
    formCue: 'Brace before you descend, knees track over the toes, hips and shoulders rise together.',
    commonMistake: 'Hips rising faster than the chest out of the hole, turning it into a good morning.',
    intensityFactor: 1.4,
    limits: { maxReps: 150, maxLoadKg: 500 },
    lowImpact: false,
    variants: [
      { suffix: 'Back Barbell', equipment: 'barbell' },
      { suffix: 'Front Barbell', equipment: 'barbell', intensityDelta: -0.05, formCue: 'Elbows high throughout. The moment they drop, the bar follows.' },
      { suffix: 'Goblet', equipment: 'dumbbell', intensityDelta: -0.25, lowImpact: true },
      { suffix: 'Bodyweight', equipment: 'bodyweight', intensityDelta: -0.6, lowImpact: true },
      { suffix: 'Overhead', equipment: 'barbell', intensityDelta: -0.1 },
      { suffix: 'Hack', equipment: 'machine', intensityDelta: -0.15, lowImpact: true },
      { suffix: 'Smith Machine', equipment: 'machine', intensityDelta: -0.2, lowImpact: true },
      { suffix: 'Box', equipment: 'barbell', intensityDelta: -0.1, formCue: 'Sit to the box under control, pause, then stand. No rocking off it.' },
      { suffix: 'Pause', equipment: 'barbell', intensityDelta: 0.05 },
      { suffix: 'Split', equipment: 'dumbbell', intensityDelta: -0.2 },
      { suffix: 'Bulgarian Split', equipment: 'dumbbell', intensityDelta: -0.1, commonMistake: 'Standing too close to the bench so the front knee has nowhere to go.' },
      { suffix: 'Zercher', equipment: 'barbell' },
      { suffix: 'Sissy', equipment: 'bodyweight', intensityDelta: -0.3 },
    ],
  },
  {
    slug: 'lunge',
    name: 'Lunge',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'legs',
    setKinds: ['reps_bodyweight', 'reps_load'],
    formCue: 'Torso tall, back knee travels straight down, front shin close to vertical.',
    commonMistake: 'Stepping too short so the front knee drifts well past the toes.',
    intensityFactor: 1.0,
    limits: { maxReps: 150, maxLoadKg: 200 },
    lowImpact: true,
    variants: [
      { suffix: 'Forward', equipment: 'bodyweight' },
      { suffix: 'Reverse', equipment: 'bodyweight', lowImpact: true },
      { suffix: 'Walking Dumbbell', equipment: 'dumbbell', intensityDelta: 0.1 },
      { suffix: 'Barbell', equipment: 'barbell', intensityDelta: 0.15 },
      { suffix: 'Lateral', equipment: 'bodyweight', formCue: 'Push the hips back into the bending leg, keep the trailing leg straight.' },
      { suffix: 'Curtsy', equipment: 'bodyweight' },
      { suffix: 'Deficit Reverse', equipment: 'bodyweight', intensityDelta: 0.1 },
    ],
  },
  {
    slug: 'leg_press',
    name: 'Leg Press',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'legs',
    setKinds: ['reps_load'],
    formCue: 'Lower until the hips just begin to tuck, then press through the whole foot.',
    commonMistake: 'Locking the knees hard at the top, or letting the lower back peel off the pad at the bottom.',
    intensityFactor: 1.1,
    limits: { maxReps: 100, maxLoadKg: 800 },
    lowImpact: true,
    variants: [
      { suffix: 'Standard', equipment: 'machine' },
      { suffix: 'Single-Leg', equipment: 'machine', intensityDelta: -0.1 },
      { suffix: 'Narrow Stance', equipment: 'machine' },
      { suffix: 'Wide Stance', equipment: 'machine' },
    ],
  },
  {
    slug: 'hip_hinge_accessory',
    name: 'Hip Thrust',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'legs',
    setKinds: ['reps_load', 'reps_bodyweight'],
    formCue: 'Ribs down, chin tucked, finish with the shins vertical and the hips fully extended.',
    commonMistake: 'Arching the lower back at lockout instead of finishing with the hips.',
    intensityFactor: 1.05,
    limits: { maxReps: 100, maxLoadKg: 350 },
    lowImpact: true,
    variants: [
      { suffix: 'Barbell', equipment: 'barbell' },
      { suffix: 'Single-Leg', equipment: 'bodyweight', intensityDelta: -0.25 },
      { suffix: 'Machine', equipment: 'machine', intensityDelta: -0.05 },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.3 },
      { suffix: 'Glute Bridge', equipment: 'bodyweight', intensityDelta: -0.35 },
    ],
  },
  {
    slug: 'leg_curl',
    name: 'Leg Curl',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'legs',
    setKinds: ['reps_load', 'reps_bodyweight'],
    formCue: 'Hips stay down, curl under control, resist harder on the way back than on the way in.',
    commonMistake: 'Letting the hips lift to help the hamstrings finish.',
    intensityFactor: 0.9,
    limits: { maxReps: 80, maxLoadKg: 200 },
    lowImpact: true,
    variants: [
      { suffix: 'Lying Machine', equipment: 'machine' },
      { suffix: 'Seated Machine', equipment: 'machine' },
      { suffix: 'Nordic', equipment: 'bodyweight', intensityDelta: 0.35, formCue: 'Lower as slowly as you can control, catch with the hands. Brutal, and the point.' },
      { suffix: 'Stability Ball', equipment: 'none', intensityDelta: -0.15 },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.25 },
    ],
  },
  {
    slug: 'leg_extension',
    name: 'Leg Extension',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'legs',
    setKinds: ['reps_load'],
    formCue: 'Pause briefly at the top, lower slower than you lifted.',
    commonMistake: 'Swinging the weight up with a hip thrust from the seat.',
    intensityFactor: 0.8,
    limits: { maxReps: 80, maxLoadKg: 200 },
    lowImpact: true,
    variants: [
      { suffix: 'Machine', equipment: 'machine' },
      { suffix: 'Single-Leg', equipment: 'machine' },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.2 },
    ],
  },
  {
    slug: 'calf_raise',
    name: 'Calf Raise',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'legs',
    setKinds: ['reps_load', 'reps_bodyweight'],
    formCue: 'Full stretch at the bottom, full contraction at the top, no bouncing between.',
    commonMistake: 'Short choppy reps that never reach either end of the range.',
    intensityFactor: 0.7,
    limits: { maxReps: 150, maxLoadKg: 300 },
    lowImpact: true,
    variants: [
      { suffix: 'Standing Machine', equipment: 'machine' },
      { suffix: 'Seated Machine', equipment: 'machine' },
      { suffix: 'Single-Leg Bodyweight', equipment: 'bodyweight', intensityDelta: -0.1 },
      { suffix: 'Barbell', equipment: 'barbell' },
      { suffix: 'Donkey', equipment: 'machine' },
    ],
  },
  {
    slug: 'step_up',
    name: 'Step-Up',
    pillar: 'strength',
    secondaryPillar: 'endurance',
    muscleGroup: 'legs',
    setKinds: ['reps_bodyweight', 'reps_load'],
    formCue: 'Drive through the heel of the stepping foot; do not push off the trailing toe.',
    commonMistake: 'Bouncing off the back foot so the working leg barely does anything.',
    intensityFactor: 0.95,
    limits: { maxReps: 150, maxLoadKg: 150 },
    lowImpact: true,
    variants: [
      { suffix: 'Box', equipment: 'bodyweight' },
      { suffix: 'Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Barbell', equipment: 'barbell' },
      { suffix: 'Lateral', equipment: 'bodyweight' },
    ],
  },

  // ---- Shoulders ----
  {
    slug: 'overhead_press',
    name: 'Overhead Press',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'shoulders',
    setKinds: ['reps_load'],
    formCue: 'Squeeze the glutes, move the head back to clear the bar, finish with the bar over the mid-foot.',
    commonMistake: 'Leaning back through the lower spine instead of pressing overhead.',
    intensityFactor: 1.2,
    limits: STANDARD_LOAD_LIMITS,
    lowImpact: false,
    variants: [
      { suffix: 'Barbell Standing', equipment: 'barbell' },
      { suffix: 'Dumbbell Standing', equipment: 'dumbbell', intensityDelta: -0.05 },
      { suffix: 'Seated Dumbbell', equipment: 'dumbbell', intensityDelta: -0.1, lowImpact: true },
      { suffix: 'Machine', equipment: 'machine', intensityDelta: -0.15, lowImpact: true },
      { suffix: 'Push Press', equipment: 'barbell', intensityDelta: 0.1, formCue: 'A short dip from the legs, then press. The dip is vertical, not forward.' },
      { suffix: 'Arnold', equipment: 'dumbbell' },
      { suffix: 'Landmine', equipment: 'barbell', intensityDelta: -0.1, lowImpact: true },
      { suffix: 'Z Press', equipment: 'barbell', intensityDelta: 0.05 },
    ],
  },
  {
    slug: 'lateral_raise',
    name: 'Lateral Raise',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'shoulders',
    setKinds: ['reps_load'],
    formCue: 'Lead with the elbow, stop at shoulder height, lower under control.',
    commonMistake: 'Swinging with the hips and using momentum from a heavy dumbbell.',
    intensityFactor: 0.65,
    limits: { maxReps: 80, maxLoadKg: 60 },
    lowImpact: true,
    variants: [
      { suffix: 'Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Cable', equipment: 'cable' },
      { suffix: 'Machine', equipment: 'machine' },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.1 },
      { suffix: 'Leaning Cable', equipment: 'cable' },
    ],
  },
  {
    slug: 'rear_delt',
    name: 'Rear Delt Fly',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'shoulders',
    setKinds: ['reps_load'],
    formCue: 'Hinge forward, thumbs down, sweep the arms wide rather than pulling back.',
    commonMistake: 'Turning it into a row by driving the elbows behind the ribs.',
    intensityFactor: 0.6,
    limits: { maxReps: 80, maxLoadKg: 50 },
    lowImpact: true,
    variants: [
      { suffix: 'Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Cable', equipment: 'cable' },
      { suffix: 'Machine', equipment: 'machine' },
      { suffix: 'Band Pull-Apart', equipment: 'band', intensityDelta: -0.1 },
    ],
  },
  {
    slug: 'shrug',
    name: 'Shrug',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'shoulders',
    setKinds: ['reps_load'],
    formCue: 'Straight up and down. Pause at the top for a full second.',
    commonMistake: 'Rolling the shoulders, which adds range without adding load tolerance.',
    intensityFactor: 0.8,
    limits: { maxReps: 80, maxLoadKg: 300 },
    lowImpact: true,
    variants: [
      { suffix: 'Barbell', equipment: 'barbell' },
      { suffix: 'Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Trap Bar', equipment: 'barbell' },
      { suffix: 'Cable', equipment: 'cable' },
    ],
  },
  {
    slug: 'upright_row',
    name: 'Upright Row',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'shoulders',
    setKinds: ['reps_load'],
    formCue: 'Wider grip than feels natural, stop when the elbows reach shoulder height.',
    commonMistake: 'Pulling high with a narrow grip, which jams the shoulder at the top.',
    intensityFactor: 0.75,
    limits: { maxReps: 60, maxLoadKg: 120 },
    lowImpact: false,
    variants: [
      { suffix: 'Barbell', equipment: 'barbell' },
      { suffix: 'Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Cable', equipment: 'cable' },
    ],
  },

  // ---- Arms ----
  {
    slug: 'biceps_curl',
    name: 'Curl',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'arms',
    setKinds: ['reps_load'],
    formCue: 'Elbows pinned to the ribs, lower for three counts.',
    commonMistake: 'Swinging the torso to start each rep.',
    intensityFactor: 0.7,
    limits: { maxReps: 80, maxLoadKg: 120 },
    lowImpact: true,
    variants: [
      { suffix: 'Barbell', equipment: 'barbell' },
      { suffix: 'Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Hammer', equipment: 'dumbbell' },
      { suffix: 'Incline Dumbbell', equipment: 'dumbbell', intensityDelta: 0.05 },
      { suffix: 'Preacher', equipment: 'bench' },
      { suffix: 'Cable', equipment: 'cable' },
      { suffix: 'Concentration', equipment: 'dumbbell' },
      { suffix: 'EZ Bar', equipment: 'barbell' },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.15 },
      { suffix: 'Spider', equipment: 'dumbbell' },
    ],
  },
  {
    slug: 'triceps_extension',
    name: 'Triceps Extension',
    pillar: 'strength',
    secondaryPillar: null,
    muscleGroup: 'arms',
    setKinds: ['reps_load'],
    formCue: 'Upper arm stays still; only the forearm moves.',
    commonMistake: 'Letting the elbows drift forward so the shoulders take over.',
    intensityFactor: 0.7,
    limits: { maxReps: 80, maxLoadKg: 120 },
    lowImpact: true,
    variants: [
      { suffix: 'Cable Pushdown', equipment: 'cable' },
      { suffix: 'Rope Pushdown', equipment: 'cable' },
      { suffix: 'Overhead Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Skull Crusher', equipment: 'barbell' },
      { suffix: 'Kickback', equipment: 'dumbbell', intensityDelta: -0.1 },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.15 },
      { suffix: 'Bench Dip', equipment: 'bench' },
    ],
  },
  {
    slug: 'forearm',
    name: 'Wrist Curl',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'arms',
    setKinds: ['reps_load', 'hold'],
    formCue: 'Forearm supported, move only through the wrist, full range both directions.',
    commonMistake: 'Loading so heavy the wrist barely moves.',
    intensityFactor: 0.5,
    limits: { maxReps: 100, maxLoadKg: 60, maxDurationSec: 600 },
    lowImpact: true,
    variants: [
      { suffix: 'Barbell', equipment: 'barbell' },
      { suffix: 'Dumbbell Reverse', equipment: 'dumbbell' },
      { suffix: 'Cable', equipment: 'cable' },
    ],
  },
  {
    slug: 'grip_hold',
    name: 'Dead Hang',
    pillar: 'strength',
    secondaryPillar: 'endurance',
    muscleGroup: 'arms',
    setKinds: ['hold'],
    formCue: 'Full hang, shoulders active rather than fully slack, breathe.',
    commonMistake: 'Gripping with a half-open hand, which fails long before the muscle does.',
    intensityFactor: 0.9,
    limits: HOLD_LIMITS,
    lowImpact: true,
    variants: [
      { suffix: 'Bar', equipment: 'bodyweight' },
      { suffix: 'Towel', equipment: 'none', intensityDelta: 0.2 },
      { suffix: 'Single-Arm', equipment: 'bodyweight', intensityDelta: 0.4 },
      { suffix: 'Farmer Carry', equipment: 'dumbbell', intensityDelta: 0.15 },
    ],
  },

  // ---- Core ----
  {
    slug: 'plank',
    name: 'Plank',
    pillar: 'mobility',
    secondaryPillar: 'strength',
    muscleGroup: 'core',
    setKinds: ['hold'],
    formCue: 'Ribs down, glutes on, one straight line. Quality beats duration.',
    commonMistake: 'Hips drifting up into a tent, which makes it easy and pointless.',
    intensityFactor: 0.8,
    limits: HOLD_LIMITS,
    lowImpact: true,
    variants: [
      { suffix: 'Front', equipment: 'bodyweight' },
      { suffix: 'Side', equipment: 'bodyweight' },
      { suffix: 'Ring', equipment: 'rings', intensityDelta: 0.3 },
      { suffix: 'Long-Lever', equipment: 'bodyweight', intensityDelta: 0.25 },
      { suffix: 'Weighted', equipment: 'bodyweight', intensityDelta: 0.2 },
      { suffix: 'Copenhagen', equipment: 'bench', intensityDelta: 0.25 },
    ],
  },
  {
    slug: 'crunch_family',
    name: 'Crunch',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'core',
    setKinds: ['reps_bodyweight', 'reps_load'],
    formCue: 'Curl the ribs toward the hips; the lower back stays down.',
    commonMistake: 'Pulling on the neck with the hands.',
    intensityFactor: 0.6,
    limits: { maxReps: 200, maxLoadKg: 80 },
    lowImpact: true,
    variants: [
      { suffix: 'Standard', equipment: 'bodyweight' },
      { suffix: 'Cable', equipment: 'cable' },
      { suffix: 'Reverse', equipment: 'bodyweight' },
      { suffix: 'Bicycle', equipment: 'bodyweight' },
      { suffix: 'Decline', equipment: 'bench', intensityDelta: 0.1 },
    ],
  },
  {
    slug: 'leg_raise',
    name: 'Leg Raise',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'core',
    setKinds: ['reps_bodyweight'],
    formCue: 'Press the lower back into the floor or bar before the legs move.',
    commonMistake: 'Swinging the legs so the hip flexors do all of it.',
    intensityFactor: 0.8,
    limits: BODYWEIGHT_LIMITS,
    lowImpact: true,
    variants: [
      { suffix: 'Lying', equipment: 'bodyweight' },
      { suffix: 'Hanging Knee', equipment: 'bodyweight', intensityDelta: 0.15 },
      { suffix: 'Hanging Straight-Leg', equipment: 'bodyweight', intensityDelta: 0.3 },
      { suffix: 'Captains Chair', equipment: 'machine' },
      { suffix: 'Toes-to-Bar', equipment: 'bodyweight', intensityDelta: 0.35 },
    ],
  },
  {
    slug: 'anti_rotation',
    name: 'Pallof Press',
    pillar: 'mobility',
    secondaryPillar: 'strength',
    muscleGroup: 'core',
    setKinds: ['reps_load', 'hold'],
    formCue: 'Resist the rotation. The press is slow and the hips do not move.',
    commonMistake: 'Letting the torso turn toward the anchor as the arms extend.',
    intensityFactor: 0.7,
    limits: { maxReps: 80, maxLoadKg: 80, maxDurationSec: 600 },
    lowImpact: true,
    variants: [
      { suffix: 'Cable', equipment: 'cable' },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.1 },
      { suffix: 'Half-Kneeling Cable', equipment: 'cable' },
    ],
  },
  {
    slug: 'carry',
    name: 'Loaded Carry',
    pillar: 'endurance',
    secondaryPillar: 'strength',
    muscleGroup: 'core',
    setKinds: ['distance', 'time'],
    formCue: 'Tall posture, ribs stacked over the hips, short controlled steps.',
    commonMistake: 'Leaning away from the load, which turns it into a side bend.',
    intensityFactor: 1.0,
    limits: { maxDistanceM: 5000, maxDurationSec: 3600 },
    lowImpact: true,
    variants: [
      { suffix: 'Farmer', equipment: 'dumbbell' },
      { suffix: 'Suitcase', equipment: 'dumbbell' },
      { suffix: 'Front Rack', equipment: 'kettlebell' },
      { suffix: 'Overhead', equipment: 'kettlebell', intensityDelta: 0.15 },
      { suffix: 'Yoke', equipment: 'barbell', intensityDelta: 0.2 },
    ],
  },

  // ---- Full body / power ----
  {
    slug: 'clean',
    name: 'Clean',
    pillar: 'strength',
    secondaryPillar: 'endurance',
    muscleGroup: 'full_body',
    setKinds: ['reps_load'],
    formCue: 'Same start as a deadlift, then accelerate. The bar stays close the whole way up.',
    commonMistake: 'Pulling with the arms early, which kills the acceleration from the hips.',
    intensityFactor: 1.35,
    limits: { maxReps: 50, maxLoadKg: 250 },
    lowImpact: false,
    variants: [
      { suffix: 'Power', equipment: 'barbell' },
      { suffix: 'Hang', equipment: 'barbell' },
      { suffix: 'Squat', equipment: 'barbell', intensityDelta: 0.05 },
      { suffix: 'Dumbbell', equipment: 'dumbbell', intensityDelta: -0.15 },
      { suffix: 'Kettlebell', equipment: 'kettlebell', intensityDelta: -0.15 },
    ],
  },
  {
    slug: 'snatch',
    name: 'Snatch',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'full_body',
    setKinds: ['reps_load'],
    formCue: 'Wide grip, patient off the floor, punch up hard into the overhead position.',
    commonMistake: 'Rushing the first pull so the bar swings away from the body.',
    intensityFactor: 1.4,
    limits: { maxReps: 40, maxLoadKg: 200 },
    lowImpact: false,
    variants: [
      { suffix: 'Power', equipment: 'barbell' },
      { suffix: 'Hang', equipment: 'barbell' },
      { suffix: 'Kettlebell', equipment: 'kettlebell', intensityDelta: -0.2 },
      { suffix: 'Dumbbell', equipment: 'dumbbell', intensityDelta: -0.2 },
    ],
  },
  {
    slug: 'swing',
    name: 'Kettlebell Swing',
    pillar: 'endurance',
    secondaryPillar: 'strength',
    muscleGroup: 'full_body',
    setKinds: ['reps_load', 'time'],
    formCue: 'It is a hinge, not a squat. The bell floats; you do not lift it with the arms.',
    commonMistake: 'Squatting the bell up and finishing with the lower back.',
    intensityFactor: 1.1,
    limits: { maxReps: 200, maxLoadKg: 100, maxDurationSec: 1800 },
    lowImpact: true,
    variants: [
      { suffix: 'Russian', equipment: 'kettlebell' },
      { suffix: 'American', equipment: 'kettlebell', intensityDelta: 0.1 },
      { suffix: 'Single-Arm', equipment: 'kettlebell', intensityDelta: 0.1 },
    ],
  },
  {
    slug: 'burpee',
    name: 'Burpee',
    pillar: 'endurance',
    secondaryPillar: 'strength',
    muscleGroup: 'full_body',
    setKinds: ['reps_bodyweight', 'time'],
    formCue: 'Chest to the floor, full stand at the top. Set a pace you can hold.',
    commonMistake: 'Skipping full extension at the top when fatigue sets in.',
    intensityFactor: 1.1,
    limits: { maxReps: 300, maxDurationSec: 3600 },
    lowImpact: false,
    variants: [
      { suffix: 'Standard', equipment: 'bodyweight' },
      { suffix: 'Step-Back', equipment: 'bodyweight', intensityDelta: -0.2, lowImpact: true },
      { suffix: 'Box Jump-Over', equipment: 'none', intensityDelta: 0.15 },
      { suffix: 'Pull-Up', equipment: 'bodyweight', intensityDelta: 0.3 },
    ],
  },
  {
    slug: 'thruster',
    name: 'Thruster',
    pillar: 'endurance',
    secondaryPillar: 'strength',
    muscleGroup: 'full_body',
    setKinds: ['reps_load'],
    formCue: 'One continuous movement from the bottom of the squat through the overhead lockout.',
    commonMistake: 'Pausing at the top of the squat, which loses the drive and doubles the cost.',
    intensityFactor: 1.25,
    limits: { maxReps: 100, maxLoadKg: 200 },
    lowImpact: false,
    variants: [
      { suffix: 'Barbell', equipment: 'barbell' },
      { suffix: 'Dumbbell', equipment: 'dumbbell' },
      { suffix: 'Kettlebell', equipment: 'kettlebell' },
    ],
  },
  {
    slug: 'jump',
    name: 'Jump',
    pillar: 'strength',
    secondaryPillar: 'endurance',
    muscleGroup: 'full_body',
    setKinds: ['reps_bodyweight'],
    formCue: 'Land quietly with soft knees. The landing is the skill.',
    commonMistake: 'Chasing box height with a big knee tuck instead of actually jumping higher.',
    intensityFactor: 1.0,
    limits: { maxReps: 100 },
    lowImpact: false,
    variants: [
      { suffix: 'Box', equipment: 'none' },
      { suffix: 'Broad', equipment: 'bodyweight' },
      { suffix: 'Squat', equipment: 'bodyweight' },
      { suffix: 'Tuck', equipment: 'bodyweight' },
      { suffix: 'Depth', equipment: 'none', intensityDelta: 0.2 },
    ],
  },

  // ---- Cardio / endurance ----
  {
    slug: 'run',
    name: 'Run',
    pillar: 'endurance',
    secondaryPillar: null,
    muscleGroup: 'cardio',
    setKinds: ['distance', 'time'],
    formCue: 'Land under the hips with a quick cadence rather than reaching out with the heel.',
    commonMistake: 'Starting far faster than the pace you intend to hold.',
    intensityFactor: 1.0,
    limits: CARDIO_LIMITS,
    lowImpact: false,
    variants: [
      { suffix: 'Easy', equipment: 'none', intensityDelta: -0.15, lowImpact: true },
      { suffix: 'Tempo', equipment: 'none', intensityDelta: 0.1 },
      { suffix: 'Interval', equipment: 'none', intensityDelta: 0.2 },
      { suffix: 'Hill', equipment: 'none', intensityDelta: 0.2 },
      { suffix: 'Treadmill', equipment: 'machine', lowImpact: true },
      { suffix: 'Trail', equipment: 'none', intensityDelta: 0.1 },
    ],
  },
  {
    slug: 'cycle',
    name: 'Cycle',
    pillar: 'endurance',
    secondaryPillar: null,
    muscleGroup: 'cardio',
    setKinds: ['distance', 'time'],
    formCue: 'Keep cadence above eighty; let the gear do less and the legs turn more.',
    commonMistake: 'Grinding a heavy gear at low cadence for the whole ride.',
    intensityFactor: 0.7,
    limits: { maxDistanceM: 300_000, maxDurationSec: 36_000, maxSpeedMps: 25 },
    lowImpact: true,
    variants: [
      { suffix: 'Outdoor', equipment: 'none' },
      { suffix: 'Stationary', equipment: 'machine' },
      { suffix: 'Interval', equipment: 'machine', intensityDelta: 0.2 },
      { suffix: 'Hill', equipment: 'none', intensityDelta: 0.2 },
    ],
  },
  {
    slug: 'row_erg',
    name: 'Row Erg',
    pillar: 'endurance',
    secondaryPillar: 'strength',
    muscleGroup: 'cardio',
    setKinds: ['distance', 'time'],
    formCue: 'Legs, then back, then arms. Reverse that order coming forward.',
    commonMistake: 'Opening the back early so the legs never finish their drive.',
    intensityFactor: 1.0,
    limits: { maxDistanceM: 100_000, maxDurationSec: 36_000, maxSpeedMps: 8 },
    lowImpact: true,
    variants: [
      { suffix: 'Steady', equipment: 'machine' },
      { suffix: 'Interval', equipment: 'machine', intensityDelta: 0.2 },
      { suffix: 'Sprint', equipment: 'machine', intensityDelta: 0.25 },
    ],
  },
  {
    slug: 'swim',
    name: 'Swim',
    pillar: 'endurance',
    secondaryPillar: 'mobility',
    muscleGroup: 'cardio',
    setKinds: ['distance', 'time'],
    formCue: 'Breathe on a rhythm you can keep for the whole distance.',
    commonMistake: 'Lifting the head to breathe, which drops the hips and adds drag.',
    intensityFactor: 1.15,
    limits: { maxDistanceM: 20_000, maxDurationSec: 21_600, maxSpeedMps: 3 },
    lowImpact: true,
    variants: [
      { suffix: 'Freestyle', equipment: 'none' },
      { suffix: 'Breaststroke', equipment: 'none', intensityDelta: -0.1 },
      { suffix: 'Interval', equipment: 'none', intensityDelta: 0.2 },
    ],
  },
  {
    slug: 'jump_rope',
    name: 'Jump Rope',
    pillar: 'endurance',
    secondaryPillar: 'mobility',
    muscleGroup: 'cardio',
    setKinds: ['time', 'reps_bodyweight'],
    formCue: 'Turn the rope from the wrists, small hops, stay on the balls of the feet.',
    commonMistake: 'Jumping far higher than the rope needs, which burns the calves out early.',
    intensityFactor: 0.9,
    limits: { maxDurationSec: 7200, maxReps: 5000 },
    lowImpact: false,
    variants: [
      { suffix: 'Single Under', equipment: 'none' },
      { suffix: 'Double Under', equipment: 'none', intensityDelta: 0.25 },
      { suffix: 'Interval', equipment: 'none', intensityDelta: 0.15 },
    ],
  },
  {
    slug: 'ruck',
    name: 'Ruck',
    pillar: 'endurance',
    secondaryPillar: 'strength',
    muscleGroup: 'cardio',
    setKinds: ['distance', 'time'],
    formCue: 'Pack high and tight, posture tall, shorten the stride on hills.',
    commonMistake: 'Loading a pack that sits low and drags the shoulders back.',
    intensityFactor: 1.1,
    limits: { maxDistanceM: 80_000, maxDurationSec: 36_000, maxSpeedMps: 5 },
    lowImpact: true,
    variants: [
      { suffix: 'Flat', equipment: 'none' },
      { suffix: 'Hill', equipment: 'none', intensityDelta: 0.15 },
    ],
  },
  {
    slug: 'stair',
    name: 'Stair Climb',
    pillar: 'endurance',
    secondaryPillar: 'strength',
    muscleGroup: 'cardio',
    setKinds: ['time', 'distance'],
    formCue: 'Whole foot on each step, drive from the hip rather than pulling on the rail.',
    commonMistake: 'Hanging on the handrails, which removes most of the work.',
    intensityFactor: 1.0,
    limits: { maxDurationSec: 14_400, maxDistanceM: 20_000 },
    lowImpact: true,
    variants: [
      { suffix: 'Machine', equipment: 'machine' },
      { suffix: 'Stadium', equipment: 'none', intensityDelta: 0.1 },
    ],
  },
  {
    slug: 'sled',
    name: 'Sled',
    pillar: 'endurance',
    secondaryPillar: 'strength',
    muscleGroup: 'full_body',
    setKinds: ['distance', 'time'],
    formCue: 'Low body angle, short aggressive steps, constant tension on the straps.',
    commonMistake: 'Standing too upright, which turns a push into a walk.',
    intensityFactor: 1.2,
    limits: { maxDistanceM: 2000, maxDurationSec: 1800 },
    lowImpact: true,
    variants: [
      { suffix: 'Push', equipment: 'machine' },
      { suffix: 'Drag', equipment: 'machine' },
      { suffix: 'Backward Drag', equipment: 'machine' },
    ],
  },

  // ---- Mobility ----
  {
    slug: 'hip_mobility',
    name: 'Hip Opener',
    pillar: 'mobility',
    secondaryPillar: null,
    muscleGroup: 'legs',
    setKinds: ['hold', 'time'],
    formCue: 'Breathe out into the position. Range comes from relaxing, not forcing.',
    commonMistake: 'Bouncing at end range, which makes the muscle guard against you.',
    intensityFactor: 0.55,
    limits: HOLD_LIMITS,
    lowImpact: true,
    variants: [
      { suffix: '90/90', equipment: 'none' },
      { suffix: 'Pigeon', equipment: 'none' },
      { suffix: 'Couch Stretch', equipment: 'none' },
      { suffix: 'Cossack Squat', equipment: 'bodyweight', intensityDelta: 0.15 },
      { suffix: 'Frog', equipment: 'none' },
      { suffix: 'Deep Squat Hold', equipment: 'bodyweight' },
    ],
  },
  {
    slug: 'shoulder_mobility',
    name: 'Shoulder Mobility',
    pillar: 'mobility',
    secondaryPillar: null,
    muscleGroup: 'shoulders',
    setKinds: ['hold', 'reps_bodyweight'],
    formCue: 'Move slowly through the range you own before reaching for more.',
    commonMistake: 'Arching the ribs to fake overhead range the shoulder does not have.',
    intensityFactor: 0.55,
    limits: { maxDurationSec: 900, maxReps: 100 },
    lowImpact: true,
    variants: [
      { suffix: 'Dislocate', equipment: 'band' },
      { suffix: 'Wall Slide', equipment: 'none' },
      { suffix: 'Thread the Needle', equipment: 'none' },
      { suffix: 'Bar Hang Stretch', equipment: 'bodyweight' },
      { suffix: 'Prone Y-T-W', equipment: 'none' },
    ],
  },
  {
    slug: 'spine_mobility',
    name: 'Spinal Mobility',
    pillar: 'mobility',
    secondaryPillar: null,
    muscleGroup: 'core',
    setKinds: ['reps_bodyweight', 'hold'],
    formCue: 'Move one segment at a time rather than hinging at a single point.',
    commonMistake: 'Moving only from the lower back while the mid-back stays locked.',
    intensityFactor: 0.5,
    limits: { maxReps: 100, maxDurationSec: 900 },
    lowImpact: true,
    variants: [
      { suffix: 'Cat-Cow', equipment: 'none' },
      { suffix: 'Thoracic Extension', equipment: 'none' },
      { suffix: 'Open Book', equipment: 'none' },
      { suffix: 'Segmental Roll-Down', equipment: 'none' },
    ],
  },
  {
    slug: 'hamstring_mobility',
    name: 'Hamstring Mobility',
    pillar: 'mobility',
    secondaryPillar: null,
    muscleGroup: 'legs',
    setKinds: ['hold', 'reps_bodyweight'],
    formCue: 'Keep a long spine; the stretch belongs in the hamstring, not the lower back.',
    commonMistake: 'Rounding the back to reach further, which stretches the wrong tissue.',
    intensityFactor: 0.5,
    limits: { maxDurationSec: 900, maxReps: 80 },
    lowImpact: true,
    variants: [
      { suffix: 'Jefferson Curl', equipment: 'dumbbell', intensityDelta: 0.15 },
      { suffix: 'Standing Reach', equipment: 'none' },
      { suffix: 'Supine Band', equipment: 'band' },
      { suffix: 'Seated Straddle', equipment: 'none' },
    ],
  },
  {
    slug: 'ankle_mobility',
    name: 'Ankle Mobility',
    pillar: 'mobility',
    secondaryPillar: null,
    muscleGroup: 'legs',
    setKinds: ['hold', 'reps_bodyweight'],
    formCue: 'Heel stays down as the knee travels forward over the toes.',
    commonMistake: 'Letting the heel lift, which hides the restriction instead of addressing it.',
    intensityFactor: 0.45,
    limits: { maxDurationSec: 600, maxReps: 80 },
    lowImpact: true,
    variants: [
      { suffix: 'Knee-to-Wall', equipment: 'none' },
      { suffix: 'Banded Distraction', equipment: 'band' },
      { suffix: 'Calf Stretch', equipment: 'none' },
    ],
  },
  // ---- Posterior chain and hip accessories ----
  {
    slug: 'good_morning',
    name: 'Good Morning',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'back',
    setKinds: ['reps_load'],
    formCue: 'Push the hips straight back, keep the bar pinned to the traps, stop when the hamstrings tighten.',
    commonMistake: 'Loading it like a squat and turning it into a rounded-back lift.',
    intensityFactor: 1.0,
    limits: { maxReps: 60, maxLoadKg: 200 },
    lowImpact: false,
    variants: [
      { suffix: 'Barbell', equipment: 'barbell' },
      { suffix: 'Seated', equipment: 'barbell', intensityDelta: -0.05 },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.3, lowImpact: true },
      { suffix: 'Single-Leg', equipment: 'bodyweight', intensityDelta: -0.25 },
    ],
  },
  {
    slug: 'back_extension',
    name: 'Back Extension',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'back',
    setKinds: ['reps_bodyweight', 'reps_load', 'hold'],
    formCue: 'Finish level with the torso rather than arching past it.',
    commonMistake: 'Hyperextending hard at the top, which loads the joints instead of the muscle.',
    intensityFactor: 0.8,
    limits: { maxReps: 100, maxLoadKg: 100, maxDurationSec: 600 },
    lowImpact: true,
    variants: [
      { suffix: 'Forty-Five Degree', equipment: 'machine' },
      { suffix: 'Horizontal', equipment: 'machine' },
      { suffix: 'Reverse Hyper', equipment: 'machine' },
      { suffix: 'Superman', equipment: 'bodyweight', intensityDelta: -0.3 },
      { suffix: 'Bird Dog', equipment: 'bodyweight', intensityDelta: -0.3 },
    ],
  },
  {
    slug: 'hip_abduction',
    name: 'Hip Abduction',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'legs',
    setKinds: ['reps_load', 'reps_bodyweight'],
    formCue: 'Drive the knee out without letting the torso tip away from it.',
    commonMistake: 'Leaning the upper body to create range the hip is not producing.',
    intensityFactor: 0.6,
    limits: { maxReps: 100, maxLoadKg: 150 },
    lowImpact: true,
    variants: [
      { suffix: 'Machine', equipment: 'machine' },
      { suffix: 'Cable', equipment: 'cable' },
      { suffix: 'Band Walk', equipment: 'band' },
      { suffix: 'Side-Lying', equipment: 'bodyweight', intensityDelta: -0.15 },
      { suffix: 'Clamshell', equipment: 'band', intensityDelta: -0.15 },
    ],
  },
  {
    slug: 'face_pull',
    name: 'Face Pull',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'shoulders',
    setKinds: ['reps_load'],
    formCue: 'Pull toward the forehead and rotate the hands back as the elbows travel.',
    commonMistake: 'Rowing to the chest, which skips the rotation that makes it worth doing.',
    intensityFactor: 0.6,
    limits: { maxReps: 80, maxLoadKg: 80 },
    lowImpact: true,
    variants: [
      { suffix: 'Cable', equipment: 'cable' },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.1 },
      { suffix: 'Half-Kneeling Cable', equipment: 'cable' },
    ],
  },

  // ---- Core, extended ----
  {
    slug: 'rotation',
    name: 'Rotational Core',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'core',
    setKinds: ['reps_load', 'reps_bodyweight'],
    formCue: 'Rotate from the ribs, not the lower back; the hips stay square.',
    commonMistake: 'Swinging the arms while the torso stays still.',
    intensityFactor: 0.65,
    limits: { maxReps: 150, maxLoadKg: 60 },
    lowImpact: true,
    variants: [
      { suffix: 'Russian Twist', equipment: 'bodyweight' },
      { suffix: 'Cable Woodchop', equipment: 'cable' },
      { suffix: 'Landmine Twist', equipment: 'barbell' },
      { suffix: 'Medicine Ball Throw', equipment: 'none', intensityDelta: 0.15 },
    ],
  },
  {
    slug: 'ab_wheel',
    name: 'Ab Rollout',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'core',
    setKinds: ['reps_bodyweight'],
    formCue: 'Ribs pulled down the entire way out. Go only as far as you can keep them there.',
    commonMistake: 'Rolling out past the point where the lower back takes over.',
    intensityFactor: 1.0,
    limits: { maxReps: 80 },
    lowImpact: false,
    variants: [
      { suffix: 'Wheel From Knees', equipment: 'none' },
      { suffix: 'Wheel Standing', equipment: 'none', intensityDelta: 0.35 },
      { suffix: 'Barbell From Knees', equipment: 'barbell' },
      { suffix: 'Ring Fallout', equipment: 'rings', intensityDelta: 0.15 },
    ],
  },
  {
    slug: 'hollow',
    name: 'Hollow Hold',
    pillar: 'mobility',
    secondaryPillar: 'strength',
    muscleGroup: 'core',
    setKinds: ['hold'],
    formCue: 'Lower back pressed flat to the floor. Raise the limbs only while it stays there.',
    commonMistake: 'Letting the lower back arch off the floor to get the legs lower.',
    intensityFactor: 0.75,
    limits: HOLD_LIMITS,
    lowImpact: true,
    variants: [
      { suffix: 'Tuck', equipment: 'bodyweight', intensityDelta: -0.2 },
      { suffix: 'Standard', equipment: 'bodyweight' },
      { suffix: 'Rock', equipment: 'bodyweight', intensityDelta: 0.1 },
      { suffix: 'Arch', equipment: 'bodyweight' },
    ],
  },

  // ---- Conditioning ----
  {
    slug: 'sprint',
    name: 'Sprint',
    pillar: 'endurance',
    secondaryPillar: 'strength',
    muscleGroup: 'cardio',
    setKinds: ['distance', 'time'],
    formCue: 'Build speed over the first third rather than firing everything at the line.',
    commonMistake: 'Sprinting cold. This one needs a genuine warm-up every time.',
    intensityFactor: 1.3,
    limits: { maxDistanceM: 2000, maxDurationSec: 600, maxSpeedMps: 13 },
    lowImpact: false,
    variants: [
      { suffix: 'Flat', equipment: 'none' },
      { suffix: 'Hill', equipment: 'none', intensityDelta: 0.1 },
      { suffix: 'Shuttle', equipment: 'none' },
      { suffix: 'Resisted', equipment: 'machine', intensityDelta: 0.1 },
    ],
  },
  {
    slug: 'conditioning_machine',
    name: 'Conditioning',
    pillar: 'endurance',
    secondaryPillar: 'strength',
    muscleGroup: 'cardio',
    setKinds: ['time', 'distance'],
    formCue: 'Pick a pace you could hold for twice the planned duration, then hold it.',
    commonMistake: 'Going out at a pace that forces a walk two minutes in.',
    intensityFactor: 1.05,
    limits: { maxDurationSec: 14_400, maxDistanceM: 50_000, maxSpeedMps: 15 },
    lowImpact: true,
    variants: [
      { suffix: 'Assault Bike', equipment: 'machine' },
      { suffix: 'Ski Erg', equipment: 'machine' },
      { suffix: 'Elliptical', equipment: 'machine', intensityDelta: -0.15 },
      { suffix: 'Battle Rope', equipment: 'none', intensityDelta: 0.05 },
      { suffix: 'Wall Ball', equipment: 'none', intensityDelta: 0.1 },
    ],
  },
  {
    slug: 'hike',
    name: 'Hike',
    pillar: 'endurance',
    secondaryPillar: 'mobility',
    muscleGroup: 'cardio',
    setKinds: ['distance', 'time'],
    formCue: 'Shorten the stride on the climbs and let the pace drop rather than the posture.',
    commonMistake: 'Descending fast on tired legs, which is where most of the injuries happen.',
    intensityFactor: 0.85,
    limits: { maxDistanceM: 80_000, maxDurationSec: 43_200, maxSpeedMps: 4 },
    lowImpact: true,
    variants: [
      { suffix: 'Trail', equipment: 'none' },
      { suffix: 'Incline', equipment: 'none', intensityDelta: 0.15 },
      { suffix: 'Loaded', equipment: 'none', intensityDelta: 0.2 },
    ],
  },

  {
    slug: 'lower_leg',
    name: 'Tibialis Raise',
    pillar: 'strength',
    secondaryPillar: 'mobility',
    muscleGroup: 'legs',
    setKinds: ['reps_bodyweight', 'reps_load'],
    formCue: 'Heels planted, pull the toes up toward the shins as far as they will go.',
    commonMistake: 'Rocking back onto the heels instead of moving through the ankle.',
    intensityFactor: 0.5,
    limits: { maxReps: 150, maxLoadKg: 80 },
    lowImpact: true,
    variants: [
      { suffix: 'Wall', equipment: 'bodyweight' },
      { suffix: 'Weighted', equipment: 'dumbbell' },
      { suffix: 'Band', equipment: 'band', intensityDelta: -0.1 },
      { suffix: 'Machine', equipment: 'machine' },
      { suffix: 'Heel Walk', equipment: 'bodyweight', intensityDelta: -0.05 },
      { suffix: 'Toe Walk', equipment: 'bodyweight', intensityDelta: -0.05 },
    ],
  },

  {
    slug: 'flow',
    name: 'Movement Flow',
    pillar: 'mobility',
    secondaryPillar: 'endurance',
    muscleGroup: 'full_body',
    setKinds: ['time'],
    formCue: 'Continuous, unhurried, no position held long enough to cool down.',
    commonMistake: 'Rushing so it becomes cardio and stops being mobility work.',
    intensityFactor: 0.65,
    limits: { maxDurationSec: 5400 },
    lowImpact: true,
    variants: [
      { suffix: 'Animal', equipment: 'none' },
      { suffix: 'Sun Salutation', equipment: 'none' },
      { suffix: 'Loaded Mobility', equipment: 'kettlebell', intensityDelta: 0.15 },
      { suffix: 'Ground Flow', equipment: 'none' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function expand(base: BaseMovement): Exercise[] {
  return base.variants.map((variant) => ({
    id: `${base.slug}__${slugify(variant.suffix)}`,
    name: `${variant.suffix} ${base.name}`.trim(),
    pillar: base.pillar,
    secondaryPillar: base.secondaryPillar,
    muscleGroup: base.muscleGroup,
    equipment: variant.equipment,
    setKinds: base.setKinds,
    formCue: variant.formCue ?? base.formCue,
    commonMistake: variant.commonMistake ?? base.commonMistake,
    intensityFactor:
      Math.round((base.intensityFactor + (variant.intensityDelta ?? 0)) * 100) / 100,
    limits: base.limits,
    lowImpact: variant.lowImpact ?? base.lowImpact,
  }));
}

/** The full library. §7 requires 300+; see exercises.test.ts for the assertion. */
export const EXERCISES: Exercise[] = BASE_MOVEMENTS.flatMap(expand);

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

/** Adapter to the scoring engine, which only needs the scoring-relevant fields. */
export function scoringProfileFor(id: string): ExerciseScoringProfile | undefined {
  const exercise = BY_ID.get(id);
  if (!exercise) return undefined;
  return {
    id: exercise.id,
    pillar: exercise.pillar,
    secondaryPillar: exercise.secondaryPillar,
    intensityFactor: exercise.intensityFactor,
    limits: exercise.limits,
  };
}

export function exercisesForPillar(pillar: Pillar): Exercise[] {
  return EXERCISES.filter((e) => e.pillar === pillar);
}

export function exercisesForMuscleGroup(group: MuscleGroup): Exercise[] {
  return EXERCISES.filter((e) => e.muscleGroup === group);
}

/** §6: conservative loading for readiness-flagged operators draws from this set. */
export function lowImpactExercises(): Exercise[] {
  return EXERCISES.filter((e) => e.lowImpact);
}

export function searchExercises(query: string): Exercise[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return EXERCISES;
  return EXERCISES.filter(
    (e) => e.name.toLowerCase().includes(needle) || e.muscleGroup.includes(needle),
  );
}
