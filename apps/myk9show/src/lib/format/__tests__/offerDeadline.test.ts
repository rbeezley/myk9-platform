import { describe, expect, it } from 'vitest';
import { formatOfferDeadline, formatOfferWindow, resolveOfferWindowHours } from '../offerDeadline';

// Intl separates the time from AM/PM with a narrow no-break space; compare as a person reads it.
const plain = (s: string | null) => s?.replace(/\s+/g, ' ') ?? null;

describe('formatOfferDeadline', () => {
  it('renders weekday, date, time and zone in the trial zone (known answers)', () => {
    const at = '2026-07-15T18:00:00Z';
    expect(plain(formatOfferDeadline(at, 'America/New_York'))).toBe('Wed, Jul 15, 2:00 PM EDT');
    expect(plain(formatOfferDeadline(at, 'America/Chicago'))).toBe('Wed, Jul 15, 1:00 PM CDT');
    expect(plain(formatOfferDeadline(at, 'America/Phoenix'))).toBe('Wed, Jul 15, 11:00 AM MST');
  });

  it('falls back to New York for a missing zone, like the server copy', () => {
    expect(plain(formatOfferDeadline('2026-01-15T18:00:00Z', null))).toBe(
      'Thu, Jan 15, 1:00 PM EST'
    );
  });

  it('returns null for a missing or invalid instant', () => {
    expect(formatOfferDeadline(null, 'America/Chicago')).toBeNull();
    expect(formatOfferDeadline('not a date', 'America/Chicago')).toBeNull();
  });
});

describe('resolveOfferWindowHours', () => {
  it("mirrors promote_waitlist_entry_internal's GREATEST(1, COALESCE(hours, 48))", () => {
    expect(resolveOfferWindowHours(null)).toBe(48);
    expect(resolveOfferWindowHours(undefined)).toBe(48);
    expect(resolveOfferWindowHours(0)).toBe(1);
    expect(resolveOfferWindowHours(-5)).toBe(1);
    expect(resolveOfferWindowHours(24)).toBe(24);
  });
});

describe('formatOfferWindow', () => {
  it('says hour or hours', () => {
    expect(formatOfferWindow(1)).toBe('1 hour');
    expect(formatOfferWindow(48)).toBe('48 hours');
  });
});
