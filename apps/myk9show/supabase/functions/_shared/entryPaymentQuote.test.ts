import { describe, expect, it } from 'vitest';
import { normalizeEntryPaymentQuote } from './entryPaymentQuote';

describe('normalizeEntryPaymentQuote', () => {
  const quote = {
    money_root_entry_id: 'root-entry',
    live_entry_id: 'live-entry',
    show_id: 'show-1',
    dog_id: 'dog-1',
    entry_fee_cents: 3_500,
  };

  it('keeps a moved money-root source while using SQL returned live identity and root price', () => {
    expect(normalizeEntryPaymentQuote([quote], 'root-entry', 'show-1', 'dog-1')).toEqual({
      sourceEntryId: 'root-entry',
      moneyRootEntryId: 'root-entry',
      liveEntryId: 'live-entry',
      showId: 'show-1',
      dogId: 'dog-1',
      entryFeeCents: 3_500,
    });
  });

  it('accepts a live-entry source without changing the settlement source id', () => {
    expect(normalizeEntryPaymentQuote(quote, 'live-entry', 'show-1', 'dog-1')).toMatchObject({
      sourceEntryId: 'live-entry',
      moneyRootEntryId: 'root-entry',
      liveEntryId: 'live-entry',
      entryFeeCents: 3_500,
    });
  });

  it('rejects a quote for another dog, show, or invalid amount', () => {
    expect(normalizeEntryPaymentQuote(quote, 'root-entry', 'other-show', 'dog-1')).toBeNull();
    expect(normalizeEntryPaymentQuote(quote, 'root-entry', 'show-1', 'other-dog')).toBeNull();
    expect(
      normalizeEntryPaymentQuote({ ...quote, entry_fee_cents: -1 }, 'root-entry', 'show-1', 'dog-1')
    ).toBeNull();
  });
});
