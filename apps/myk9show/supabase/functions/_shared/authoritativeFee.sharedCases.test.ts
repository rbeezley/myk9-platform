// @vitest-environment node
/**
 * MYK9-1931: checkout's price (`authoritativeEntryFeeCents`, which stripe-checkout, the
 * webhook and payment links charge) runs the same pricing matrix CI runs through
 * `private.price_entry_fee` (supabase/tests/myk9_1931_class_fee_wins_test.sql, the
 * `-- BEGIN/END SHARED CASES` block) and the client runs through `getShowEntryFee`.
 * Every row, with no exception: one rule in all three runners.
 */
import { describe, expect, it } from 'vitest';
import { authoritativeEntryFeeCents } from './authoritativeFee';
import { readClassFeeSharedCases, type ClassFeeCase } from '@/test/utils/classFeeSharedCases';

const START = '2026-12-01';
const BEFORE_THE_SHOW = '2026-11-20T17:00:00Z';
const ON_SHOW_DAY = '2026-12-01T17:00:00Z';

const cents = (row: ClassFeeCase) =>
  authoritativeEntryFeeCents({
    showPreEntryFee: row.pre,
    showDayOfShowFee: row.dos,
    showStartDate: START,
    classEntryFee: row.classFee,
    showJuniorHandlerFee: row.junior,
    juniorDeclared: row.juniorOverride,
    showOrganization: 'AKC',
    showTimeZone: 'America/New_York',
    nowIso: row.dayOf ? ON_SHOW_DAY : BEFORE_THE_SHOW,
  });

const cases = readClassFeeSharedCases();

describe('authoritativeEntryFeeCents agrees with private.price_entry_fee (MYK9-1931)', () => {
  it('reads the whole matrix', () => {
    expect(cases.length).toBeGreaterThanOrEqual(24);
  });

  it.each(cases.map(row => [row.label, row] as const))('%s', (_label, row) => {
    expect(cents(row)).toBe(Math.round(row.expected * 100));
  });
});
