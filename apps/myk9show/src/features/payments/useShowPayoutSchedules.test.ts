import { describe, it, expect } from 'vitest';
import { showPayoutSchedule } from './useShowPayoutSchedules';

const trial = (id: string, date: string, timezone: string, deletedAt: string | null = null) => ({
  id,
  name: id,
  date,
  trialNumber: '1',
  status: 'planned',
  timezone,
  deletedAt,
});

describe('showPayoutSchedule', () => {
  it('takes the last day from the show and the zone from its first live trial', () => {
    expect(
      showPayoutSchedule({
        endDate: '2026-12-09T00:00:00+00:00',
        trials: [
          trial('t-2', '2026-12-09', 'America/New_York'),
          trial('t-1', '2026-12-08', 'America/Los_Angeles'),
        ],
      })
    ).toEqual({ lastDay: '2026-12-09', timeZone: 'America/Los_Angeles' });
  });

  it('skips a deleted trial when choosing the zone', () => {
    expect(
      showPayoutSchedule({
        endDate: '2026-12-09',
        trials: [
          trial('t-1', '2026-12-08', 'America/Denver', '2026-11-01T00:00:00Z'),
          trial('t-2', '2026-12-09', 'America/Chicago'),
        ],
      })?.timeZone
    ).toBe('America/Chicago');
  });

  it('has no schedule without a readable last day', () => {
    expect(showPayoutSchedule({ endDate: '', trials: [] })).toBeNull();
  });
});
