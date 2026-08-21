// Pure-mapping tests for the financial reconciliation client wrappers
// (financial-reconciliation, MYK9-54). Authorization + aggregation live in the
// SQL RPC (source-pinned separately); here we prove the client shapes scope
// args correctly, maps snake_case rows to typed camelCase, coerces bigint
// strings, preserves NULL-as-pending, and threads the keyset cursor.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  fetchFinancialReconciliationOrders,
  fetchFinancialReconciliationPayouts,
  fetchFinancialReconciliationSummary,
  mapOrderRow,
  mapPayoutRow,
  mapSummaryRow,
  nextCursor,
} from './financialReconciliation';

beforeEach(() => {
  rpc.mockReset();
});

describe('mapSummaryRow', () => {
  it('coerces bigint strings and keeps charge/payout totals separate', () => {
    const summary = mapSummaryRow({
      order_count: '3',
      gross_charged_cents: '10700',
      entry_subtotal_cents: '10000',
      platform_fee_cents: '700',
      processing_fee_cents: '320',
      processing_fee_pending_count: '1',
      pending_fee_platform_fee_cents: '0',
      pending_fee_refunded_cents: '0',
      refunded_cents: '25',
      make_whole_refunded_cents: '4000',
      snapshot_missing_count: '2',
      non_entry_order_count: '4',
      non_entry_gross_cents: '2500',
      non_entry_refunded_cents: '0',
      non_entry_make_whole_refunded_cents: '0',
      payout_count: '1',
      payout_completed_cents: '9500',
      payout_pending_cents: '0',
      payout_failed_cents: '1200',
      payout_failed_count: '1',
    });
    expect(summary.orderCount).toBe(3);
    expect(summary.grossChargedCents).toBe(10700);
    expect(summary.platformFeeCents).toBe(700);
    // Pending fee is a COUNT, not folded into the captured-fee sum.
    expect(summary.processingFeeCents).toBe(320);
    expect(summary.processingFeePendingCount).toBe(1);
    expect(summary.payoutCompletedCents).toBe(9500);
    // Non-entry charges are their own labeled pair, never folded into entry totals.
    expect(summary.nonEntryOrderCount).toBe(4);
    expect(summary.nonEntryGrossCents).toBe(2500);
    // A failed transfer keeps its amount, separate from pending.
    expect(summary.payoutFailedCents).toBe(1200);
    expect(summary.payoutPendingCents).toBe(0);
    expect(summary.payoutFailedCount).toBe(1);
    // The two refund kinds arrive as SEPARATE explicit columns and are mapped
    // separately: refundedCents is POST-HOC only (a real platform loss), while
    // the cart-overflow make-whole total is its own field. Neither is derived.
    expect(summary.refundedCents).toBe(25);
    expect(summary.makeWholeRefundedCents).toBe(4000);
  });
});

describe('refund split — explicit columns, never derived', () => {
  // The old client-side derivePostHocRefundedCents helper (post-hoc =
  // max(0, refunded − max(0, amount − subtotal − fee))) is GONE on purpose: that
  // derivation was an identity for a well-formed order, which made the charge
  // tie-out tautological. Both refund kinds are now recorded explicitly at write
  // time, so the client only maps them.
  it('maps a pure cart-overflow order with zero post-hoc loss', () => {
    const summary = mapSummaryRow({
      ...ZERO_SUMMARY_ROW,
      gross_charged_cents: '9250',
      entry_subtotal_cents: '5000',
      platform_fee_cents: '250',
      refunded_cents: '0',
      make_whole_refunded_cents: '4000',
    });
    expect(summary.refundedCents).toBe(0);
    expect(summary.makeWholeRefundedCents).toBe(4000);
    // Ties out: 9250 == 5000 + 250 + 4000.
    expect(
      summary.entrySubtotalCents + summary.platformFeeCents + summary.makeWholeRefundedCents
    ).toBe(summary.grossChargedCents);
  });

  it('maps an order carrying BOTH refund kinds without conflating them', () => {
    const summary = mapSummaryRow({
      ...ZERO_SUMMARY_ROW,
      gross_charged_cents: '9250',
      entry_subtotal_cents: '5000',
      platform_fee_cents: '250',
      refunded_cents: '25',
      make_whole_refunded_cents: '4000',
    });
    expect(summary.refundedCents).toBe(25);
    expect(summary.makeWholeRefundedCents).toBe(4000);
  });

  it('defaults both refund totals to 0 rather than NaN when absent', () => {
    const summary = mapSummaryRow(ZERO_SUMMARY_ROW);
    expect(summary.refundedCents).toBe(0);
    expect(summary.makeWholeRefundedCents).toBe(0);
  });
});

