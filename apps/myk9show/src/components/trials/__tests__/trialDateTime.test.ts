import { describe, expect, it } from 'vitest';
import {
  composeTrialDateTime,
  hasTrialTime,
  normalizeTimeOfDay,
  splitTrialDateTime,
} from '../trialDateTime';

/**
 * The stored convention for a trial time is the one Edit Trial always wrote and
 * validated: zero-padded 12-hour with AM/PM ("09:00 AM"). Every writer here must
 * produce that one spelling.
 */
describe('trial date and time storage', () => {
  it('round-trips the stored strings unchanged', () => {
    const composed = composeTrialDateTime('2026-05-02', '09:00 AM');
    expect(composed).toBeDefined();
    expect(splitTrialDateTime(composed!)).toEqual({
      trialDate: '2026-05-02',
      plannedStartTime: '09:00 AM',
    });
    const pm = composeTrialDateTime('2026-05-02', '01:30 PM');
    expect(splitTrialDateTime(pm!)).toEqual({
      trialDate: '2026-05-02',
      plannedStartTime: '01:30 PM',
    });
  });

  it('writes one spelling from the time-of-day input too', () => {
    expect(normalizeTimeOfDay('9:15pm')).toBe('09:15 PM');
    expect(normalizeTimeOfDay('12:05 am')).toBe('12:05 AM');
    expect(normalizeTimeOfDay('09:15 PM')).toBe('09:15 PM');
    expect(normalizeTimeOfDay('not a time')).toBe('not a time');
  });

  it('an empty or unparseable start time is "no time", not midnight', () => {
    expect(hasTrialTime('')).toBe(false);
    expect(hasTrialTime('soon')).toBe(false);
    expect(hasTrialTime('09:00 AM')).toBe(true);
    expect(hasTrialTime('12:00 AM')).toBe(true);
  });
});
