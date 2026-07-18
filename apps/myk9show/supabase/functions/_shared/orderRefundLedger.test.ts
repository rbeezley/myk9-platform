import { describe, it, expect } from 'vitest';
import {
  deriveOrderRefundTotals,
  failOrderRefund,
  resolveOrderStatusAfterRefund,
  upsertOrderRefund,
  refundKindFromMetadata,
  MAKE_WHOLE_METADATA_KEY,
  type OrderRefundLedgerRow,
} from './orderSnapshot';

describe('refundKindFromMetadata — race-proof attribution (Codex round-7)', () => {
  it('reads make_whole off the Stripe object, so the sweep cannot mislabel it', () => {
    // The `charge.refunded` sweep may run BEFORE the make-whole writer books its
    // row. Because the ledger upsert never overwrites `kind`, whoever lands first
    // decides it — so the kind must be knowable from the Stripe object itself.
    // Assuming 'post_hoc' here booked make-whole money as a permanent platform
    // loss and could understate the club payout.
    expect(refundKindFromMetadata({ metadata: { [MAKE_WHOLE_METADATA_KEY]: 'true' } })).toBe(
      'make_whole'
    );
  });

  it('defaults an ordinary refund to post_hoc (a real platform loss)', () => {
    expect(refundKindFromMetadata({ metadata: { type: 'entry_refund' } })).toBe('post_hoc');
    expect(refundKindFromMetadata({ metadata: null })).toBe('post_hoc');
    expect(refundKindFromMetadata({})).toBe('post_hoc');
  });

  it('does not treat a non-"true" value as make-whole', () => {
    expect(refundKindFromMetadata({ metadata: { [MAKE_WHOLE_METADATA_KEY]: 'false' } })).toBe(
      'post_hoc'
    );
  });
});

// Pure mirror of the refund LEDGER (`public.stripe_order_refunds` + the
// `recompute_order_refund_totals` recompute, migration 20260717120000). The DB is
// the authority; these tests pin the algebra the SQL implements. The executable
// SQL counterpart is scripts/qa/financial-reconciliation-local-assertions.sql,
// which replays the same adversarial sequences against a real Postgres.
//
// WHY A LEDGER: the previous design kept two MONOTONIC counters and mutated them
// with GREATEST on the forward path and a subtraction on the reversal path.
// Counters cannot represent "this refund was UN-done", so a redelivered
// charge.refunded silently undid a refund.failed reversal, and the reversal
// destroyed the very id-set that made re-booking idempotent. One row per Stripe
// refund makes idempotency a property of the PRIMARY KEY and recomputation order
// independent by construction.