const ZERO_SUMMARY_ROW = {
  order_count: '0',
  gross_charged_cents: '0',
  entry_subtotal_cents: '0',
  platform_fee_cents: '0',
  processing_fee_cents: '0',
  processing_fee_pending_count: '0',
  pending_fee_platform_fee_cents: '0',
  pending_fee_refunded_cents: '0',
  refunded_cents: '0',
  make_whole_refunded_cents: '0',
  snapshot_missing_count: '0',
  non_entry_order_count: '0',
  non_entry_gross_cents: '0',
  non_entry_refunded_cents: '0',
  non_entry_make_whole_refunded_cents: '0',
  payout_count: '0',
  payout_completed_cents: '0',
  payout_pending_cents: '0',
  payout_failed_cents: '0',
  payout_failed_count: '0',
};

describe('mapOrderRow', () => {
  it('preserves NULL processing fee as pending (never 0) and maps ids', () => {
    const order = mapOrderRow({
      order_id: 'o1',
      show_id: 's1',
      show_name: 'Show 1',
      status: 'succeeded',
      order_type: 'entry',
      amount_cents: 10700,
      entry_subtotal_cents: 10000,
      platform_fee_cents: 700,
      platform_fee_rate: '7.00',
      stripe_processing_fee_cents: null,
      refunded_cents: 0,
      make_whole_refunded_cents: 0,
      stripe_payment_intent_id: 'pi_123',
      created_at: '2026-07-01T00:00:00Z',
      paid_at: '2026-07-01T00:01:00Z',
      refunded_at: null,
    });
    expect(order.stripeProcessingFeeCents).toBeNull();
    expect(order.platformFeeRate).toBe(7);
    expect(order.stripePaymentIntentId).toBe('pi_123');
    expect(order.refundedCents).toBe(0);
    expect(order.makeWholeRefundedCents).toBe(0);
  });

  it('carries the make-whole refund through so the row tie-out stays checkable', () => {
    // Without this column on the detail row, a per-row tie-out could only be
    // written as amount == subtotal + fee — the tautology this split removes.
    const order = mapOrderRow({
      order_id: 'o2',
      show_id: 's1',
      show_name: 'Show 1',
      status: 'succeeded',
      order_type: 'entry',
      amount_cents: '9350',
      entry_subtotal_cents: '5000',
      platform_fee_cents: '350',
      platform_fee_rate: '7.00',
      stripe_processing_fee_cents: '300',
      refunded_cents: '0',
      make_whole_refunded_cents: '4000',
      stripe_payment_intent_id: 'pi_overflow',
      created_at: '2026-07-01T00:00:00Z',
      paid_at: '2026-07-01T00:01:00Z',
      refunded_at: null,
    });
    expect(order.makeWholeRefundedCents).toBe(4000);
    expect(order.entrySubtotalCents! + order.platformFeeCents! + order.makeWholeRefundedCents).toBe(
      order.amountCents
    );
  });
});

describe('mapPayoutRow', () => {
  it('carries the copyable transfer id and settlement status', () => {
    const payout = mapPayoutRow({
      payout_id: 'p1',
      show_id: 's1',
      show_name: 'Cedar Valley Classic',
      status: 'completed',
      amount_cents: 9500,
      stripe_transfer_id: 'tr_123',
      scheduled_date: '2026-07-05',
      completed_at: '2026-07-05T12:00:00Z',
      failure_reason: null,
      created_at: '2026-07-01T00:00:00Z',
    });
    expect(payout.stripeTransferId).toBe('tr_123');
    expect(payout.status).toBe('completed');
    // The RPC names the show itself (20260821120000), so a reconciliation row
    // never depends on the RLS-filtered payout-history read to be identifiable.
    expect(payout.showName).toBe('Cedar Valley Classic');
  });
});

