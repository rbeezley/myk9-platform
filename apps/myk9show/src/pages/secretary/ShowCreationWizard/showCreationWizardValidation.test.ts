/**
 * F6 — choosing the show's own start date as the entry-close date (normal for a
 * day-of-entry show) always failed with "Entry close date must be on or before the
 * show start date".
 *
 * The comparison was already date-only, but it sliced the first 10 characters off an
 * ISO *UTC* string. The picker defaults the close time to 11:59 PM local and emits
 * `date.toISOString()`, so west of UTC that serialises to the NEXT calendar day:
 * "Aug 29 11:59 PM CDT" -> "2026-08-30T04:59:00.000Z" -> "2026-08-30". Compared
 * against a show start of 8:00 AM the same day, close > start and the rule fired.
 */
import { describe, expect, it } from 'vitest';
import { getShowDetailsValidationMessages } from './showCreationWizardValidation';

const CLOSE_RULE = 'Entry close date must be on or before the show start date';

// Local wall-clock times, serialised the way DateRangePicker does.
const localIso = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m - 1, d, h, min, 0).toISOString();

function baseShow(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Audit Show',
    organization: 'AKC',
    location: 'Somewhere',
    clubId: 'club-1',
    officials: { chairman: ['p1'], secretary: ['p2'] },
    startDate: localIso(2026, 8, 29, 8, 0),
    endDate: localIso(2026, 8, 30, 17, 0),
    entryOpenDate: localIso(2026, 8, 1, 8, 0),
    entryCloseDate: localIso(2026, 8, 29, 23, 59),
    ...overrides,
  } as Parameters<typeof getShowDetailsValidationMessages>[0];
}

describe('getShowDetailsValidationMessages — entry close vs show start', () => {
  it('accepts entries closing at 11:59 PM on the show start date (day-of entry)', () => {
    expect(getShowDetailsValidationMessages(baseShow())).not.toContain(CLOSE_RULE);
  });

  it('still rejects an entry close after the show start date', () => {
    const show = baseShow({ entryCloseDate: localIso(2026, 8, 30, 9, 0) });
    expect(getShowDetailsValidationMessages(show)).toContain(CLOSE_RULE);
  });

  it('accepts an entry close comfortably before the show', () => {
    const show = baseShow({ entryCloseDate: localIso(2026, 8, 20, 23, 59) });
    expect(getShowDetailsValidationMessages(show)).not.toContain(CLOSE_RULE);
  });

  it('still rejects an entry close before the entry open date', () => {
    const show = baseShow({
      entryOpenDate: localIso(2026, 8, 20, 8, 0),
      entryCloseDate: localIso(2026, 8, 10, 23, 59),
    });
    expect(getShowDetailsValidationMessages(show)).toContain(
      'Entry close date must be on or after entry open date'
    );
  });

  it('still rejects an end date before the start date', () => {
    // 9:00 AM, deliberately NOT 5:00 PM: in America/Los_Angeles 5:00 PM local is
    // exactly UTC midnight, which collides with the known limitation pinned below.
    const show = baseShow({ endDate: localIso(2026, 8, 28, 9, 0) });
    expect(getShowDetailsValidationMessages(show)).toContain(
      'End date must be on or after start date'
    );
  });

  it('KNOWN LIMITATION (F35): a local time that is exactly UTC midnight reads as the next day', () => {
    // toLocalDateOnly short-circuits any ISO string ending T00:00:00Z to its literal
    // date part, because a DATE column round-trips that way and local getters would
    // misread it as the previous day. A genuine local timestamp that happens to land
    // on UTC midnight -- 5:00 PM PDT, 7:00 PM EST, a perfectly ordinary show end
    // time -- is indistinguishable from that, so it resolves one day late.
    //
    // This is PRE-EXISTING and not a regression: the old slice(0, 10) produced the
    // same answer for the same input (verified). Pinned here so the limitation is
    // visible rather than folded into an unrelated assertion. Fixing it needs the
    // wizard to carry date-only values instead of ISO datetimes.
    const utcMidnightLocal = new Date(Date.UTC(2026, 7, 29, 0, 0, 0)).toISOString();
    const offsetMinutes = new Date(2026, 7, 28).getTimezoneOffset();
    const show = baseShow({ endDate: utcMidnightLocal });
    const messages = getShowDetailsValidationMessages(show);
    if (offsetMinutes > 0) {
      // West of UTC: the local calendar day is Aug 28, so end-before-start SHOULD
      // fire; it does not, because the value is read as Aug 29.
      expect(messages).not.toContain('End date must be on or after start date');
    } else {
      expect(messages).not.toContain('End date must be on or after start date');
    }
  });
});
