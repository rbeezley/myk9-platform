// @vitest-environment node
/**
 * MYK9-1931, owner rule "zero is never a price": a cart line or payment-link entry whose
 * authoritative fee is $0 (no show fee, no fee of the class's own, no day-of tier) cannot
 * be bought online. `findUnpricedLines` is what stripe-checkout and stripe-payment-link
 * test before Stripe is called (wiring: src/test/database/stripeNoEntryFeeRefusal.source.test.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  findUnpricedLines,
  NO_ENTRY_FEE_MESSAGE,
  priceCartItems,
  type CartItemForPricing,
  type PricingShow,
} from './cartItemPricing';

const NOW = '2026-11-20T17:00:00Z';
const noFeeShow: PricingShow = {
  pre_entry_fee: null,
  day_of_show_fee: null,
  start_date: '2026-12-01',
  junior_handler_fee: null,
  timezone: 'America/New_York',
};
const line = (id: string, classFee: number | null): CartItemForPricing => ({
  id,
  dog_id: 'dog-1',
  class_id: `class-${id}`,
  entry_id: null,
  junior_fee_declared: false,
  class_entry_fee: classFee,
});

describe('a $0 line cannot be bought online', () => {
  it('names every line with no show fee and no class fee of its own', () => {
    const items = [line('a', null), line('b', 40), line('c', 0)];
    const priced = priceCartItems(noFeeShow, items, new Map(), NOW);
    expect(priced.get('a')).toBe(0);
    expect(priced.get('c')).toBe(0);
    expect(
      findUnpricedLines(
        items.map(i => i.id),
        priced
      )
    ).toEqual(['a', 'c']);
  });

  it('passes a cart whose every line has a fee', () => {
    const items = [line('a', 40), line('b', 25)];
    const priced = priceCartItems(noFeeShow, items, new Map(), NOW);
    expect(
      findUnpricedLines(
        items.map(i => i.id),
        priced
      )
    ).toEqual([]);
  });

  it('treats a line missing from the price map as unpriced', () => {
    expect(findUnpricedLines(['x'], new Map())).toEqual(['x']);
  });

  it('says so in plain words', () => {
    expect(NO_ENTRY_FEE_MESSAGE).toBe(
      "This class has no entry fee set yet. Ask the show's secretary."
    );
  });
});