describe('scope arg shaping', () => {
  it('sends only the club id for club scope', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchFinancialReconciliationSummary({ scope: 'club', clubId: 'c1', showId: 's-ignored' });
    expect(rpc).toHaveBeenCalledWith('financial_reconciliation_summary', {
      p_scope: 'club',
      p_club_id: 'c1',
      p_show_id: null,
    });
  });

  it('sends only the show id for show scope', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchFinancialReconciliationSummary({ scope: 'show', showId: 's1', clubId: 'c-ignored' });
    expect(rpc).toHaveBeenCalledWith('financial_reconciliation_summary', {
      p_scope: 'show',
      p_club_id: null,
      p_show_id: 's1',
    });
  });

  it('sends no scope id for platform scope', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchFinancialReconciliationSummary({ scope: 'platform' });
    expect(rpc).toHaveBeenCalledWith('financial_reconciliation_summary', {
      p_scope: 'platform',
      p_club_id: null,
      p_show_id: null,
    });
  });
});

describe('summary fetch', () => {
  it('returns zeroed totals when the authorized scope has no row', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const summary = await fetchFinancialReconciliationSummary({ scope: 'platform' });
    expect(summary.orderCount).toBe(0);
    expect(summary.grossChargedCents).toBe(0);
  });

  it('throws when the RPC returns an error (unauthorized is a real failure)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: new Error('Not authorized for platform financial scope'),
    });
    await expect(fetchFinancialReconciliationSummary({ scope: 'platform' })).rejects.toThrow(
      /Not authorized/
    );
  });
});

describe('detail pagination', () => {
  it('threads the keyset cursor + limit into the orders RPC', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchFinancialReconciliationOrders({
      scope: 'club',
      clubId: 'c1',
      limit: 50,
      cursor: { createdAt: '2026-07-01T00:00:00Z', id: 'o9' },
    });
    expect(rpc).toHaveBeenCalledWith('financial_reconciliation_orders', {
      p_scope: 'club',
      p_club_id: 'c1',
      p_show_id: null,
      p_limit: 50,
      p_after_created_at: '2026-07-01T00:00:00Z',
      p_after_id: 'o9',
    });
  });

  it('defaults limit and null cursor on the first payouts page', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchFinancialReconciliationPayouts({ scope: 'platform' });
    expect(rpc).toHaveBeenCalledWith('financial_reconciliation_payouts', {
      p_scope: 'platform',
      p_club_id: null,
      p_show_id: null,
      p_limit: 200,
      p_after_created_at: null,
      p_after_id: null,
    });
  });

  it('maps returned order rows', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          order_id: 'o1',
          show_id: 's1',
          show_name: 'Show 1',
          status: 'succeeded',
          order_type: 'entry',
          amount_cents: 100,
          entry_subtotal_cents: 90,
          platform_fee_cents: 10,
          platform_fee_rate: 7,
          stripe_processing_fee_cents: 3,
          refunded_cents: 0,
          stripe_payment_intent_id: 'pi_1',
          created_at: '2026-07-01T00:00:00Z',
          paid_at: null,
          refunded_at: null,
        },
      ],
      error: null,
    });
    const rows = await fetchFinancialReconciliationOrders({ scope: 'platform' });
    expect(rows).toHaveLength(1);
    expect(rows[0].orderId).toBe('o1');
  });
});

describe('nextCursor', () => {
  it('returns null when the page is not full (exhausted)', () => {
    expect(nextCursor([{ createdAt: 't', orderId: 'o1' }], 50)).toBeNull();
  });

  it('returns the last row cursor when the page is full', () => {
    const rows = [
      { createdAt: 't1', orderId: 'o1' },
      { createdAt: 't2', orderId: 'o2' },
    ];
    expect(nextCursor(rows, 2)).toEqual({ createdAt: 't2', id: 'o2' });
  });

  it('uses payoutId when orderId is absent', () => {
    const rows = [
      { createdAt: 't1', payoutId: 'p1' },
      { createdAt: 't2', payoutId: 'p2' },
    ];
    expect(nextCursor(rows, 2)).toEqual({ createdAt: 't2', id: 'p2' });
  });
});
