/**
 * MYK9-642 — the one rule that decides both the fee tier and
 * `entries.is_day_of_show`.
 *
 * Every boundary here is asserted against the same values the server guard
 * uses: `entry_close_date` / `start_date` are timestamptz stored at midnight
 * UTC, and "today" is the calendar date in the show's entry-window timezone.
 */

import { describe, it, expect } from 'vitest';
import { currentCalendarDate, isDayOfShowEntry, utcCalendarDate } from '../isDayOfShowEntry';

const SHOW = {
  startDate: '2026-09-17T00:00:00+00:00',
  entryCloseDate: '2026-09-10T00:00:00+00:00',
  timeZone: 'America/New_York',
};

/** Noon in New York on the given calendar date, so no zone flips the day. */
function noonEastern(isoDate: string): Date {
  return new Date(`${isoDate}T16:00:00Z`);
}

describe('utcCalendarDate', () => {
  it('reads a midnight-UTC timestamptz as its UTC calendar date', () => {
    expect(utcCalendarDate('2026-09-10T00:00:00+00:00')).toBe('2026-09-10');
  });

  it('returns a bare YYYY-MM-DD unchanged rather than re-parsing it', () => {
    expect(utcCalendarDate('2026-09-10')).toBe('2026-09-10');
  });

  it('is undefined for absent or unparseable values', () => {
    expect(utcCalendarDate(undefined)).toBeUndefined();
    expect(utcCalendarDate(null)).toBeUndefined();
    expect(utcCalendarDate('')).toBeUndefined();
    expect(utcCalendarDate('not-a-date')).toBeUndefined();
    expect(utcCalendarDate('garbageT00:00:00Z')).toBeUndefined();
  });
});

describe('currentCalendarDate', () => {
  it('uses the named zone, not the browser zone', () => {
    // 03:00 UTC on the 18th is still the 17th in New York.
    expect(currentCalendarDate(new Date('2026-09-18T03:00:00Z'), 'America/New_York')).toBe(
      '2026-09-17'
    );
    expect(currentCalendarDate(new Date('2026-09-18T03:00:00Z'), 'UTC')).toBe('2026-09-18');
  });

  it('falls back to the browser calendar date for an invalid zone', () => {
    const now = new Date(2026, 8, 17, 12, 0, 0);
    expect(currentCalendarDate(now, 'Not/AZone')).toBe('2026-09-17');
  });
});

describe('isDayOfShowEntry', () => {
  it('is TRUE for the MYK9-642 reproduction: show day, entries closed a week ago', () => {
    expect(isDayOfShowEntry({ ...SHOW, now: noonEastern('2026-09-17') })).toBe(true);
  });

  it('is FALSE while entries are still open and the show has not started', () => {
    expect(isDayOfShowEntry({ ...SHOW, now: noonEastern('2026-09-01') })).toBe(false);
  });

  it('is FALSE on the entry-close date itself — entries are still open that day', () => {
    expect(isDayOfShowEntry({ ...SHOW, now: noonEastern('2026-09-10') })).toBe(false);
  });

  it('is TRUE the day after entry close, days before the show starts', () => {
    expect(isDayOfShowEntry({ ...SHOW, now: noonEastern('2026-09-11') })).toBe(true);
  });

  it('is TRUE from the show start date when no entry-close date is configured', () => {
    const noClose = { startDate: SHOW.startDate, timeZone: SHOW.timeZone };
    expect(isDayOfShowEntry({ ...noClose, now: noonEastern('2026-09-16') })).toBe(false);
    expect(isDayOfShowEntry({ ...noClose, now: noonEastern('2026-09-17') })).toBe(true);
  });

  it('is FALSE when neither date is known — never guess a registry bucket', () => {
    expect(isDayOfShowEntry({ now: noonEastern('2026-09-17') })).toBe(false);
  });

  it('uses the show timezone for the boundary, not the machine timezone', () => {
    // 02:00 UTC on 2026-09-11 is still 2026-09-10 in New York: entries are open.
    const justBeforeMidnightEastern = new Date('2026-09-11T02:00:00Z');
    expect(isDayOfShowEntry({ ...SHOW, now: justBeforeMidnightEastern })).toBe(false);
    expect(isDayOfShowEntry({ ...SHOW, timeZone: 'UTC', now: justBeforeMidnightEastern })).toBe(
      true
    );
  });
});

describe('isDayOfShowEntry — the show zone, not the fallback (MYK9-642 round 1, J-F1)', () => {
  // Live show `dededede-0000-0000-0000-000000000011`, "Heartland UKC Nosework
  // Trial": start_date 2026-11-07T00:00:00+00, entry_close_date
  // 2026-12-01T00:00:00+00, first trial timezone America/Chicago, $30 / $35.
  const HEARTLAND = {
    startDate: '2026-11-07T00:00:00+00:00',
    entryCloseDate: '2026-12-01T00:00:00+00:00',
  };
  // 23:30 CT on Nov 6 — the show has not started in its own zone, but it has in
  // America/New_York.
  const LATE_EVENING_BEFORE = new Date('2026-11-07T05:30:00Z');

  it("agrees with the server when fed the show's own zone", () => {
    // Postgres, same instant and columns:
    //   (… at time zone 'America/Chicago')::date               = 2026-11-06
    //   (start_date at time zone 'UTC')::date                  = 2026-11-07
    //   2026-11-06 > 2026-12-01 OR 2026-11-06 >= 2026-11-07    = false
    expect(
      isDayOfShowEntry({
        ...HEARTLAND,
        timeZone: 'America/Chicago',
        now: LATE_EVENING_BEFORE,
      })
    ).toBe(false);
  });

  it('disagrees with the server when fed the America/New_York fallback — the bug', () => {
    // This is what every caller got while the zone came from `show.trials`,
    // which the show store never populates. Postgres for the same instant in
    // America/New_York answers true, so the two rules split.
    expect(
      isDayOfShowEntry({
        ...HEARTLAND,
        timeZone: 'America/New_York',
        now: LATE_EVENING_BEFORE,
      })
    ).toBe(true);
  });
});
