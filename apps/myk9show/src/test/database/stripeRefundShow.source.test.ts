import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression contract for the cancelled-show bulk refund WIRING — the parts a
 * pure helper (showRefundPlan / showRefundReuse) can't cover: authz, the
 * payout guard, entry-fee-only refunds, per-entry fee stamping, the single-show
 * guard, and bounded concurrency.
 */
const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-refund-show/index.ts'),
  'utf8'
);

describe('stripe-refund-show wiring', () => {
  it('authorizes as the caller via the three canonical predicates', () => {
    expect(source).toContain("userClient.rpc('is_show_secretary'");
    expect(source).toContain("userClient.rpc('is_club_admin'");
    expect(source).toContain("userClient.rpc('is_site_admin'");
    // A clubless show has no club-admin path (no stake guard).
    expect(source).toContain('club_id');
  });

  it('blocks refunds once the club payout is sent or in flight', () => {
    expect(source).toContain("payout?.status === 'completed'");
    expect(source).toContain('payout_already_sent');
    expect(source).toContain("payout?.status === 'processing'");
    expect(source).toContain('payout_in_progress');
  });

  it('refunds each PaymentIntent its ENTRY FEES only (MYK9-966) and tags it for reuse', () => {
    // The amount and the show tag come from showRefundCreateParams, whose
    // behavior (explicit entry-fee amount, never the service fee) is pinned in
    // _shared/refundNeverReturnsServiceFee.test.ts. Here: the edge fn uses it.
    expect(source).toContain('stripe.refunds.create(showRefundCreateParams(group, showId)');
    expect(source).toContain('idempotencyKey: `refund-show-entry-fees-');
    expect(source).toContain('findReusableShowRefund');
    // No hand-built, amount-less create may come back beside it.
    expect(source.match(/stripe\.refunds\.create\(/g)).toHaveLength(1);
  });

  it('requires the show to be cancelled before any money moves (review #974 #1a)', () => {
    expect(source).toContain("status !== 'cancelled'");
    expect(source).toContain('show_not_cancelled');
  });

  it('stamps the intent ATOMICALLY via an RPC (no partial-stamp half-state) — review #974 #1b', () => {
    expect(source).toContain("supabase.rpc('stamp_show_refund_entries'");
    expect(source).toContain('p_entry_ids: group.entryIds');
    // The old non-atomic per-entry loop must be gone.
    expect(source).not.toContain('buildEntryRefundStamp');
  });

  it('skips intents that also paid for other shows (no over-refund)', () => {
    expect(source).toContain('findCrossShowIntents');
    expect(source).toContain('intent_spans_shows');
  });

  it('bounds Stripe concurrency and alerts on a post-refund stamp failure', () => {
    expect(source).toContain('mapWithConcurrency');
    expect(source).toContain('const CONCURRENCY');
    expect(source).toContain('alertAdmin');
  });

  it('re-checks the payout state per intent (mid-run race) — review #974 #3', () => {
    expect(source).toContain('readPayoutBlock');
    // The re-check lives INSIDE refundIntent, before issuing money.
    expect(source).toContain('Re-check the payout state just before issuing money');
  });

  it('serializes bulk refunds with the payout cron via show_money_locks', () => {
    expect(source).toContain('acquireShowMoneyLock');
    expect(source).toContain("holder: 'stripe-refund-show'");
    expect(source).toContain('money_operation_in_progress');
    expect(source).toContain('await moneyLock.release()');
  });

  it('paginates the cross-show check so a >1000-row truncation cannot hide it — #974 #2', () => {
    expect(source).toContain('INTENT_IN_BATCH');
    expect(source).toContain('.range(from, from + ENTRY_PAGE - 1)');
  });
});
