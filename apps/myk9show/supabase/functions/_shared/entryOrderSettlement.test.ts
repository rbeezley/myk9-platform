import { describe, expect, it } from 'vitest';
import { mapAcceptedEntryFees, normalizeEntryOrderSettlement } from './entryOrderSettlement';

describe('normalizeEntryOrderSettlement', () => {
  it('normalizes SQL outcomes while preserving SQL-owned line and money-root ids', () => {
    expect(
      normalizeEntryOrderSettlement([
        {
          order_id: 'order-1',
          canonical_entry_ids: ['live-1'],
          line_results: [
            {
              lineId: 'cart-item-1',
              outcome: 'created_entry',
              entryId: 'live-1',
              moneyRootEntryId: 'root-1',
              waitlistEntryId: null,
            },
          ],
          expected_make_whole_refund_cents: 230,
        },
      ])
    ).toEqual({
      orderId: 'order-1',
      canonicalEntryIds: ['live-1'],
      lineResults: [
        {
          lineId: 'cart-item-1',
          outcome: 'accepted',
          entryId: 'live-1',
          moneyRootEntryId: 'root-1',
          waitlistEntryId: null,
        },
      ],
      expectedMakeWholeRefundCents: 230,
    });
  });

  it('rejects malformed or incomplete SQL outcomes', () => {
    expect(normalizeEntryOrderSettlement({ order_id: 'order-1' })).toBeNull();
    expect(
      normalizeEntryOrderSettlement({
        order_id: 'order-1',
        canonical_entry_ids: ['live-1'],
        line_results: [{ lineId: 'item-1', outcome: 'waived' }],
        expected_make_whole_refund_cents: 0,
      })
    ).toBeNull();
  });
});

describe('mapAcceptedEntryFees', () => {
  it('uses verified root-priced lines for SQL-selected live entries', () => {
    const fees = mapAcceptedEntryFees(
      [
        {
          lineId: 'cart-item-root',
          outcome: 'accepted',
          entryId: 'live-entry',
          moneyRootEntryId: 'root-entry',
          waitlistEntryId: null,
        },
      ],
      [{ lineId: 'cart-item-root', priceCents: 3500 }]
    );

    expect(fees.get('live-entry')).toBe(3500);
  });
});
