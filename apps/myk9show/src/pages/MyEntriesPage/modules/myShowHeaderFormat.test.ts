import { describe, it, expect } from 'vitest';
import { formatDogNamesPossessive, formatShowHeaderDateRange } from './myShowHeaderFormat';

/** Local midnight, the shape `parseShowDate` produces for a DATE column. */
function day(iso: string): Date {
  const [year, month, date] = iso.split('-').map(Number);
  return new Date(year, month - 1, date);
}

describe('formatShowHeaderDateRange', () => {
  it('renders a single day with its weekday', () => {
    expect(formatShowHeaderDateRange(day('2026-10-24'))).toBe('Sat, Oct 24');
  });

  it('collapses a same-month range', () => {
    expect(formatShowHeaderDateRange(day('2026-10-24'), day('2026-10-25'))).toBe(
      'Sat–Sun, Oct 24–25'
    );
  });

  it('spells both months when the range crosses a month boundary', () => {
    expect(formatShowHeaderDateRange(day('2026-10-31'), day('2026-11-01'))).toBe(
      'Sat, Oct 31 – Sun, Nov 1'
    );
  });

  it('treats an end date equal to the start as one day', () => {
    expect(formatShowHeaderDateRange(day('2026-10-24'), day('2026-10-24'))).toBe('Sat, Oct 24');
  });

  it('never prints a backwards range', () => {
    expect(formatShowHeaderDateRange(day('2026-10-25'), day('2026-10-24'))).toBe('Sun, Oct 25');
  });

  it('reads the calendar day from the local getters, not a UTC re-parse', () => {
    // 2026-01-01 local midnight is 2025-12-31 in UTC west of Greenwich. A
    // formatter that round-tripped through UTC would print Dec 31 here.
    expect(formatShowHeaderDateRange(day('2026-01-01'))).toMatch(/Jan 1$/);
  });

  it('returns an empty string for a missing or unparseable date', () => {
    expect(formatShowHeaderDateRange(undefined)).toBe('');
    expect(formatShowHeaderDateRange(new Date('not a date'))).toBe('');
  });
});

describe('formatDogNamesPossessive', () => {
  it('makes one name possessive', () => {
    expect(formatDogNamesPossessive(['Scout'])).toBe("Scout's");
  });

  it('joins two names with "and"', () => {
    expect(formatDogNamesPossessive(['Scout', 'Juni'])).toBe("Scout and Juni's");
  });

  it('comma-joins three or more', () => {
    expect(formatDogNamesPossessive(['Scout', 'Juni', 'Willow'])).toBe("Scout, Juni and Willow's");
  });

  it('returns an empty string when there is nothing to name', () => {
    expect(formatDogNamesPossessive([])).toBe('');
    expect(formatDogNamesPossessive(['  '])).toBe('');
  });
});
