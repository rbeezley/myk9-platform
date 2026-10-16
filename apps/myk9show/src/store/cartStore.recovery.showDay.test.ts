/**
 * MYK9-1198 (owner decision 2026-10-15): "show day" for the fee tier is the
 * calendar day in the SHOW's time zone (its first trial's zone, falling back to
 * America/New_York), the same for every exhibitor whatever their device zone.
 *
 * The device here is in Los Angeles and the show is in New York, starting
 * 2026-11-10:
 *   - 03:30Z = Nov 9 22:30 in New York, Nov 9 19:30 in LA (but Nov 10 in UTC):
 *     the pre-entry fee applies.
 *   - 05:30Z = Nov 10 00:30 in New York, still Nov 9 in LA: the day-of fee
 *     applies.
 * A UTC rule fails the first; a device-local rule fails the second.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tables = vi.hoisted(() => ({
  entries: [] as unknown[],
  selectedEntryColumns: '' as string,
}));

vi.mock('@/lib/supabase', () => {
  const make = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['eq', 'or', 'in', 'is']) builder[method] = () => builder;
    builder.select = (columns: string) => {
      if (table === 'entries') tables.selectedEntryColumns = columns;
      return builder;
    };
    builder.maybeSingle = () => Promise.resolve({ data: { person_id: 'person-1' }, error: null });
    builder.then = (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) =>
      Promise.resolve({
        data: table === 'dogs' ? [{ id: 'dog-1' }] : tables.entries,
        error: null,
      }).then(resolve, reject);
    return builder;
  };
  return { supabase: { from: make } };
});
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  findRecoverableEntries,
  getAuthoritativeEntryFeeCents,
  type RecoverableEntryRow,
} from './cartStore.recovery';

const originalTz = process.env.TZ;

/** A Los Angeles device for each test, restored after so no other file sees it. */
function useLosAngelesDevice() {
  beforeEach(() => {
    process.env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });
}

const EVENING_BEFORE_IN_NEW_YORK = '2026-11-10T03:30:00Z';
const JUST_AFTER_MIDNIGHT_IN_NEW_YORK = '2026-11-10T05:30:00Z';

/** A row with no frozen fee, so the tiers decide (the fallback this fixes). */
function row(overrides: Partial<RecoverableEntryRow> = {}): RecoverableEntryRow {
  return {
    id: 'entry-1',
    class_id: 'class-1',
    dog_id: 'dog-1',
    handler_id: null,
    entry_fee: null,
    jump_height: null,
    special_requests: null,
    class_entry_fee: 28,
    show_pre_entry_fee: 25,
    show_day_of_show_fee: 35,
    show_start_date: '2026-11-10T00:00:00+00:00',
    show_timezone: 'America/New_York',
    ...overrides,
  };
}

describe('the day-of fee switches at midnight in the show zone', () => {
  useLosAngelesDevice();

  it('runs on a Los Angeles device', () => {
    expect(new Date(EVENING_BEFORE_IN_NEW_YORK).getTimezoneOffset()).toBe(480);
  });

  it('quotes the pre-entry fee the evening before in New York (already Nov 10 in UTC)', () => {
    vi.setSystemTime(new Date(EVENING_BEFORE_IN_NEW_YORK));
    expect(getAuthoritativeEntryFeeCents(row())).toBe(2500);
  });

  it('quotes the day-of fee after midnight in New York (still Nov 9 on the device)', () => {
    vi.setSystemTime(new Date(JUST_AFTER_MIDNIGHT_IN_NEW_YORK));
    expect(getAuthoritativeEntryFeeCents(row())).toBe(3500);
  });

  it('falls back to America/New_York when the show has no zone', () => {
    vi.setSystemTime(new Date(EVENING_BEFORE_IN_NEW_YORK));
    expect(getAuthoritativeEntryFeeCents(row({ show_timezone: null }))).toBe(2500);
    vi.setSystemTime(new Date(JUST_AFTER_MIDNIGHT_IN_NEW_YORK));
    expect(getAuthoritativeEntryFeeCents(row({ show_timezone: null }))).toBe(3500);
  });

  it('a Pacific show is still before its day when New York has crossed midnight', () => {
    vi.setSystemTime(new Date(JUST_AFTER_MIDNIGHT_IN_NEW_YORK));
    expect(getAuthoritativeEntryFeeCents(row({ show_timezone: 'America/Los_Angeles' }))).toBe(2500);
  });

  it('never re-prices a frozen entry fee', () => {
    vi.setSystemTime(new Date(JUST_AFTER_MIDNIGHT_IN_NEW_YORK));
    expect(getAuthoritativeEntryFeeCents(row({ entry_fee: 25 }))).toBe(2500);
    vi.setSystemTime(new Date(EVENING_BEFORE_IN_NEW_YORK));
    expect(getAuthoritativeEntryFeeCents(row({ entry_fee: 35 }))).toBe(3500);
  });
});

describe('findRecoverableEntries carries the show zone to the quote', () => {
  useLosAngelesDevice();
  beforeEach(() => {
    tables.selectedEntryColumns = '';
  });

  const entryRow = (trials: unknown) => ({
    id: 'entry-1',
    class_id: 'class-1',
    dog_id: 'dog-1',
    handler_id: null,
    entry_fee: null,
    jump_height: null,
    special_requests: null,
    class: { entry_fee: 28 },
    show: {
      pre_entry_fee: 25,
      day_of_show_fee: 35,
      start_date: '2026-11-10T00:00:00+00:00',
      trials,
    },
  });

  const lookupFee = async () => {
    const lookup = await findRecoverableEntries({
      showId: 'show-1',
      exhibitorId: 'exhibitor-1',
      entryIds: ['entry-1'],
    });
    if (!lookup.ok) throw new Error('lookup failed');
    expect(lookup.value).toHaveLength(1);
    return getAuthoritativeEntryFeeCents(lookup.value[0]);
  };

  it("reads the first trial's zone (earliest date, undated last) as the show zone", async () => {
    tables.entries = [
      entryRow([
        { id: 't-undated', date: null, timezone: 'Pacific/Honolulu' },
        { id: 't-2', date: '2026-11-11', timezone: 'America/Los_Angeles' },
        { id: 't-1', date: '2026-11-10', timezone: 'America/New_York' },
      ]),
    ];
    vi.setSystemTime(new Date(EVENING_BEFORE_IN_NEW_YORK));
    expect(await lookupFee()).toBe(2500);
    vi.setSystemTime(new Date(JUST_AFTER_MIDNIGHT_IN_NEW_YORK));
    expect(await lookupFee()).toBe(3500);
    expect(tables.selectedEntryColumns).toMatch(/trials\(id, date, timezone\)/);
  });

  it('a show with no trials uses America/New_York', async () => {
    tables.entries = [entryRow([])];
    vi.setSystemTime(new Date(EVENING_BEFORE_IN_NEW_YORK));
    expect(await lookupFee()).toBe(2500);
  });
});
