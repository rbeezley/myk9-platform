import { describe, expect, it } from 'vitest';
import { msUntilEntryDayBoundary } from '../entryOpenBoundary';

const tz = 'America/Chicago';
const HOUR = 60 * 60 * 1000;
const near = (actual: number | null, expected: number) =>
  expect(actual !== null && Math.abs(actual - expected) <= 1000).toBe(true);

describe('msUntilEntryDayBoundary', () => {
  it('waits for the next trial-local midnight before the window opens', () => {
    // 21:00 Chicago on Nov 17 (CST, UTC-6): midnight is 3 hours away.
    near(
      msUntilEntryDayBoundary('2026-11-20', '2027-01-10', tz, new Date('2026-11-18T03:00:00Z')),
      3 * HOUR
    );
  });

  it('keeps waking through the open window, for the closing countdown', () => {
    near(
      msUntilEntryDayBoundary('2026-11-01', '2027-01-10', tz, new Date('2026-12-02T03:00:00Z')),
      3 * HOUR
    );
  });

  it('keeps waking on the close day itself and stops the day after', () => {
    expect(
      msUntilEntryDayBoundary('2026-11-01', '2026-12-01', tz, new Date('2026-12-02T03:00:00Z'))
    ).not.toBeNull(); // Dec 1 21:00 in Chicago: the close day, midnight ends it
    expect(
      msUntilEntryDayBoundary('2026-11-01', '2026-12-01', tz, new Date('2026-12-02T07:00:00Z'))
    ).toBeNull(); // Dec 2 01:00 in Chicago: the day after
  });

  it('uses the calendar day of a timestamp, not its instant', () => {
    // Opens "2026-11-20T15:30:00+00:00" = Nov 20 by getEntryStatus (toLocalDate), i.e. local
    // midnight, not 09:30 Chicago. From 21:00 Nov 17 the next wake is still local midnight.
    near(
      msUntilEntryDayBoundary(
        '2026-11-20T15:30:00+00:00',
        '2027-01-10T00:00:00+00:00',
        tz,
        new Date('2026-11-18T03:00:00Z')
      ),
      3 * HOUR
    );
  });

  it('never exceeds a day plus the DST slack, so one timeout stays within the timer limit', () => {
    const wait = msUntilEntryDayBoundary(
      '2030-01-01',
      '2030-02-01',
      tz,
      new Date('2026-11-18T12:00:00Z')
    );
    expect(wait).not.toBeNull();
    expect(wait!).toBeLessThanOrEqual(26 * HOUR);
  });

  it('is null without a full window or with unparseable dates', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    expect(msUntilEntryDayBoundary(null, '2027-01-10', tz, now)).toBeNull();
    expect(msUntilEntryDayBoundary('2026-11-20', undefined, tz, now)).toBeNull();
    expect(msUntilEntryDayBoundary('not a date', '2027-01-10', tz, now)).toBeNull();
  });
});
