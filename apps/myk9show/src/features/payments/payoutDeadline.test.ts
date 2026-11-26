import { describe, it, expect } from 'vitest';
import {
  PAYOUT_PROMISE_BUSINESS_DAYS,
  addBusinessDays,
  payoutDueDate,
  payoutTimeline,
  showCalendarDay,
} from './payoutDeadline';

describe('the five-business-day payout promise (MYK9-1956, MYK9-1985)', () => {
  it('is five business days', () => {
    expect(PAYOUT_PROMISE_BUSINESS_DAYS).toBe(5);
  });

  it('a Wednesday show is paid by the next Wednesday (the owner table: December 9 -> 16)', () => {
    expect(payoutDueDate('2026-12-09')).toBe('2026-12-16');
  });

  it('skips the weekend in the middle of the count', () => {
    // Fri Dec 11 -> Mon 14, Tue 15, Wed 16, Thu 17, Fri 18.
    expect(payoutDueDate('2026-12-11')).toBe('2026-12-18');
  });

  it('a show ending on a weekend starts counting on Monday', () => {
    // Sat Dec 12 and Sun Dec 13 both land on Fri Dec 18.
    expect(payoutDueDate('2026-12-12')).toBe('2026-12-18');
    expect(payoutDueDate('2026-12-13')).toBe('2026-12-18');
  });

  it('carries across a month end and a year end', () => {
    // Thu Apr 30 -> Fri May 1, Mon 4, Tue 5, Wed 6, Thu 7.
    expect(payoutDueDate('2026-04-30')).toBe('2026-05-07');
    // Wed Dec 30 -> Thu 31, Fri Jan 1, Mon 4, Tue 5, Wed 6.
    expect(payoutDueDate('2026-12-30')).toBe('2027-01-06');
  });

  it('carries across the end of February in a leap year', () => {
    // Fri Feb 25 2028 -> Mon 28, Tue 29, Wed Mar 1, Thu 2, Fri 3.
    expect(payoutDueDate('2028-02-25')).toBe('2028-03-03');
  });

  it('adds any count of business days, and zero is the same day', () => {
    expect(addBusinessDays('2026-12-09', 0)).toBe('2026-12-09');
    expect(addBusinessDays('2026-12-09', 1)).toBe('2026-12-10');
    expect(addBusinessDays('2026-12-11', 1)).toBe('2026-12-14');
  });

  it('refuses a value that is not a calendar date rather than guessing', () => {
    expect(payoutDueDate('')).toBeNull();
    expect(payoutDueDate('not a date')).toBeNull();
    expect(payoutDueDate('2026-02-30')).toBeNull();
  });
});

describe('showCalendarDay', () => {
  it('reads the stored midnight-UTC timestamp as its calendar date', () => {
    expect(showCalendarDay('2026-12-09T00:00:00+00:00')).toBe('2026-12-09');
    expect(showCalendarDay('2026-12-09')).toBe('2026-12-09');
  });

  it('is null for a missing or unreadable date', () => {
    expect(showCalendarDay(null)).toBeNull();
    expect(showCalendarDay(undefined)).toBeNull();
    expect(showCalendarDay('soon')).toBeNull();
  });
});

describe('payoutTimeline: "today" is the show\'s calendar day, not the browser\'s', () => {
  it('a late Wednesday evening in Los Angeles is still the show day there', () => {
    // 2026-12-10T05:30Z is Thu in UTC and New York, but Wed 21:30 in Los Angeles.
    const now = new Date('2026-12-10T05:30:00Z');
    expect(payoutTimeline('2026-12-09', 'America/Los_Angeles', now)).toEqual({
      lastDay: '2026-12-09',
      dueDate: '2026-12-16',
      today: '2026-12-09',
      showEnded: false,
      pastDue: false,
    });
    expect(payoutTimeline('2026-12-09', 'America/New_York', now)?.showEnded).toBe(true);
  });

  it('the due date itself is not past due; the day after is', () => {
    const onDueDate = new Date('2026-12-16T20:00:00Z');
    const dayAfter = new Date('2026-12-17T15:00:00Z');
    expect(payoutTimeline('2026-12-09', 'America/Chicago', onDueDate)?.pastDue).toBe(false);
    expect(payoutTimeline('2026-12-09', 'America/Chicago', dayAfter)?.pastDue).toBe(true);
  });

  it('is null without a readable last day', () => {
    expect(payoutTimeline(null, 'America/New_York', new Date())).toBeNull();
  });
});
