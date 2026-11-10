import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { RefundAllEntriesCard } from '../RefundAllEntriesCard';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { logger } from '@/services/LoggingService';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const fromMock = vi.hoisted(() => vi.fn());
const updateSpy = vi.hoisted(() => vi.fn());

// shows: .select('status').eq().single() → {data:{status}}; .update().eq() → {error:null}
function showsChain(status: string) {
  const selectChain: Record<string, unknown> = {};
  selectChain.eq = vi.fn(() => selectChain);
  selectChain.single = () => Promise.resolve({ data: { status }, error: null });
  return {
    select: vi.fn(() => selectChain),
    update: (vals: unknown) => {
      updateSpy(vals);
      return { eq: () => Promise.resolve({ error: null }) };
    },
  };
}

// entries: .select('id',{count,head}).eq().eq().eq() awaited as {count,error}
function entriesChain(count: number) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.then = (resolve: (v: { count: number; error: null }) => unknown) =>
    resolve({ count, error: null });
  return chain;
}

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

let currentStatus = 'cancelled';
let currentCount = 3;

beforeEach(() => {
  vi.clearAllMocks();
  currentStatus = 'cancelled';
  currentCount = 3;
  fromMock.mockImplementation((table: string) =>
    table === 'shows' ? showsChain(currentStatus) : entriesChain(currentCount)
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RefundAllEntriesCard — cancellation gate', () => {
  it('an ACTIVE show shows only the "mark cancelled" step, not the refund action', async () => {
    currentStatus = 'published';
    render(<RefundAllEntriesCard showId="show-1" />);

    expect(await screen.findByText(/mark it cancelled first/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark show as cancelled/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refund all entries/i })).not.toBeInTheDocument();
  });

  it('marking the show cancelled writes shows.status = cancelled', async () => {
    currentStatus = 'published';
    const user = userEvent.setup();
    render(<RefundAllEntriesCard showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: /mark show as cancelled/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ status: 'cancelled' }));
  });
});

