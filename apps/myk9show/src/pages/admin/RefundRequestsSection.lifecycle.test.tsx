// MYK9-991: the real component + real useRefundRequests + real QueryClient, with
// supabase mocked only at the client boundary. A first read that is paused
// (offline) is not "an empty queue".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { RefundRequestsSection } from './RefundRequestsSection';
import { REFUND_REQUESTS_QUERY_KEY } from '@/features/admin-system-health/useRefundRequests';

const { fromMock, queryResult } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  queryResult: { current: { data: [] as unknown[], error: null as unknown } },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: fromMock, functions: { invoke: vi.fn() } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const row = {
  id: 'rr-1',
  kind: 'abandoned_cart',
  status: 'pending',
  amount_cents: 4250,
  reason: 'cart_abandoned',
  stripe_payment_intent_id: 'pi_123',
  stripe_checkout_session_id: 'cs_123',
  created_at: '2026-10-01T00:00:00Z',
  last_failure: null,
};
const ROW_TEXT = 'Paid after the cart was abandoned';

function wireSupabase() {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.not = () => chain;
  chain.order = () => Promise.resolve(queryResult.current);
  fromMock.mockReturnValue(chain);
}

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

describe('RefundRequestsSection query lifecycle', () => {
  beforeEach(() => {
    fromMock.mockReset();
    queryResult.current = { data: [], error: null };
    wireSupabase();
  });
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('a fresh paused read never claims the queue is empty, then loads on reconnect without a remount', async () => {
    act(() => onlineManager.setOnline(false)); // an offline event was received
    queryResult.current = { data: [row], error: null };

    render(<RefundRequestsSection />, { queryClient: makeClient() });

    expect(await screen.findByText(/Can.t check refunds while offline/)).toBeInTheDocument();
    expect(screen.queryByText('No refunds waiting.')).not.toBeInTheDocument();
    expect(fromMock).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));

    expect(await screen.findByText(ROW_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/Can.t check refunds while offline/)).not.toBeInTheDocument();
  });

  it('claims an empty queue only after a successful empty response', async () => {
    render(<RefundRequestsSection />, { queryClient: makeClient() });
    expect(screen.getByRole('status', { name: /Loading refunds/ })).toBeInTheDocument();
    expect(screen.queryByText('No refunds waiting.')).not.toBeInTheDocument();
    expect(await screen.findByText('No refunds waiting.')).toBeInTheDocument();
  });

  it('lists a non-empty queue', async () => {
    queryResult.current = { data: [row], error: null };
    render(<RefundRequestsSection />, { queryClient: makeClient() });
    expect(await screen.findByText(ROW_TEXT)).toBeInTheDocument();
    expect(screen.queryByText('No refunds waiting.')).not.toBeInTheDocument();
  });

  it('shows a failed read with a working retry', async () => {
    queryResult.current = { data: [], error: new Error('boom') };
    const user = userEvent.setup();
    render(<RefundRequestsSection />, { queryClient: makeClient() });
    expect(await screen.findByText(/Couldn.t load refunds/)).toBeInTheDocument();
    expect(screen.queryByText('No refunds waiting.')).not.toBeInTheDocument();

    queryResult.current = { data: [row], error: null };
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(ROW_TEXT)).toBeInTheDocument();
  });

  it('keeps cached rows and flags them as possibly stale when a refetch is paused', async () => {
    const client = makeClient();
    queryResult.current = { data: [row], error: null };
    render(<RefundRequestsSection />, { queryClient: client });
    expect(await screen.findByText(ROW_TEXT)).toBeInTheDocument();

    act(() => onlineManager.setOnline(false));
    await act(async () => {
      void client.invalidateQueries({ queryKey: REFUND_REQUESTS_QUERY_KEY });
    });

    expect(await screen.findByText(/Showing the last queue we loaded/)).toBeInTheDocument();
    expect(screen.getByText(ROW_TEXT)).toBeInTheDocument();
    expect(screen.queryByText('No refunds waiting.')).not.toBeInTheDocument();
  });
});
