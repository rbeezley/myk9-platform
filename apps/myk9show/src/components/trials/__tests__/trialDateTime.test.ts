import { describe, expect, it } from 'vitest';
import { hasTrialTime, normalizeTimeOfDay } from '../trialDateTime';

/**
 * The stored convention for a trial time is the one Edit Trial always wrote and
 * validated: zero-padded 12-hour with AM/PM ("09:00 AM").
 */
describe('trial start time spelling', () => {
  it('writes one spelling from the time-of-day input', () => {
    expect(normalizeTimeOfDay('9:15pm')).toBe('09:15 PM');
    expect(normalizeTimeOfDay('12:05 am')).toBe('12:05 AM');
    expect(normalizeTimeOfDay('09:15 PM')).toBe('09:15 PM');
    expect(normalizeTimeOfDay('not a time')).toBe('not a time');
  });

  it('an empty or unparseable start time is "no time"', () => {
    expect(hasTrialTime('')).toBe(false);
    expect(hasTrialTime('soon')).toBe(false);
    expect(hasTrialTime('09:00 AM')).toBe(true);
    expect(hasTrialTime('12:00 AM')).toBe(true);
  });
});
