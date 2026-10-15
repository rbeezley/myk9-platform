// @vitest-environment node
/**
 * MYK9-1198 (owner decision 2026-10-15): the day-of fee switches at midnight in
 * the SHOW's time zone, for every exhibitor and every server clock.
 *
 * The process runs in Los Angeles and the show is in New York, starting
 * 2026-11-10:
 *   - 03:30Z = Nov 9 22:30 in New York (already Nov 10 in UTC): pre-entry fee.
 *   - 05:30Z = Nov 10 00:30 in New York (still Nov 9 in LA): day-of fee.
 * A UTC rule fails the first; a process-local rule fails the second.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authoritativeEntryFeeCents } from './authoritativeFee';
import { priceCartItems, priceExistingEntryCents, type PricingShow } from './cartItemPricing';
import { showTimeZoneFromTrials } from './showTimeZone';

const EVENING_BEFORE_IN_NEW_YORK = '2026-11-10T03:30:00Z';
const JUST_AFTER_MIDNIGHT_IN_NEW_YORK = '2026-11-10T05:30:00Z';

const originalTz = process.env.TZ;
beforeEach(() => {
  process.env.TZ = 'America/Los_Angeles';
});
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const fees = {
  showPreEntryFee: 25,
  showDayOfShowFee: 35,
  showStartDate: '2026-11-10T00:00:00+00:00',
  classEntryFee: 28,
};

describe('authoritativeEntryFeeCents decides show day in the show zone', () => {
  it('runs in a Los Angeles process', () => {
    expect(new Date(EVENING_BEFORE_IN_NEW_YORK).getTimezoneOffset()).toBe(480);
  });

  it('charges the pre-entry fee the evening before in New York', () => {
    expect(
      authoritativeEntryFeeCents({
        ...fees,
        showTimeZone: 'America/New_York',
        nowIso: EVENING_BEFORE_IN_NEW_YORK,
      })
    ).toBe(2500);
  });

  it('charges the day-of fee after midnight in New York', () => {
    expect(
      authoritativeEntryFeeCents({
        ...fees,
        showTimeZone: 'America/New_York',
        nowIso: JUST_AFTER_MIDNIGHT_IN_NEW_YORK,
      })
    ).toBe(3500);
  });

  it('falls back to America/New_York for a missing or invalid zone', () => {
    for (const showTimeZone of [undefined, null, '', 'Not/AZone']) {
      expect(
        authoritativeEntryFeeCents({ ...fees, showTimeZone, nowIso: EVENING_BEFORE_IN_NEW_YORK })
      ).toBe(2500);
      expect(
        authoritativeEntryFeeCents({
          ...fees,
          showTimeZone,
          nowIso: JUST_AFTER_MIDNIGHT_IN_NEW_YORK,
        })
      ).toBe(3500);
    }
  });

  it('a Pacific show is still before its day when New York has crossed midnight', () => {
    expect(
      authoritativeEntryFeeCents({
        ...fees,
        showTimeZone: 'America/Los_Angeles',
        nowIso: JUST_AFTER_MIDNIGHT_IN_NEW_YORK,
      })
    ).toBe(2500);
  });

  it('keeps the start-date-only rule and the zero day-of fee behaviour', () => {
    expect(
      authoritativeEntryFeeCents({
        ...fees,
        showDayOfShowFee: 0,
        showTimeZone: 'America/New_York',
        nowIso: JUST_AFTER_MIDNIGHT_IN_NEW_YORK,
      })
    ).toBe(0);
    expect(
      authoritativeEntryFeeCents({
        ...fees,
        showDayOfShowFee: null,
        showTimeZone: 'America/New_York',
        nowIso: JUST_AFTER_MIDNIGHT_IN_NEW_YORK,
      })
    ).toBe(2500);
  });
});

describe('cart pricing threads the show zone through', () => {
  const show: PricingShow = {
    pre_entry_fee: 25,
    day_of_show_fee: 35,
    start_date: '2026-11-10T00:00:00+00:00',
    junior_handler_fee: null,
    timezone: 'America/New_York',
  };
  const line = {
    id: 'item-1',
    dog_id: 'dog-1',
    class_id: 'class-1',
    entry_id: null,
    junior_fee_declared: false,
    class_entry_fee: 28,
  };

  it('priceCartItems prices a new line by the show-zone day', () => {
    const price = (nowIso: string) => priceCartItems(show, [line], new Map(), nowIso).get('item-1');
    expect(price(EVENING_BEFORE_IN_NEW_YORK)).toBe(2500);
    expect(price(JUST_AFTER_MIDNIGHT_IN_NEW_YORK)).toBe(3500);
    // A non-default zone reaches the rule: a Pacific show is still on Nov 9.
    const pacific = { ...show, timezone: 'America/Los_Angeles' };
    expect(
      priceCartItems(pacific, [line], new Map(), JUST_AFTER_MIDNIGHT_IN_NEW_YORK).get('item-1')
    ).toBe(2500);
  });

  it('priceExistingEntryCents prices an unfrozen entry by the show-zone day', () => {
    const entry = { junior_fee_declared: null, junior_fee_override_by: null, entry_fee: null };
    expect(priceExistingEntryCents(show, entry, 28, EVENING_BEFORE_IN_NEW_YORK)).toBe(2500);
    expect(priceExistingEntryCents(show, entry, 28, JUST_AFTER_MIDNIGHT_IN_NEW_YORK)).toBe(3500);
    const pacific = { ...show, timezone: 'America/Los_Angeles' };
    expect(priceExistingEntryCents(pacific, entry, 28, JUST_AFTER_MIDNIGHT_IN_NEW_YORK)).toBe(2500);
  });

  it('a frozen entry fee is never re-priced', () => {
    const entry = { junior_fee_declared: null, junior_fee_override_by: null, entry_fee: 25 };
    expect(priceExistingEntryCents(show, entry, 28, JUST_AFTER_MIDNIGHT_IN_NEW_YORK)).toBe(2500);
  });
});

describe('showTimeZoneFromTrials matches the submit_show_entries rule', () => {
  it('takes the earliest-dated trial, undated last, then the lowest id', () => {
    expect(
      showTimeZoneFromTrials([
        { id: 't-undated', date: null, timezone: 'Pacific/Honolulu' },
        { id: 't-2', date: '2026-11-11', timezone: 'America/Los_Angeles' },
        { id: 't-1b', date: '2026-11-10', timezone: 'America/Denver' },
        { id: 't-1a', date: '2026-11-10', timezone: 'America/Chicago' },
      ])
    ).toBe('America/Chicago');
  });

  it("uses America/New_York when there are no trials or the first trial's zone is unusable", () => {
    expect(showTimeZoneFromTrials([])).toBe('America/New_York');
    expect(showTimeZoneFromTrials(null)).toBe('America/New_York');
    expect(
      showTimeZoneFromTrials([
        { id: 't-1', date: '2026-11-10', timezone: null },
        { id: 't-2', date: '2026-11-11', timezone: 'America/Chicago' },
      ])
    ).toBe('America/New_York');
    expect(showTimeZoneFromTrials([{ id: 't-1', date: '2026-11-10', timezone: 'Bad/Zone' }])).toBe(
      'America/New_York'
    );
  });
});
