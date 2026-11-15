/**
 * MYK9-1931, owner rule "zero is never a price": stripe-checkout and stripe-payment-link
 * refuse a $0 line before any Stripe checkout session is made or looked up. Both are
 * `Deno.serve` modules vitest cannot run; the rule itself is unit-tested in
 * `supabase/functions/_shared/cartItemPricing.unpriced.test.ts`, and its wiring is
 * pinned here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Whitespace is dropped from the source and from every anchor, so formatting cannot move a pin.
const squash = (text: string) => text.replace(/\s+/g, '');
const read = (fn: string) =>
  squash(readFileSync(resolve(__dirname, `../../../supabase/functions/${fn}/index.ts`), 'utf8'));

const REFUSAL = squash(
  'return corsResponse( corsHeaders, { error: NO_ENTRY_FEE_MESSAGE, code: NO_ENTRY_FEE_CODE }, 409 );'
);

describe('a $0 line is refused before Stripe is called', () => {
  it('stripe-checkout refuses after pricing, before healing and session creation', () => {
    const source = read('stripe-checkout');
    const pricedAt = source.indexOf(squash('const authoritativeByItem = priceCartItems('));
    const refusedAt = source.indexOf(squash('const unpricedLines = findUnpricedLines('));
    expect(pricedAt).toBeGreaterThan(-1);
    expect(refusedAt).toBeGreaterThan(pricedAt);
    expect(source.indexOf(REFUSAL, refusedAt)).toBeGreaterThan(refusedAt);
    expect(source.indexOf(squash('findDriftedCartItems(pricingItems'), refusedAt)).toBeGreaterThan(
      refusedAt
    );
    expect(source.indexOf(squash('stripe.checkout.sessions.create('))).toBeGreaterThan(refusedAt);
  });

  it('stripe-payment-link refuses after pricing, before any session is read or made', () => {
    const source = read('stripe-payment-link');
    const pricedAt = source.indexOf(squash('const linkEntries = entries.map('));
    const refusedAt = source.indexOf(squash('const unpricedEntries = findUnpricedLines('));
    expect(pricedAt).toBeGreaterThan(-1);
    expect(refusedAt).toBeGreaterThan(pricedAt);
    expect(source.indexOf(REFUSAL, refusedAt)).toBeGreaterThan(refusedAt);
    expect(source.indexOf(squash('stripe.checkout.sessions.retrieve('))).toBeGreaterThan(refusedAt);
    expect(source.indexOf(squash('stripe.checkout.sessions.create('))).toBeGreaterThan(refusedAt);
  });
});
