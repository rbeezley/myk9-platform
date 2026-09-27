import { describe, it, expect } from 'vitest';
import { buildTrialTimezoneOptions, TRIAL_TIMEZONE_OPTIONS } from '../trialTimezones';

describe('buildTrialTimezoneOptions', () => {
  it('returns the curated list unchanged when the current zone is already in it', () => {
    const options = buildTrialTimezoneOptions('America/Chicago');
    expect(options).toEqual(TRIAL_TIMEZONE_OPTIONS);
  });

  it('prepends an out-of-list zone so the picker value is never unlisted', () => {
    const options = buildTrialTimezoneOptions('America/Indiana/Indianapolis');
    expect(options[0]).toEqual({
      value: 'America/Indiana/Indianapolis',
      label: 'America/Indiana/Indianapolis',
    });
    expect(options).toHaveLength(TRIAL_TIMEZONE_OPTIONS.length + 1);
  });

  it('does not mutate the shared curated list', () => {
    buildTrialTimezoneOptions('America/Indiana/Indianapolis');
    expect(TRIAL_TIMEZONE_OPTIONS).toHaveLength(7);
  });
});