describe('refund ledger: one row per Stripe refund, totals DERIVED', () => {
  const book = (
    ledger: OrderRefundLedgerRow[],
    refundId: string,
    amountCents: number,
    kind: 'make_whole' | 'post_hoc' = 'post_hoc'
  ) => upsertOrderRefund(ledger, { refundId, amountCents, kind });

  it('routes a make-whole refund to make_whole ONLY, never post-hoc', () => {
    expect(deriveOrderRefundTotals(book([], 're_1', 2500, 'make_whole'))).toEqual({
      makeWholeCents: 2500,
      postHocCents: 0,
    });
  });

  it('routes a post-hoc refund to refunded_cents ONLY', () => {
    expect(deriveOrderRefundTotals(book([], 're_1', 3000))).toEqual({
      makeWholeCents: 0,
      postHocCents: 3000,
    });
  });

  it('SUMS distinct refunds instead of guessing a split from a cumulative total', () => {
    let ledger = book([], 're_mw', 1000, 'make_whole');
    ledger = book(ledger, 're_ph', 2500);
    expect(deriveOrderRefundTotals(ledger)).toEqual({ makeWholeCents: 1000, postHocCents: 2500 });
  });

  it('ACCUMULATES two make-whole refunds on one intent (two rows, not a max)', () => {
    let ledger = book([], 're_1', 300, 'make_whole');
    ledger = book(ledger, 're_2', 200, 'make_whole');
    expect(ledger).toHaveLength(2);
    expect(deriveOrderRefundTotals(ledger)).toEqual({ makeWholeCents: 500, postHocCents: 0 });
  });

  it('is idempotent under duplicate delivery — the refund id is the PRIMARY KEY', () => {
    const once = book([], 're_1', 1000, 'make_whole');
    const twice = book(once, 're_1', 1000, 'make_whole');
    expect(twice).toHaveLength(1);
    expect(deriveOrderRefundTotals(twice)).toEqual(deriveOrderRefundTotals(once));
  });

  it('NEVER overwrites kind: the charge.refunded sweep cannot demote a make-whole', () => {
    // The sweep books every refund object it sees as post_hoc. A refund the
    // make-whole writer already claimed must keep its kind, or a fully-returned
    // overflow charge reads as a platform loss.
    const claimed = book([], 're_1', 1000, 'make_whole');
    const swept = book(claimed, 're_1', 1000, 'post_hoc');
    expect(deriveOrderRefundTotals(swept)).toEqual({ makeWholeCents: 1000, postHocCents: 0 });
  });

  it('is ORDER INDEPENDENT: any delivery order lands on the same totals', () => {
    const forward = book(book([], 're_mw', 300, 'make_whole'), 're_ph', 200);
    const backward = book(book([], 're_ph', 200), 're_mw', 300, 'make_whole');
    expect(deriveOrderRefundTotals(forward)).toEqual(deriveOrderRefundTotals(backward));
  });

  it('a FAILED refund stops counting but its row is RETAINED for audit', () => {
    const ledger = failOrderRefund(book([], 're_1', 1000), 're_1');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ refundId: 're_1', amountCents: 1000, state: 'failed' });
    expect(deriveOrderRefundTotals(ledger)).toEqual({ makeWholeCents: 0, postHocCents: 0 });
  });

  it('FAILED IS TERMINAL: a redelivered booking cannot resurrect a failed refund', () => {
    // The exact sequence that broke the old counters: charge.refunded(4000) ->
    // post_hoc 4000; refund.failed -> 0; charge.refunded REDELIVERED -> 4000
    // again, silently undoing the reversal.
    const booked = book([], 're_B', 4000);
    expect(deriveOrderRefundTotals(booked).postHocCents).toBe(4000);
    const failed = failOrderRefund(booked, 're_B');
    expect(deriveOrderRefundTotals(failed).postHocCents).toBe(0);
    const redelivered = book(failed, 're_B', 4000);
    expect(deriveOrderRefundTotals(redelivered).postHocCents).toBe(0);
  });

  it('a make-whole RE-BOOK after failure stays failed (the dedupe key survives)', () => {
    // Old bug: the reversal REMOVED the id from make_whole_refund_ids, destroying
    // the very key that made the re-booking idempotent.
    const failed = failOrderRefund(book([], 're_A', 500, 'make_whole'), 're_A');
    const reBooked = book(failed, 're_A', 500, 'make_whole');
    expect(deriveOrderRefundTotals(reBooked)).toEqual({ makeWholeCents: 0, postHocCents: 0 });
  });

  it('failing a refund the ledger never booked is a no-op — it never invents a row', () => {
    const ledger = book([], 're_1', 1000);
    const after = failOrderRefund(ledger, 're_never_booked');
    expect(after).toEqual(ledger);
    expect(deriveOrderRefundTotals(after)).toEqual({ makeWholeCents: 0, postHocCents: 1000 });
  });

  it('an out-of-order failure BEFORE the booking changes nothing, then settles', () => {
    const early = failOrderRefund([], 're_ooo');
    expect(early).toEqual([]);
    const booked = book(early, 're_ooo', 3000);
    expect(deriveOrderRefundTotals(booked).postHocCents).toBe(3000);
    // Stripe redelivers for three days; the repeat failure settles it.
    expect(deriveOrderRefundTotals(failOrderRefund(booked, 're_ooo')).postHocCents).toBe(0);
  });

  it('treats null/undefined/negative amounts as 0 rather than corrupting money math', () => {
    expect(deriveOrderRefundTotals([])).toEqual({ makeWholeCents: 0, postHocCents: 0 });
    expect(
      deriveOrderRefundTotals(upsertOrderRefund([], { refundId: 're_1', amountCents: null }))
    ).toEqual({ makeWholeCents: 0, postHocCents: 0 });
    expect(deriveOrderRefundTotals(book([], 're_1', -100))).toEqual({
      makeWholeCents: 0,
      postHocCents: 0,
    });
  });

  it('rounds fractional cents to integers', () => {
    expect(deriveOrderRefundTotals(book([], 're_1', 1000.4)).postHocCents).toBe(1000);
  });

  it('totals can never go negative — a failure is a state change, not a subtraction', () => {
    const totals = deriveOrderRefundTotals(failOrderRefund(book([], 're_1', 100), 're_1'));
    expect(totals.postHocCents).toBeGreaterThanOrEqual(0);
    expect(totals.makeWholeCents).toBeGreaterThanOrEqual(0);
  });
});

