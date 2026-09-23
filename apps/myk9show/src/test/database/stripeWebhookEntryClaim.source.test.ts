import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The settlement RPC owns the cart latch and exact Stripe-session binding. These
 * source contracts keep the webhook as a facts/evidence adapter, not a second
 * mutable settlement authority.
 */
const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);
const settlement = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260923022007_myk9_639_authoritative_entry_settlement.sql'
  ),
  'utf8'
);

describe('stripe-webhook entry-payment cart claim', () => {
  it('passes the cart and freshly verified Stripe facts to the settlement RPC', () => {
    const start = source.indexOf('async function handleEntryPaymentCompleted');
    const end = source.indexOf('async function handleEntryPaymentRequestCompleted', start);
    const handler = source.slice(start, end);
    expect(handler).toContain("p_source_kind: 'cart'");
    expect(handler).toContain('p_source_id: cartId');
    expect(handler).toContain('p_verified_session_id: freshSession.id');
    expect(handler).toContain('p_verified_payment_intent_id: paymentIntentId');
    expect(handler).toContain('p_verified_line_prices: linePrices');
    expect(handler).toContain('stripe.checkout.sessions.retrieve(session.id)');
  });

  it('locks and claims the active cart only when it still references this session', () => {
    expect(settlement).toContain(
      'FROM public.entry_carts AS c WHERE c.id = p_source_id FOR UPDATE'
    );
    expect(settlement).toContain(
      'v_cart.stripe_checkout_session_id IS DISTINCT FROM p_verified_session_id'
    );
    expect(settlement).toContain("v_cart.status IS DISTINCT FROM 'active'");
    expect(settlement).toContain("UPDATE public.entry_carts SET status = 'submitted'");
    expect(settlement).toContain("WHERE id = p_source_id AND status = 'active'");
    expect(settlement).toContain('hashtextextended(p_verified_session_id, 0)');
  });

  it('does not keep a second PostgREST cart-status writer in the webhook', () => {
    expect(source).not.toContain(".from('entry_carts')\n      .update({ status: 'submitted' })");
  });
});
