/**
 * MYK9-1931: the client quote and the server price are one rule. The pricing matrix lives
 * once, in supabase/tests/myk9_1931_class_fee_wins_test.sql between `-- BEGIN SHARED CASES`
 * and `-- END SHARED CASES`, where CI runs every row through `private.price_entry_fee`.
 * This test runs the same rows through `getShowEntryFee`, so a change to either side that
 * the other does not make fails here or there.
 */
import { describe, expect, it } from 'vitest';
import { getShowEntryFee, type ShowFeeInfo } from '../utils';
import { readClassFeeSharedCases, type ClassFeeCase } from '@/test/utils/classFeeSharedCases';

/** The show as the wizard reads it: fee columns as strings, a NULL as blank or absent. */
function showFor(row: ClassFeeCase): ShowFeeInfo {
  return {
    preEntryFee: row.pre === null ? '' : String(row.pre),
    dayOfShowFee: row.dos === null ? undefined : String(row.dos),
    juniorHandlerFee: row.junior === null ? undefined : String(row.junior),
    startDate: '2026-12-01',
  };
}

const cases = readClassFeeSharedCases();

describe('getShowEntryFee agrees with private.price_entry_fee (MYK9-1931 shared cases)', () => {
  it('reads the whole matrix', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases.map(row => [row.label, row] as const))('%s', (_label, row) => {
    expect(
      getShowEntryFee(showFor(row), row.classFee ?? undefined, row.dayOf, row.juniorOverride)
    ).toBe(row.expected);
  });
});
