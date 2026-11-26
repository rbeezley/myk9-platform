import { describe, expect, it } from 'vitest';
import { formatTrialOptionLabel } from '../trialOptionLabel';

describe('formatTrialOptionLabel', () => {
  it('prints the trial date as a US calendar date, never raw ISO', () => {
    expect(
      formatTrialOptionLabel({ name: 'Trial 1', trial_number: 'Trial 1', date: '2027-01-07' })
    ).toBe('Trial 1 · 1/7/2027');
  });

  it('leaves the label bare when the trial has no date', () => {
    expect(formatTrialOptionLabel({ name: 'Trial 1', trial_number: 'Trial 1', date: '' })).toBe(
      'Trial 1'
    );
  });
});