describe('RefundAllEntriesCard — refund (cancelled show)', () => {
  it('shows the refundable count once cancelled', async () => {
    render(<RefundAllEntriesCard showId="show-1" />);
    expect(await screen.findByText(/3 online-paid entries can be refunded/i)).toBeInTheDocument();
  });

  it('disables refund when nothing is refundable', async () => {
    currentCount = 0;
    render(<RefundAllEntriesCard showId="show-1" />);
    expect(await screen.findByText(/no online-paid entries to refund/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refund all entries/i })).toBeDisabled();
  });

  it('confirms then invokes stripe-refund-show and shows the summary', async () => {
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

    // Aggregate counts alone are not the only presentation — per-entry detail
    // is available behind a disclosure (secretary INTENT: calm control, detail
    // only when needed).
    await user.click(screen.getByRole('button', { name: /view details/i }));
    expect(await screen.findByText(/entry c/i)).toBeInTheDocument();
    expect(screen.getByText(/paid by cash or check/i)).toBeInTheDocument();
  });

  it('identifies every skipped and failed entry in a mixed outcome (spec: refund-result-transparency)', async () => {
    mockedInvoke.mockResolvedValue({
      data: {
        refunded: [{ paymentIntentId: 'pi_ok', amountCents: 5000, entryIds: ['refunded-entry'] }],
        skipped: [{ entryId: 'skip-entry', reason: 'offline_paid' }],
        failed: [
          {
            paymentIntentId: 'pi_bad',
            entryIds: ['failed-entry'],
            error: 'card_declined: insufficient funds',
          },
        ],
        summary: { intentsRefunded: 1, entriesRefunded: 1, skipped: 1, failed: 1 },
      },
      error: null,
    });
    const user = userEvent.setup();
    render(<RefundAllEntriesCard showId="show-42" />);

    await user.click(await screen.findByRole('button', { name: /refund all entries/i }));
    await user.click(screen.getByRole('button', { name: /yes, refund/i }));

    await screen.findByText(/Refunded 1 entry across 1 payment/i);
    await user.click(screen.getByRole('button', { name: /view details/i }));

    // Skipped entry: identity + plain reason, not just a count.
    expect(await screen.findByText(/entry skip-entry/i)).toBeInTheDocument();
    expect(screen.getByText(/paid by cash or check/i)).toBeInTheDocument();

    // Failed payment: a plain line plus its entry ids. A "failed" row can be a
    // refund that went through (entry stamp failed), so nothing says it was not
    // refunded, and the raw id/error stay out of the main line.
    expect(
      screen.getByText(
        'This payment may not have been refunded. Run Refund all again: it will not refund anyone twice.'
      )
    ).toBeVisible();
    expect(screen.getByText(/entry failed-entry/i)).toBeInTheDocument();
    expect(screen.queryByText(/payment (was |is |has )?not (been )?refunded/i)).toBeNull();
    expect(screen.queryByText(/pi_bad/)).toBeNull();
    expect(screen.queryByText(/card_declined/)).toBeNull();
    expect(screen.queryByText(/offline_paid/)).toBeNull();

    // The exact failure stays available for support.
    await user.click(screen.getByRole('button', { name: /details for support/i }));
    expect(
      await screen.findByText('pi_bad: card_declined: insufficient funds')
    ).toBeInTheDocument();
    expect(screen.getByText('Skipped offline_paid: skip-entry')).toBeInTheDocument();
  });

  it('shows the summary with no empty detail sections on a clean run (spec: refund-result-transparency)', async () => {
    mockedInvoke.mockResolvedValue({
      data: {
        refunded: [{ paymentIntentId: 'pi_clean', amountCents: 5000, entryIds: ['e1'] }],
        skipped: [],
        failed: [],
        summary: { intentsRefunded: 1, entriesRefunded: 1, skipped: 0, failed: 0 },
      },
      error: null,
    });
    const user = userEvent.setup();
    render(<RefundAllEntriesCard showId="show-42" />);

    await user.click(await screen.findByRole('button', { name: /refund all entries/i }));
    await user.click(screen.getByRole('button', { name: /yes, refund/i }));

    await screen.findByText(/Refunded 1 entry across 1 payment/i);

    // No skipped/failed detail disclosure at all — a clean run stays compact.
    expect(screen.queryByRole('button', { name: /view details/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/skipped/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
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

  // MYK9-1824: a failed Refund all can follow refunds that went through. The secretary
  // sees a fixed sentence (never the server's text) and a known code keeps its message.
  async function runRefundAll() {
    const user = userEvent.setup();
    render(<RefundAllEntriesCard showId="show-1" />);
    await user.click(await screen.findByRole('button', { name: /refund all entries/i }));
    await user.click(screen.getByRole('button', { name: /yes, refund/i }));
  }

  it('an unknown failure shows the fixed sentence, not the raw text, and logs it', async () => {
    const logSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const invokeError = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(
        JSON.stringify({ error: 'Could not load the show’s entries — try again.' }),
        { status: 500 }
      ),
    });
    mockedInvoke.mockResolvedValue({ data: null, error: invokeError });

    await runRefundAll();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'We could not finish refunding all entries. Some refunds may already have gone through. Run Refund all again: it will not refund anyone twice.'
      )
    );
    expect(logSpy).toHaveBeenCalledWith(
      'Refund all failed',
      'secretary',
      { code: 'Could not load the show’s entries — try again.' },
      invokeError
    );
  });

  it.each([
    ['show_not_cancelled', 422, 'Mark the show cancelled before refunding all entries.'],
    // Refused before any refund is made: must not say some may have gone through.
    [
      'money_operation_in_progress',
      409,
      'Another payout or refund is already running for this show. Try again in a moment.',
    ],
    ['money_lock_failed', 500, 'We could not safely start the refunds. Try again in a moment.'],
  ])('the known code %s keeps its own plain message', async (code, status, copy) => {
    mockedInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify({ error: code }), { status }),
      }),
    });

    await runRefundAll();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(copy));
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('may already have'));
  });
});
