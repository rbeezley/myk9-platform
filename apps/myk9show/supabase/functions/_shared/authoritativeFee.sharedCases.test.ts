// @vitest-environment node
/**
 * MYK9-1931: checkout's price (`authoritativeEntryFeeCents`, which stripe-checkout, the
 * webhook and payment links charge) runs the same pricing matrix CI runs through
 * `private.price_entry_fee` (supabase/tests/myk9_1931_class_fee_wins_test.sql, the
 * `-- BEGIN/END SHARED CASES` block) and the client runs through `getShowEntryFee`.
 *
 * One known divergence is pinned, not hidden: on show day checkout charges a day-of fee of
 * 0 as $0 (MYK9-1198 kept that), where the server and client read 0 as "no day-of tier" and
 * charge the pre-entry fee. It affects only a class without its own fee.
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

/** The zero day-of fee rule checkout kept (authoritativeFee.showZone.test.ts). */
const zeroDayOfFeeAtCheckout = (row: ClassFeeCase) =>
  row.dayOf && row.dos === 0 && !(row.classFee !== null && row.classFee > 0);

const cases = readClassFeeSharedCases();

describe('authoritativeEntryFeeCents agrees with private.price_entry_fee (MYK9-1931)', () => {
  it('reads the whole matrix, with one known divergence', () => {
    expect(cases.length).toBeGreaterThanOrEqual(22);
    expect(cases.filter(zeroDayOfFeeAtCheckout).map(row => row.label)).toEqual([
      'day-of with a zero day-of fee and no class fee',
    ]);
  });

  it.each(cases.filter(row => !zeroDayOfFeeAtCheckout(row)).map(row => [row.label, row] as const))(
    '%s',
    (_label, row) => {
      expect(cents(row)).toBe(Math.round(row.expected * 100));
    }
  );

  it('charges a zero day-of fee as $0 on show day for a class without its own fee', () => {
    for (const row of cases.filter(zeroDayOfFeeAtCheckout)) expect(cents(row)).toBe(0);
  });
});
