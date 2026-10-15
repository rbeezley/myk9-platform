import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Source-level contract for exhibitor-closed-show-server-guard (online path).
 *
 * stripe-checkout already failed closed after entries closed, but it compared
 * `Date.now()` against `new Date(entry_close_date).getTime()`. entry_close_date
 * is a timestamptz stored as midnight UTC of the typed calendar date, so that
 * instant compare closed online entry ~a day early for shows west of UTC (e.g.
 * 8pm ET the evening before an Eastern show's stated close date), disagreeing
 * with the client cart gate. This pins the timezone-anchored calendar-day fix.
 */
const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-checkout/index.ts'),
  'utf8'
);

describe('stripe-checkout entry-window gate', () => {
  it('no longer closes on a raw UTC-instant compare of entry_close_date', () => {
    expect(source).not.toContain('new Date(showFees.entry_close_date).getTime()');
    expect(source).not.toContain('new Date(showFees.entry_open_date).getTime()');
  });

  it('compares calendar days in the show timezone', () => {
    // The formatter lives in _shared/showTimeZone.ts (MYK9-1198), where
    // authoritativeFee.showZone.test.ts runs it.
    expect(source).toContain('calendarDateInTimeZone(new Date(), showTz)');
    // "now" is the local date; the deadline is the date read in UTC
    expect(source).toContain('const todayLocal =');
    expect(source).toContain("'UTC'");
    expect(source).toContain('todayLocal > closeDay');
    expect(source).toContain('todayLocal < openDay');
  });

  it('resolves the show timezone from the primary trial with a default', () => {
    // MYK9-1198: read with the show, chosen by the submit_show_entries rule
    // (first by date, undated last, then id; America/New_York fallback), which
    // showTimeZoneFromTrials implements and authoritativeFee.showZone.test.ts runs.
    expect(source).toContain('trials(id, date, timezone)');
    expect(source).toContain('const showTz = showTimeZoneFromTrials(');
  });

  it('still fails closed with 403 when the window is closed', () => {
    expect(source).toContain('Online entry has closed for this show.');
    expect(source).toContain('Online entry has not opened yet for this show.');
  });
});
