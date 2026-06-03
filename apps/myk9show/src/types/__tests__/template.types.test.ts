import { describe, expect, it } from 'vitest';
import { disciplineUsesJumpHeight, formatTrialTypeLabel } from '../template.types';

describe('formatTrialTypeLabel', () => {
  it('returns display labels for enum values', () => {
    expect(formatTrialTypeLabel('Scent Work')).toBe('Scent Work');
    expect(formatTrialTypeLabel('Obedience & Rally')).toBe('Obedience & Rally');
  });

  it('maps raw enum keys to display labels', () => {
    expect(formatTrialTypeLabel('SCENT_WORK')).toBe('Scent Work');
    expect(formatTrialTypeLabel('COURSING_ABILITY_TEST')).toBe('Coursing Ability Test');
  });

  it('formats unknown values as readable labels', () => {
    expect(formatTrialTypeLabel('future_trial_type')).toBe('Future Trial Type');
  });
});

describe('disciplineUsesJumpHeight', () => {
  it('is true for jumping disciplines (agility, obedience, rally)', () => {
    expect(disciplineUsesJumpHeight('Agility')).toBe(true);
    expect(disciplineUsesJumpHeight('Obedience')).toBe(true);
    expect(disciplineUsesJumpHeight('Rally')).toBe(true);
    expect(disciplineUsesJumpHeight('Obedience & Rally')).toBe(true);
  });

  it('is false for scent work / nosework disciplines', () => {
    expect(disciplineUsesJumpHeight('Scent Work')).toBe(false);
    expect(disciplineUsesJumpHeight('Nosework')).toBe(false);
    expect(disciplineUsesJumpHeight('Scent Detection')).toBe(false);
  });

  it('normalizes raw/stored enum formats before classifying', () => {
    expect(disciplineUsesJumpHeight('scent_work')).toBe(false);
    expect(disciplineUsesJumpHeight('AGILITY')).toBe(true);
    expect(disciplineUsesJumpHeight('rally')).toBe(true);
  });

  it('is false for missing or unknown values (hide-by-default)', () => {
    expect(disciplineUsesJumpHeight(undefined)).toBe(false);
    expect(disciplineUsesJumpHeight(null)).toBe(false);
    expect(disciplineUsesJumpHeight('')).toBe(false);
    expect(disciplineUsesJumpHeight('Barn Hunt')).toBe(false);
  });
});
