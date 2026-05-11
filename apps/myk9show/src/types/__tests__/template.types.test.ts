import { describe, expect, it } from 'vitest';
import { formatTrialTypeLabel } from '../template.types';

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
