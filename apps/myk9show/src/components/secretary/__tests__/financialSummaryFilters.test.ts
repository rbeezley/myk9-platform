import { describe, expect, it } from 'vitest';
import type { TrialFinancialEntryRow } from '../financialSummaryTypes';
import { filterFinancialEntries } from '../financialSummaryFilters';

function row(
  patch: Partial<TrialFinancialEntryRow> & Pick<TrialFinancialEntryRow, 'id'>
): TrialFinancialEntryRow {
  return {
    entryStatus: 'confirmed',
    movedFromEntryId: null,
    handler: 'Jane Handler',
    dogName: 'Acorn',
    ownerName: 'Jane Handler',
    className: 'Interior Novice A',
    entryFee: 35,
    discountAmount: 0,
    promoCode: null,
    paymentStatus: 'paid',
    comped: false,
    compedReason: null,
    ...patch,
  };
}

const entries: TrialFinancialEntryRow[] = [
  row({ id: 'a', dogName: 'Acorn', paymentStatus: 'paid' }),
  row({ id: 'b', dogName: 'Birch', paymentStatus: 'pending' }),
  row({ id: 'c', dogName: 'Cedar', paymentStatus: 'refunded' }),
  row({ id: 'd', dogName: 'Dahlia', paymentStatus: 'paid', comped: true }),
];

describe('filterFinancialEntries', () => {
  it('with no search and no status, returns every row', () => {
    expect(filterFinancialEntries(entries, '', null)).toHaveLength(4);
  });

  it('searches case-insensitively across dog, owner, handler and class', () => {
    expect(filterFinancialEntries(entries, 'acorn', null).map(e => e.id)).toEqual(['a']);
    expect(filterFinancialEntries(entries, 'INTERIOR', null)).toHaveLength(4);
  });

  it('filters by payment status, excluding comped rows even if their raw status matches', () => {
    const paid = filterFinancialEntries(entries, '', 'paid');
    expect(paid.map(e => e.id)).toEqual(['a']);
  });

  it('"comped" is its own bucket, not a paymentStatus value', () => {
    const comped = filterFinancialEntries(entries, '', 'comped');
    expect(comped.map(e => e.id)).toEqual(['d']);
  });

  it('combines search and status', () => {
    expect(filterFinancialEntries(entries, 'birch', 'pending').map(e => e.id)).toEqual(['b']);
    expect(filterFinancialEntries(entries, 'birch', 'paid')).toHaveLength(0);
  });
});
