import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { RefundAllEntriesCard } from '../RefundAllEntriesCard';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// The count query chains .select(...).eq().eq().eq() and is awaited as
// { count, error }. A self-returning thenable models that.
function countChain(count: number) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.then = (resolve: (v: { count: number; error: null }) => unknown) =>
    resolve({ count, error: null });
  return chain;
}

const fromMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/supabase')>();
  return {
    ...original,
    supabase: Object.assign(
      Object.create(Object.getPrototypeOf(original.supabase)),
      original.supabase,
      { from: fromMock, functions: { invoke: vi.fn() } }
    ),
  };
});

const mockedInvoke = vi.mocked(supabase.functions.invoke);

beforeEach(() => {
  vi.clearAllMocks();
  fromMock.mockImplementation(() => countChain(3));
});

describe('RefundAllEntriesCard', () => {
  it('shows the refundable count', async () => {
    render(<RefundAllEntriesCard showId="show-1" />);
    expect(await screen.findByText(/3 online-paid entries can be refunded/i)).toBeInTheDocument();
  });

  it('disables the action and shows an empty state when nothing is refundable', async () => {
    fromMock.mockImplementation(() => countChain(0));
    render(<RefundAllEntriesCard showId="show-1" />);

    expect(await screen.findByText(/no online-paid entries to refund/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refund all entries/i })).toBeDisabled();
  });

  it('confirms before refunding, then invokes stripe-refund-show and shows the summary', async () => {
    mockedInvoke.mockResolvedValue({
      data: {
        refunded: [{ paymentIntentId: 'pi_1', amountCents: 8000, entryIds: ['a', 'b'] }],
        skipped: [{ entryId: 'c', reason: 'offline_paid' }],
        failed: [],
        summary: { intentsRefunded: 1, entriesRefunded: 2, skipped: 1, failed: 0 },
      },
      error: null,
    });
    const user = userEvent.setup();
    render(<RefundAllEntriesCard showId="show-42" />);

    await user.click(await screen.findByRole('button', { name: /refund all entries/i }));

    // Confirm dialog appears — nothing invoked yet.
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(mockedInvoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /yes, refund 3 entries/i }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('stripe-refund-show', {
        body: { show_id: 'show-42' },
      });
    });

    expect(await screen.findByText(/Refunded 2 entries across 1 payment/i)).toBeInTheDocument();
    expect(screen.getByText(/1 skipped/i)).toBeInTheDocument();
  });

  it('surfaces a failed count in the summary', async () => {
    mockedInvoke.mockResolvedValue({
      data: {
        refunded: [],
        skipped: [],
        failed: [{ paymentIntentId: 'pi_x', entryIds: ['z'], error: 'boom' }],
        summary: { intentsRefunded: 0, entriesRefunded: 0, skipped: 0, failed: 1 },
      },
      error: null,
    });
    const user = userEvent.setup();
    render(<RefundAllEntriesCard showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: /refund all entries/i }));
    await user.click(screen.getByRole('button', { name: /yes, refund/i }));

    expect(await screen.findByText(/1 failed — retry is safe/i)).toBeInTheDocument();
  });

  it('does NOT show a success toast when nothing was actually refunded (review #974 #3)', async () => {
    mockedInvoke.mockResolvedValue({
      data: {
        refunded: [],
        skipped: [
          { entryId: 'a', reason: 'offline_paid' },
          { entryId: 'b', reason: 'intent_partially_refunded' },
        ],
        failed: [],
        summary: { intentsRefunded: 0, entriesRefunded: 0, skipped: 2, failed: 0 },
      },
      error: null,
    });
    const user = userEvent.setup();
    render(<RefundAllEntriesCard showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: /refund all entries/i }));
    await user.click(screen.getByRole('button', { name: /yes, refund/i }));

    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/no refunds issued/i);
  });
});
