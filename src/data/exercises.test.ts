import { describe, expect, it } from 'vitest';
import {
  EXERCISES,
  exercisesForPillar,
  getExercise,
  lowImpactExercises,
  scoringProfileFor,
  searchExercises,
} from './exercises';

describe('§7 — exercise library', () => {
  it('ships at least 300 movements', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(300);
  });

  it('has unique ids', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    expect(ids.size).toBe(EXERCISES.length);
  });

  it('has unique names', () => {
    const names = new Set(EXERCISES.map((e) => e.name));
    expect(names.size).toBe(EXERCISES.length);
  });

  it('tags every movement to a pillar and a muscle group', () => {
    for (const exercise of EXERCISES) {
      expect(['strength', 'endurance', 'consistency', 'mobility']).toContain(exercise.pillar);
      expect(exercise.muscleGroup.length).toBeGreaterThan(0);
    }
  });

  it('gives every movement a real form cue and mistake warning', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.formCue.length, exercise.id).toBeGreaterThan(20);
      expect(exercise.commonMistake.length, exercise.id).toBeGreaterThan(20);
      expect(exercise.formCue).not.toMatch(/TODO|placeholder|lorem|\{\{/i);
      expect(exercise.commonMistake).not.toMatch(/TODO|placeholder|lorem|\{\{/i);
    }
  });

  it('never references appearance or body composition — §21', () => {
    const banned =
      /\b(calorie|calories|fat loss|body fat|lean out|toned|tone up|slim|shred|bulk up|weight loss|six.?pack|beach body)\b/i;
    for (const exercise of EXERCISES) {
      expect(exercise.formCue, exercise.id).not.toMatch(banned);
      expect(exercise.commonMistake, exercise.id).not.toMatch(banned);
      expect(exercise.name, exercise.id).not.toMatch(banned);
    }
  });

  it('declares at least one set kind per movement', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.setKinds.length, exercise.id).toBeGreaterThan(0);
    }
  });

  it('keeps intensity factors in a sane range', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.intensityFactor, exercise.id).toBeGreaterThan(0);
      expect(exercise.intensityFactor, exercise.id).toBeLessThanOrEqual(2);
    }
  });

  it('sets plausibility limits appropriate to the set kinds', () => {
    for (const exercise of EXERCISES) {
      if (exercise.setKinds.includes('reps_load') || exercise.setKinds.includes('reps_bodyweight')) {
        expect(exercise.limits.maxReps, exercise.id).toBeGreaterThan(0);
      }
      if (exercise.setKinds.includes('distance')) {
        expect(exercise.limits.maxDistanceM, exercise.id).toBeGreaterThan(0);
      }
      if (exercise.setKinds.includes('hold')) {
        expect(exercise.limits.maxDurationSec, exercise.id).toBeGreaterThan(0);
      }
    }
  });

  it('covers strength, endurance and mobility', () => {
    expect(exercisesForPillar('strength').length).toBeGreaterThan(50);
    expect(exercisesForPillar('endurance').length).toBeGreaterThan(15);
    expect(exercisesForPillar('mobility').length).toBeGreaterThan(15);
  });

  it('offers a substantial low-impact set for conservative loading — §6', () => {
    expect(lowImpactExercises().length).toBeGreaterThan(80);
  });

  it('resolves a scoring profile for every movement', () => {
    for (const exercise of EXERCISES) {
      const profile = scoringProfileFor(exercise.id);
      expect(profile, exercise.id).toBeDefined();
      expect(profile!.pillar).toBe(exercise.pillar);
    }
  });

  it('returns undefined for an unknown id', () => {
    expect(getExercise('not_a_real_exercise')).toBeUndefined();
    expect(scoringProfileFor('not_a_real_exercise')).toBeUndefined();
  });

  it('searches by name and muscle group', () => {
    expect(searchExercises('squat').length).toBeGreaterThan(5);
    expect(searchExercises('cardio').length).toBeGreaterThan(5);
    expect(searchExercises('')).toHaveLength(EXERCISES.length);
  });

  it('never gives a secondary pillar equal to the primary', () => {
    for (const exercise of EXERCISES) {
      if (exercise.secondaryPillar) {
        expect(exercise.secondaryPillar, exercise.id).not.toBe(exercise.pillar);
      }
    }
  });
});
