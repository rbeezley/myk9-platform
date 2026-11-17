import { describe, expect, it } from 'vitest';
import { requestTrialLabels, trialFactsById } from './classChangeTrialLabels';

const trials = trialFactsById([
  { id: 't1', date: '2026-11-16', trial_number: 'Trial 1' },
  { id: 't2', date: '2026-11-16', trial_number: '2' },
  { id: 't3', date: '2026-11-17', trial_number: '3' },
]);

describe('requestTrialLabels (MYK9-2129)', () => {
  it('names only the current trial when the class asked for is in it', () => {
    expect(requestTrialLabels(trials, 't1', 't1')).toEqual({
      fromTrial: 'Mon, Nov 16 · Trial 1',
      requestedTrial: null,
    });
  });

  it('names the other trial without the day when it is the same day', () => {
    expect(requestTrialLabels(trials, 't1', 't2').requestedTrial).toBe('Trial 2');
  });

  it('adds the day when the other trial is on another day', () => {
    expect(requestTrialLabels(trials, 't1', 't3').requestedTrial).toBe('Tue, Nov 17 · Trial 3');
  });

  it('names no requested trial when its trial is unknown or not stored', () => {
    expect(requestTrialLabels(trials, 't1', undefined).requestedTrial).toBeNull();
    expect(requestTrialLabels(trials, 't1', 'missing').requestedTrial).toBeNull();
  });

  it('gives the day of the requested trial when the current trial is unknown', () => {
    expect(requestTrialLabels(trials, 'missing', 't2')).toEqual({
      fromTrial: null,
      requestedTrial: 'Mon, Nov 16 · Trial 2',
    });
  });
});
