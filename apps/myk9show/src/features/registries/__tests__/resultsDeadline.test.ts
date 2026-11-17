import { describe, expect, it } from 'vitest';

import { describeResultsDeadline, lastTrialDay, resultsDeadlineFor } from '@/features/registries';
import { addCalendarDays } from '../../../../../../supabase/functions/_shared/showCloseout/resultsDeadline';

describe('results deadline', () => {
  it('counts AKC 7 days and ASCA 15 days from the last trial day, across a month end', () => {
    expect(resultsDeadlineFor('AKC', '2026-11-26')).toBe('2026-12-03');
    expect(resultsDeadlineFor('ASCA', '2026-11-20')).toBe('2026-12-05');
    expect(addCalendarDays('2028-02-25', 7)).toBe('2028-03-03');
  });

  it('shows no date for UKC, which has no verified deadline, or without a last day', () => {
    expect(resultsDeadlineFor('UKC', '2026-11-17')).toBeNull();
    expect(describeResultsDeadline('UKC', '2026-11-24')).toBeNull();
    expect(resultsDeadlineFor('AKC', null)).toBeNull();
  });

  it('takes the latest trial day in the show time zone, where UTC is already the next day', () => {
    // 2026-11-18T03:00Z is still Nov 17 in Los Angeles.
    const la = 'America/Los_Angeles';
    expect(lastTrialDay([{ date: '2026-11-18T03:00:00Z', timeZone: la }])).toBe('2026-11-17');
    expect(
      lastTrialDay([
        { date: '2026-11-15', timeZone: la },
        { date: '2026-11-18T03:00:00Z', timeZone: la },
      ])
    ).toBe('2026-11-17');
    // A DATE column round-trips as midnight UTC and is already the calendar day.
    expect(lastTrialDay([{ date: '2026-11-17T00:00:00+00:00', timeZone: la }])).toBe('2026-11-17');
    expect(lastTrialDay([{ date: null, timeZone: la }])).toBeNull();
  });

  it('words AKC as an arrival date', () => {
    expect(describeResultsDeadline('AKC', '2026-11-24')).toBe('Due at AKC by Tue, Nov 24');
    expect(describeResultsDeadline('ASCA', '2026-12-05')).toBe('Due to ASCA by Sat, Dec 5');
  });
});
