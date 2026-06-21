import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression contract for the stripe-webhook `entry_payment_request` branch
 * (secretary-initiated payment links — mail-in + waitlist pay-to-claim).
 *
 * The behavioral rules live in (and are unit-tested via) the pure helper
 * _shared/entryPaymentReconcile.ts. These source assertions pin the WIRING that
 * a pure helper can't: that the webhook dispatches to the branch, anchors on the
 * persisted link row (anti-tamper + idempotency), and records payment history.
 */
const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);

describe('stripe-webhook entry_payment_request branch', () => {
  it('dispatches checkout.session.completed of type entry_payment_request to its own handler', () => {
    expect(source).toContain("checkoutType === 'entry_payment_request'");
    expect(source).toContain('handleEntryPaymentRequestCompleted');
  });

  it('routes async Checkout payment success through the same paid-session handler', () => {
    expect(source).toContain("case 'checkout.session.async_payment_succeeded':");
    expect(source).toContain(
      'await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)'
    );
    expect(source).toContain("case 'checkout.session.async_payment_failed':");
    expect(source).toContain('entries remain pending');
  });

  it('decides reconciliation via the pure helper (real rules are unit-tested there)', () => {
    expect(source).toContain('reconcileEntryPaymentRequest');
    expect(source).toContain('reconcileEntryPaymentUpdateOutcome');
  });

  it('feeds the session payment_status + expected entry ids to the helper (F3/F4 coherence checks)', () => {
    expect(source).toContain('sessionPaymentStatus: session.payment_status');
    expect(source).toContain('expectedEntryIds: entryIds');
    // alerts when the paid link references entries that no longer exist (F4)
    expect(source).toContain('missingEntryIds');
    expect(source).toContain('inactiveEntryIds');
  });

  it('anchors on the persisted entry_payment_links row (anti-tamper + idempotency latch)', () => {
    expect(source).toContain('entry_payment_links');
    // closes the link so a re-delivered event is a no-op
    expect(source).toContain("status: 'paid'");
  });

  it('records payment history in stripe_orders so the charge is visible + payout-eligible', () => {
    expect(source).toContain('stripe_orders');
    expect(source).toContain('stripe_payment_intent_id: paymentIntentId');
    // benign duplicate (unique violation) is ignored, like the cart path
    expect(source).toContain("orderError.code !== '23505'");
  });

  it('auto-refunds invalid paid-for-nothing link charges through Stripe with an explicit amount', () => {
    expect(source).toContain('updateOutcome.refundDecision');
    expect(source).toContain('stripe.checkout.sessions.listLineItems');
    expect(source).toContain('item.metadata?.entry_id');
    expect(source).toContain('stripe.refunds.create');
    expect(source).toContain('payment_intent: input.paymentIntentId');
    expect(source).toContain('amount: input.amountCents');
    expect(source).toContain('entry_payment_request_auto_refund');
    expect(source).toContain("status: 'refunded'");
    expect(source).toContain('allFromAppRefund');
  });

  it('derives paid entry ids from actual guarded update results, not planned patches', () => {
    expect(source).toContain(".eq('payment_status', 'pending')");
    expect(source).toContain(".not('entry_status', 'in', inactiveEntryStatusFilter)");
    expect(source).toContain(".select('id')");
    expect(source).toContain('updatedEntryIds');
    expect(source).toContain('paidIds = updateOutcome.paidEntryIds');
  });

  it('re-reads no-op patch ids so races become invalid refund candidates', () => {
    expect(source).toContain('noOpPatchIds');
    expect(source).toContain(".select('id, payment_status, entry_status')");
    expect(source).toContain('rereadNoOpEntries');
    expect(source).toContain('invalidEntryIds = updateOutcome.invalidEntryIds');
  });
});
