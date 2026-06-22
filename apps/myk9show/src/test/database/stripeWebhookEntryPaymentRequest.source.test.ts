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

  it('decides reconciliation via the pure helper (real rules are unit-tested there)', () => {
    expect(source).toContain('reconcileEntryPaymentRequest');
  });

  it('feeds the session payment_status + expected entry ids to the helper (F3/F4 coherence checks)', () => {
    expect(source).toContain('sessionPaymentStatus: session.payment_status');
    expect(source).toContain('expectedEntryIds: entryIds');
    // alerts when the paid link references entries that no longer exist (F4)
    expect(source).toContain('missingEntryIds');
  });

  it('anchors on the persisted entry_payment_links row (anti-tamper + idempotency latch)', () => {
    expect(source).toContain('entry_payment_links');
    // closes the link so a re-delivered event is a no-op
    expect(source).toContain("status: 'paid'");
  });

  it('records payment history in stripe_orders so the charge is visible + payout-eligible', () => {
    expect(source).toContain('stripe_orders');
    // benign duplicate (unique violation) is ignored, like the cart path
    expect(source).toContain("orderError.code !== '23505'");
  });
});