describe('resolveOrderStatusAfterRefund: status = refunded IFF fully refunded', () => {
  const totals = (makeWholeCents: number, postHocCents: number) => ({
    makeWholeCents,
    postHocCents,
  });

  it('marks a FULL in-app refund refunded (the flow that used to stay succeeded)', () => {
    expect(
      resolveOrderStatusAfterRefund({ status: 'succeeded', amountCents: 10700 }, totals(0, 10700))
    ).toEqual({ status: 'refunded', fullyRefunded: true, refundedAt: 'set' });
  });

  it('leaves a PARTIAL refund succeeded — which is NOT drift', () => {
    expect(
      resolveOrderStatusAfterRefund({ status: 'succeeded', amountCents: 10700 }, totals(0, 4000))
    ).toEqual({ status: 'succeeded', fullyRefunded: false, refundedAt: 'clear' });
  });

  it('counts make-whole toward FULL, so a fully make-whole order reads refunded', () => {
    expect(
      resolveOrderStatusAfterRefund({ status: 'succeeded', amountCents: 5000 }, totals(5000, 0))
    ).toEqual({ status: 'refunded', fullyRefunded: true, refundedAt: 'set' });
  });

  it('DEMOTES a refunded order whose refund failed (the counters structurally could not)', () => {
    expect(
      resolveOrderStatusAfterRefund({ status: 'refunded', amountCents: 1000 }, totals(0, 0))
    ).toEqual({ status: 'succeeded', fullyRefunded: false, refundedAt: 'clear' });
  });

  it('moves ONLY the succeeded <-> refunded pair; other statuses are never rewritten', () => {
    expect(
      resolveOrderStatusAfterRefund({ status: 'failed', amountCents: 1000 }, totals(0, 1000)).status
    ).toBe('failed');
    expect(
      resolveOrderStatusAfterRefund({ status: 'pending', amountCents: 1000 }, totals(0, 0)).status
    ).toBe('pending');
    expect(
      resolveOrderStatusAfterRefund({ status: 'cancelled', amountCents: 1000 }, totals(0, 0)).status
    ).toBe('cancelled');
  });

  it('derives refunded_at from the SAME condition as the status', () => {
    // The old reversal path cleared refunded_at on orders that were never full.
    for (const [amount, mw, ph] of [
      [10700, 0, 0],
      [10700, 0, 4000],
      [10700, 4000, 6700],
      [10700, 0, 20000],
    ] as const) {
      const resolved = resolveOrderStatusAfterRefund(
        { status: 'succeeded', amountCents: amount },
        totals(mw, ph)
      );
      expect(resolved.refundedAt === 'set').toBe(resolved.fullyRefunded);
    }
  });

  it('never marks a zero/unknown-amount order refunded', () => {
    expect(
      resolveOrderStatusAfterRefund({ status: 'succeeded', amountCents: null }, totals(0, 0))
    ).toEqual({ status: 'succeeded', fullyRefunded: false, refundedAt: 'clear' });
  });
});
