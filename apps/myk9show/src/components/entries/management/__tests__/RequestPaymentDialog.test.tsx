import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { RequestPaymentDialog } from '../RequestPaymentDialog';
import { isPaymentRequestable } from '../paymentRequestEligibility';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/supabase')>();
  return {
    ...original,
    supabase: Object.assign(
      Object.create(Object.getPrototypeOf(original.supabase)),
      original.supabase,
      { functions: { invoke: vi.fn() } }
    ),
  };
});

const mockedInvoke = vi.mocked(supabase.functions.invoke);

const entry = {
  id: 'entry-1',
  dogName: 'Rex',
  totalFee: 30,
  showId: 'show-1',
} as unknown as EntryManagementEntry;

function renderDialog(onRequested = vi.fn()) {
  render(
    <RequestPaymentDialog open={true} onOpenChange={vi.fn()} entry={entry} onRequested={onRequested} />
  );
  return onRequested;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RequestPaymentDialog', () => {
  it('generates a link for the entry and shows the fee-on-top breakdown', async () => {
    mockedInvoke.mockResolvedValue({
      data: {
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        session_id: 'cs_test_123',
        subtotal_cents: 3000,
        platform_fee_cents: 210,
        total_cents: 3210,
      },
      error: null,
    });

    const onRequested = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /generate link/i }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('stripe-payment-link', {
        body: {
          entry_ids: ['entry-1'],
          success_url: expect.stringContaining('/shows/show-1'),
          cancel_url: expect.stringContaining('/shows/show-1'),
        },
      });
    });

    // exact breakdown disclosed (no surprise: $30 entry + $2.10 fee = $32.10)
    expect(await screen.findByText('$30.00')).toBeInTheDocument();
    expect(screen.getByText('$2.10')).toBeInTheDocument();
    expect(screen.getByText('$32.10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://checkout.stripe.com/c/pay/cs_test_123')).toBeInTheDocument();
    expect(onRequested).toHaveBeenCalled();
  });

  it('surfaces the server error message and does not show a link', async () => {
    mockedInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'non-2xx',
        context: { json: async () => ({ error: "This club's payment account is not set up." }) },
      } as unknown as Error,
    });

    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /generate link/i }));

    expect(await screen.findByText(/payment account is not set up/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/payment link/i)).not.toBeInTheDocument();
  });
});

describe('isPaymentRequestable', () => {
  const active = { paymentStatus: PaymentStatus.PENDING, comped: false, entryStatus: EntryStatus.ACCEPTED };

  it('is true for a pending, active (unpaid) entry', () => {
    expect(isPaymentRequestable(active)).toBe(true);
  });

  it('is false once paid, and false for a comped entry', () => {
    expect(isPaymentRequestable({ ...active, paymentStatus: PaymentStatus.PAID_ONLINE })).toBe(false);
    expect(isPaymentRequestable({ ...active, paymentStatus: PaymentStatus.PAID_BY_CHECK })).toBe(false);
    expect(isPaymentRequestable({ ...active, comped: true })).toBe(false);
  });

  it('is false for a withdrawn / scratched / rejected entry even if still payment-pending (F1)', () => {
    expect(isPaymentRequestable({ ...active, entryStatus: EntryStatus.CANCELLED })).toBe(false);
    expect(isPaymentRequestable({ ...active, entryStatus: EntryStatus.SCRATCHED })).toBe(false);
    expect(isPaymentRequestable({ ...active, entryStatus: EntryStatus.REJECTED })).toBe(false);
  });

  it('matches the server inactive list for database-only lifecycle states', () => {
    const inactiveStatuses = ['absent', 'promotion-expired', 'cancelled'] as Array<
      EntryManagementEntry['entryStatus']
    >;

    for (const entryStatus of inactiveStatuses) {
      expect(isPaymentRequestable({ ...active, entryStatus })).toBe(false);
    }
  });
});
