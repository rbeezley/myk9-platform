import { describe, expect, it } from 'vitest';
import {
  canonicalizeTrialType,
  disciplineUsesJumpHeight,
  formatTrialTypeLabel,
  TrialType,
} from '../template.types';

describe('canonicalizeTrialType', () => {
  it('classifies every declared enum key and value', () => {
    for (const [key, value] of Object.entries(TrialType)) {
      expect(canonicalizeTrialType(key)).toBe(value);
      expect(canonicalizeTrialType(value)).toBe(value);
    }
  });

  it.each([
    ['Scent Work', TrialType.SCENT_WORK],
    ['SCENT_WORK', TrialType.SCENT_WORK],
    ['scent_work', TrialType.SCENT_WORK],
    ['scent-work', TrialType.SCENT_WORK],
    ['Scentwork', TrialType.SCENT_WORK],
    ['AKC Scent Work', TrialType.SCENT_WORK],
    ['AKC_Scent_Work', TrialType.SCENT_WORK],
    ['Nosework', TrialType.NOSEWORK],
    ['UKC Nosework', TrialType.NOSEWORK],
    ['Scent Detection', TrialType.SCENT_DETECTION],
    ['ASCA Scent Detection', TrialType.SCENT_DETECTION],
  ])('classifies %s exactly', (input, expected) => {
    expect(canonicalizeTrialType(input)).toBe(expected);
  });

  it('does not classify unknown or substring-only matches as a known discipline', () => {
    expect(canonicalizeTrialType('Trial for Scent Work')).toBeUndefined();
    expect(canonicalizeTrialType('AKC Nosework')).toBeUndefined();
    expect(canonicalizeTrialType('future_discipline')).toBeUndefined();
    expect(canonicalizeTrialType(undefined)).toBeUndefined();
  });
});

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
