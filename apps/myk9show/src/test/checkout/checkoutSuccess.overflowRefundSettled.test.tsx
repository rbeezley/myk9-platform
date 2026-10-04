/**
 * MYK9-966 (Codex round 2 on #2729): an all-overflow checkout used to refund the entry
 * fees and keep the service fee (since 2026-10-04 it refunds the whole charge), so the order need not reach
 * `status = 'refunded'`. "Refund issued" must follow the refund itself — the
 * order's recorded refund totals against the entry fees owed — not the
 * order's full-refund status.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';

const { mockRpc, mockGetSession, mockRefundColumns } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockGetSession: vi.fn(),
  mockRefundColumns: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => Promise.resolve({ data: [], error: null })),
    maybeSingle: mockRefundColumns,
  };
  return {
    supabase: {
      from: vi.fn(() => builder),
      rpc: mockRpc,
      auth: { getSession: mockGetSession },
    },
  };
});

vi.mock('@/hooks/pruneWizardDraftsForFiledEntries', () => ({
  pruneWizardDraftsForFiledEntries: vi.fn(),
}));

import { verifyCheckoutSession } from '@/lib/stripe';
import CheckoutSuccessPage from '@/pages/CheckoutSuccessPage';

/** 3 × $30 at 7%: $96.30 charged, $90.00 of entry fees owed back. */
function mockAllOverflowOrder(status: 'succeeded' | 'refunded' = 'succeeded') {
  mockRpc.mockResolvedValue({
    data: [
      {
        id: 'order-1',
        status,
        amount_cents: 9630,
        entry_ids: [],
        show_id: 'show-1',
        paid_at: '2026-10-04T10:00:00Z',
        refunded_at: null,
        stripe_payment_intent_id: 'pi_1',
        metadata: {
          overflow_refund: { action: 'refund', reason: 'full_make_whole', amount_cents: 9000 },
        },
        show_name: 'Fall Trial',
        confirmation_number: null,
      },
    ],
    error: null,
  });
}

function refundColumns(refunded: number, makeWhole: number) {
  mockRefundColumns.mockResolvedValue({
    data: { refunded_cents: refunded, make_whole_refunded_cents: makeWhole },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
});

describe('all-overflow checkout: refund status follows the refund, not the order status', () => {
  it('reads "issued" once the entry fees are recorded as refunded, fee kept', async () => {
    mockAllOverflowOrder();
    refundColumns(0, 9000);
    const result = await verifyCheckoutSession('cs_1');
    expect(result).toMatchObject({
      checkoutOutcome: 'full_overflow_refund',
      refundStatus: 'issued',
    });
  });

  it('counts a refund the webhook booked as post-hoc (a hand refund) too', async () => {
    mockAllOverflowOrder();
    refundColumns(9000, 0);
    expect(await verifyCheckoutSession('cs_1')).toMatchObject({ refundStatus: 'issued' });
  });

  it('stays "processing" before the refund settles, or while only part of it has', async () => {
    mockAllOverflowOrder();
    refundColumns(0, 0);
    expect(await verifyCheckoutSession('cs_1')).toMatchObject({ refundStatus: 'processing' });
    refundColumns(0, 5000);
    expect(await verifyCheckoutSession('cs_1')).toMatchObject({ refundStatus: 'processing' });
  });

  it('stays "processing" when the refund totals cannot be read', async () => {
    mockAllOverflowOrder();
    mockRefundColumns.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await verifyCheckoutSession('cs_1')).toMatchObject({ refundStatus: 'processing' });
  });

  it('still reads a legacy fully-refunded order as "issued"', async () => {
    mockAllOverflowOrder('refunded');
    expect(await verifyCheckoutSession('cs_1')).toMatchObject({ refundStatus: 'issued' });
  });

  it('tells the exhibitor the payment was refunded in full once the refund settles', async () => {
    mockAllOverflowOrder();
    refundColumns(0, 9000);
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={['/checkout/success?session_id=cs_1']}>
          <CheckoutSuccessPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(
        screen.getByText(/your payment has been refunded in full, service fee included/i)
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/being refunded/i)).not.toBeInTheDocument();
  });
});
