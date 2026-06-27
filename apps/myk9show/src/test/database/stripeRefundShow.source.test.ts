import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression contract for the bulk make-whole show-refund WIRING — the parts a
 * pure helper (showRefundPlan / showRefundReuse) can't cover: authz, the
 * payout guard, full-intent refunds, per-entry fee stamping, the single-show
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

  it('refunds each PaymentIntent in FULL (no amount → make-whole) and tags it for reuse', () => {
    // No `amount` in the refund payload → Stripe refunds the full remaining
    // charge (entry fees + platform fee). The show tag drives idempotent reuse.
    expect(source).toContain('stripe.refunds.create');
    expect(source).toContain('metadata: { show_refund: showId }');
    expect(source).toContain('idempotencyKey: `refund-show-');
    expect(source).toContain('findReusableShowRefund');
    // It must NOT pass an amount on the make-whole create (that would cap it).
    expect(source).not.toMatch(/refunds\.create\(\s*\{[^}]*amount/);
  });

  it('stamps each entry with its OWN fee so the payout cron zeroes the club share', () => {
    expect(source).toContain('group.stampByEntry[entryId]');
    expect(source).toContain('buildEntryRefundStamp(feeCents');
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

  it('paginates the cross-show check so a >1000-row truncation cannot hide it — #974 #2', () => {
    expect(source).toContain('INTENT_IN_BATCH');
    expect(source).toContain('.range(from, from + ENTRY_PAGE - 1)');
  });
});
