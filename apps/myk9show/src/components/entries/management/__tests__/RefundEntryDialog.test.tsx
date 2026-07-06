import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { RefundEntryDialog } from '../RefundEntryDialog';
import { isStripeRefundable } from '../refundEligibility';
import { PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/supabase')>();
  return {
    ...original,
    supabase: Object.assign(
      Object.create(Object.getPrototypeOf(original.supabase)),
      original.supabase,
      {
        functions: { invoke: vi.fn() },
      }
    ),
  };
});

const suggestionMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/payments/useWithdrawalRefundSuggestion', () => ({
  useWithdrawalRefundSuggestion: () => suggestionMock(),
}));

const mockedInvoke = vi.mocked(supabase.functions.invoke);

const entry = {
  id: 'entry-1',
  dogName: 'Rex',
  totalFee: 50,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  paymentMethod: 'online',
  refundedAt: null,
} as unknown as EntryManagementEntry;

function renderDialog(onRefunded = vi.fn()) {
  render(
    <RefundEntryDialog open={true} onOpenChange={vi.fn()} entry={entry} onRefunded={onRefunded} />
  );
  return onRefunded;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no snapshot policy → dialog behaves exactly as before.
  suggestionMock.mockReturnValue({ data: undefined });
});

describe('RefundEntryDialog', () => {
  it('full refund invokes the function with NO amount (server refunds the exact fee)', async () => {
    mockedInvoke.mockResolvedValue({
      data: { refund_id: 're_1', amount_cents: 5000 },
      error: null,
    });
    const onRefunded = renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /issue refund/i }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('stripe-refund-entry', {
        body: { entry_id: 'entry-1', amount_cents: undefined, notes: undefined },
      });
    });
    expect(onRefunded).toHaveBeenCalled();
  });

  it('partial refund sends the exact cents amount', async () => {
    mockedInvoke.mockResolvedValue({
      data: { refund_id: 're_1', amount_cents: 2050 },
      error: null,
    });
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: /partial amount/i }));
    await user.type(screen.getByLabelText(/amount \(max/i), '20.50');
    await user.click(screen.getByRole('button', { name: /issue refund/i }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('stripe-refund-entry', {
        body: { entry_id: 'entry-1', amount_cents: 2050, notes: undefined },
      });
    });
  });

  it('caps the partial amount client-side before any network call', async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: /partial amount/i }));
    await user.type(screen.getByLabelText(/amount \(max/i), '60');
    await user.click(screen.getByRole('button', { name: /issue refund/i }));

    expect(await screen.findByText(/can.t exceed the entry fee/i)).toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('maps server validation codes to actionable language', async () => {
    mockedInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify({ error: 'payout_already_sent' }), { status: 422 }),
      }),
    });
    const onRefunded = renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /issue refund/i }));

    expect(await screen.findByText(/already been paid out to the club/i)).toBeInTheDocument();
    expect(onRefunded).not.toHaveBeenCalled();
  });

  it('states the one-refund-per-entry rule up front', () => {
    renderDialog();
    expect(screen.getByText(/refunds can only be issued once per entry/i)).toBeInTheDocument();
  });
});

describe('RefundEntryDialog — withdrawal policy pre-fill', () => {
  it('executes the accepted after-cutoff suggestion from the server snapshot', async () => {
    suggestionMock.mockReturnValue({
      data: {
        hasPolicy: true,
        refundCents: 4000, // $50 fee − $10 retained
        retainedCents: 1000,
        requiresManual: false,
        reason: 'after_cutoff',
        policy: null,
      },
    });
    mockedInvoke.mockResolvedValue({ data: { amount_cents: 4000 }, error: null });
    renderDialog();
    const user = userEvent.setup();

    // Partial mode is pre-selected with the suggested amount filled in.
    expect(await screen.findByText(/\$10\.00 is retained/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/amount \(max/i) as HTMLInputElement).value).toBe('40.00');

    // Submitting as-is asks the server to resolve the entry's stored snapshot.
    await user.click(screen.getByRole('button', { name: /issue refund/i }));
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('stripe-refund-entry', {
        body: {
          entry_id: 'entry-1',
          amount_cents: undefined,
          notes: undefined,
          use_policy_snapshot: true,
        },
      });
    });
  });

  it('sends an explicit amount when the secretary overrides the snapshot suggestion', async () => {
    suggestionMock.mockReturnValue({
      data: {
        hasPolicy: true,
        refundCents: 4000,
        retainedCents: 1000,
        requiresManual: false,
        reason: 'after_cutoff',
        policy: null,
      },
    });
    mockedInvoke.mockResolvedValue({ data: { amount_cents: 4500 }, error: null });
    renderDialog();
    const user = userEvent.setup();

    const amountInput = (await screen.findByLabelText(/amount \(max/i)) as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, '45.00');
    await user.click(screen.getByRole('button', { name: /issue refund/i }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('stripe-refund-entry', {
        body: { entry_id: 'entry-1', amount_cents: 4500, notes: undefined },
      });
    });
  });

  it('keeps full refund for a before-cutoff snapshot and shows the window message', () => {
    suggestionMock.mockReturnValue({
      data: {
        hasPolicy: true,
        refundCents: 5000,
        retainedCents: 0,
        requiresManual: false,
        reason: 'before_cutoff',
        policy: null,
      },
    });
    renderDialog();
    expect(screen.getByText(/within the full-refund window/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /full refund/i })).toBeChecked();
  });

  it('does NOT auto-select for a prose-only/unset policy (requiresManual) but still shows guidance', () => {
    suggestionMock.mockReturnValue({
      data: {
        hasPolicy: true,
        refundCents: 5000,
        retainedCents: 0,
        requiresManual: true,
        reason: 'no_cutoff',
        policy: null,
      },
    });
    renderDialog();
    expect(screen.getByText(/needs your judgment/i)).toBeInTheDocument();
    // No partial pre-fill — the secretary decides from the default full.
    expect(screen.getByRole('radio', { name: /full refund/i })).toBeChecked();
  });

  it('shows no policy message when the entry has no snapshot', () => {
    suggestionMock.mockReturnValue({
      data: {
        hasPolicy: false,
        refundCents: 5000,
        retainedCents: 0,
        requiresManual: true,
        reason: 'no_policy',
        policy: null,
      },
    });
    renderDialog();
    expect(screen.queryByText(/withdrawal policy/i)).not.toBeInTheDocument();
  });
});

describe('isStripeRefundable', () => {
  it('requires online payment method, paid-online status, and no prior refund', () => {
    expect(isStripeRefundable(entry)).toBe(true);
    expect(isStripeRefundable({ ...entry, paymentMethod: 'cash' })).toBe(false);
    expect(isStripeRefundable({ ...entry, paymentMethod: null })).toBe(false);
    expect(isStripeRefundable({ ...entry, paymentStatus: PaymentStatus.REFUNDED })).toBe(false);
    expect(isStripeRefundable({ ...entry, refundedAt: '2026-06-09T00:00:00Z' })).toBe(false);
  });
});
