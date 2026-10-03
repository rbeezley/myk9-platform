import { describe, expect, it } from 'vitest';

import { clockTimeToInstant, getStartDelayMinutes, instantToClockTime } from './cockpitTime';

describe('cockpit time conversion', () => {
  it('records the selected Trial-local time as an instant', () => {
    expect(clockTimeToInstant('2026-07-20', '10:15', 'America/Chicago')).toBe(
      '2026-07-20T15:15:00.000Z'
    );
  });

  it('renders an instant back in the Trial timezone', () => {
    expect(instantToClockTime('2026-07-20T15:15:00.000Z', 'America/Chicago')).toBe('10:15');
  });
});

// MYK9-954: the delay script moved from Tools to the class's expected start,
// so its minutes come from the two times instead of a typed default of 30.
describe('getStartDelayMinutes', () => {
  const base = { trialDate: '2026-07-20', timeZone: 'America/Chicago' };

  it('is the minutes the revised start runs behind the scheduled one', () => {
    expect(
      getStartDelayMinutes({
        ...base,
        scheduledStart: '9:30 AM',
        revisedExpectedStart: '2026-07-20T15:15:00.000Z',
      })
    ).toBe(45);
    expect(
      getStartDelayMinutes({
        ...base,
        scheduledStart: '14:00',
        revisedExpectedStart: '2026-07-20T19:20:00.000Z',
      })
    ).toBe(20);
  });

  it('is null when nothing runs late: no revision, running early, or no scheduled time', () => {
    expect(
      getStartDelayMinutes({ ...base, scheduledStart: '9:30 AM', revisedExpectedStart: null })
    ).toBeNull();
    expect(
      getStartDelayMinutes({
        ...base,
        scheduledStart: '11:00 AM',
        revisedExpectedStart: '2026-07-20T15:15:00.000Z',
      })
    ).toBeNull();
    expect(
      getStartDelayMinutes({
        ...base,
        scheduledStart: null,
        revisedExpectedStart: '2026-07-20T15:15:00.000Z',
      })
    ).toBeNull();
  });
});
