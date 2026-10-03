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

const lineItemSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/_shared/entryPaymentLineItems.ts'),
  'utf8'
);

describe('stripe-webhook entry_payment_request branch', () => {
  it('dispatches checkout.session.completed of type entry_payment_request to its own handler', () => {
    // The type → handler decision lives in stripe-webhook/paidSessionEntry.ts
    // (decidePaidSessionEntry, unit-tested in paidSessionEntry.test.ts, which
    // also replays a recorded order first: Codex round 11 on #2689).
    expect(source).toContain('await routePaidSession(');
    expect(source).toContain(
      'fulfillPaymentLink: () => handleEntryPaymentRequestCompleted(session)'
    );
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
    // MP-07: the helper must see the FRESH-retrieved payment_status, never the
    // untrusted webhook payload's.
    expect(source).toContain('sessionPaymentStatus: freshSession.payment_status');
    expect(source).not.toContain('sessionPaymentStatus: session.payment_status');
    expect(source).toContain('expectedEntryIds: entryIds');
    // alerts when the paid link references entries that no longer exist (F4)
    expect(source).toContain('missingEntryIds');
    expect(source).toContain('inactiveEntryIds');
  });

  it('anchors on the persisted entry_payment_links row (anti-tamper + idempotency latch)', () => {
    expect(source).toContain('entry_payment_links');
    // Closes the link so a re-delivered event is a no-op. Since Codex round 13
    // on #2689 the close and the refund request are ONE transaction
    // (queue_payment_link_refund; behaviour in _shared/refundRequests.test.ts
    // and the SQL test O19-O21).
    expect(source).toContain('await settlePaymentLinkObligation(refundQueueDeps, {');
    expect(source).toContain('linkId: link.id,');
  });

  it('latches successful expired promotion claims to paid so Stripe retries do not refund them', () => {
    expect(source).toContain("link.status === 'expired' && paidIds.length > 0");
    expect(source).toContain("link.status === 'expired' ? 'expired' : 'open'");
  });

  it('records payment history in stripe_orders so the charge is visible + payout-eligible', () => {
    // Since Codex round 14 on #2689 the order is built by paymentLinkOrder.ts
    // and inserted inside queue_payment_link_refund, with the link latch and
    // the refund request; an existing order is left as it is (ON CONFLICT DO
    // NOTHING, SQL test O22).
    expect(source).toContain('order: buildPaymentLinkOrder({');
    expect(source).toContain('paymentIntentId,');
  });

  it('queues invalid paid-for-nothing link charges for refund approval with an explicit amount', () => {
    expect(source).toContain('updateOutcome.refundDecision');
    expect(source).toContain('loadEntryPaymentLineItemFeesFromStripe');
    expect(lineItemSource).toContain('listLineItems');
    expect(lineItemSource).toContain("expand: ['data.price.product']");
    expect(lineItemSource).toContain('product.metadata?.entry_id');
    // MYK9-876: refunds are never automatic — the webhook queues, an admin approves.
    expect(source).not.toContain('refunds.create');
    // The owed amount goes into the same call that closes the link.
    expect(source).toContain('amountCents: decision.amountCents,');
    expect(source).toContain('reason: decision.reason,');
    expect(source).not.toMatch(/\.update\(\{[^}]*status: 'refunded'/s);
    expect(source).toContain('allFromAppRefund');
  });

  it('derives paid entry ids from actual guarded update results, not planned patches', () => {
    expect(source).toContain(".eq('payment_status', 'pending')");
    expect(source).toContain(".not('entry_status', 'in', inactiveEntryStatusFilter)");
    expect(source).toContain(".select('id')");
    expect(source).toContain('updatedEntryIds');
    expect(source).toContain('paidIds = updateOutcome.paidEntryIds');
  });

  it('resolves linked waitlist offers only after entries are actually marked paid', () => {
    expect(source).toContain('await resolvePaidWaitlistOffers(paidIds, session.id)');
    expect(source).toContain(".from('waitlist_entries')");
    expect(source).toContain(".update({ status: 'accepted'");
    expect(source).toContain(".in('promoted_entry_id', entryIds)");
    expect(source).toContain(".in('status', ['offered', 'expired'])");
  });

  it('fails paid expired waitlist claims closed when a replacement offer exists', () => {
    expect(source).toContain('paidExpiredClaimHasReplacementOffer(patch.id, session.id)');
    expect(source).toContain(".eq('promoted_entry_id', entryId)");
    expect(source).toContain(".eq('status', 'offered')");
    expect(source).toContain(".neq('promoted_entry_id', entryId)");
    expect(source).toContain('left the expired entry');
    expect(source).toContain('double-selling the spot');
  });

  it('re-reads no-op patch ids so races become invalid refund candidates', () => {
    expect(source).toContain('noOpPatchIds');
    expect(source).toContain(
      ".select('id, payment_status, entry_status, stripe_payment_intent_id')"
    );
    expect(source).toContain('rereadNoOpEntries');
    expect(source).toContain('invalidEntryIds = updateOutcome.invalidEntryIds');
  });

  it('classifies same-intent paid rows as idempotent success instead of refund candidates', () => {
    expect(source).toContain('initialSameIntentPaidEntryIds: result.sameIntentPaidEntryIds');
    expect(source).toContain('stripe_payment_intent_id');
  });
});
