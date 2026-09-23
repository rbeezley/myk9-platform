import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const source = readFileSync(
  resolve(root, 'apps/myk9show/supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);
const settlement = readFileSync(
  resolve(root, 'supabase/migrations/20260923022007_myk9_639_authoritative_entry_settlement.sql'),
  'utf8'
);
const lineage = readFileSync(
  resolve(root, 'supabase/migrations/20260923021937_myk9_639_entry_payment_lineage.sql'),
  'utf8'
);

const linkHandlerStart = source.indexOf('async function handleEntryPaymentRequestCompleted');
const linkHandlerEnd = source.indexOf(
  '\nasync function completeEntrySettlementSideEffects',
  linkHandlerStart
);
const linkHandler = source.slice(linkHandlerStart, linkHandlerEnd);

describe('stripe-webhook payment-link settlement contract', () => {
  it('routes completed and async-paid link sessions through the same handler', () => {
    expect(source).toContain("checkoutType === 'entry_payment_request'");
    expect(source).toContain('handleEntryPaymentRequestCompleted(session)');
    expect(source).toContain("case 'checkout.session.async_payment_succeeded':");
    expect(source).toContain(
      'await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)'
    );
  });

  it('binds the RPC to the persisted link, fresh Stripe facts, and exact entry-price evidence', () => {
    expect(linkHandler).toContain(".from('entry_payment_links')");
    expect(linkHandler).toContain(".eq('stripe_checkout_session_id', session.id)");
    expect(linkHandler).toContain('stripe.checkout.sessions.retrieve(session.id)');
    expect(linkHandler).toContain("p_source_kind: 'payment_link'");
    expect(linkHandler).toContain('p_source_id: link.id');
    expect(linkHandler).toContain('p_verified_session_id: freshSession.id');
    expect(linkHandler).toContain('p_verified_payment_intent_id: paymentIntentId');
    expect(linkHandler).toContain('p_verified_line_prices: linePrices');
    expect(linkHandler).toContain("'entry_id'");
    expect(linkHandler).toContain('retryTransientSettlement(() =>');
  });

  it('serializes same-session retries and closes the link in the SQL transaction', () => {
    expect(settlement).toContain('pg_advisory_xact_lock');
    expect(settlement).toContain(
      'WHERE o.stripe_checkout_session_id = p_verified_session_id FOR UPDATE'
    );
    expect(settlement).toContain("v_existing.metadata->>'settlement_source_id'");
    expect(settlement).toContain('FROM public.entry_payment_links AS l');
    expect(settlement).toContain("WHERE id = p_source_id AND status IN ('open', 'expired')");
    expect(settlement).toContain("UPDATE public.entry_payment_links SET status = 'paid'");
  });

  it('accepts an expired promotion only for its still-valid claim with no replacement offer', () => {
    expect(settlement).toContain("IF v_link.status = 'expired' THEN");
    expect(settlement).toContain("v_root_status IS DISTINCT FROM 'promotion-expired'");
    expect(lineage).toContain("v_live_status = 'promotion-expired'");
    expect(lineage).toContain("w.promoted_entry_id = v_live_id AND w.status = 'expired'");
    expect(lineage).toContain("w.status = 'offered'");
    expect(lineage).toContain('w.promoted_entry_id IS DISTINCT FROM v_live_id');
    expect(settlement).toContain("SET status = 'accepted', updated_at = now()");
  });

  it('uses SQL-computed make-whole amounts and refunds deterministic no-settlement failures', () => {
    expect(linkHandler).toContain('settlement.expectedMakeWholeRefundCents');
    expect(linkHandler).toContain('issueEntryPaymentAutoRefund(');
    expect(linkHandler).toContain('isDeterministicSettlementRejection(settlementError?.code)');
    expect(settlement).toContain('expected_make_whole_refund_cents');
    expect(settlement).toContain("'paid_amount_cents'");
    expect(source).toContain('reconcileCreatedMakeWholeRefund(input.paymentIntentId, refund)');
  });

  it('bounds deadlock retries and alerts for manual replay without auto-refunding transient errors', () => {
    expect(source).toContain('isTransientSettlementSqlError(settlementError?.code)');
    expect(source).toContain('settlement retries exhausted');
    expect(source).toContain('no automatic refund was attempted');
    expect(source).toContain('if (isDeterministicSettlementRejection(settlementError?.code))');
    expect(source).not.toMatch(/function isDeterministicSettlementRejection\([\s\S]*?40P01/);
  });

  it('does not keep TypeScript entry, waitlist, or payment-link latch writers', () => {
    expect(linkHandler).not.toContain(".from('entries').update(");
    expect(linkHandler).not.toContain(".from('waitlist_entries').update(");
    expect(linkHandler).not.toContain(".from('entry_payment_links').update(");
  });
});
