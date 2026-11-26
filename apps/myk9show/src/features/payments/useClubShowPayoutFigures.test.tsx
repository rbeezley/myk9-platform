import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
}));

import { useClubShowPayoutFigures } from './useClubShowPayoutFigures';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const fullyRefundedRow = {
  show_id: 'show-1',
  show_name: 'Spring Trial',
  show_end_date: '2026-11-01T00:00:00+00:00',
  show_deleted: false,
  collected_cents: 4000,
  refunded_cents: 4000,
  owed_cents: 0,
  payout_id: 'payout-1',
  payout_status: 'completed',
  payout_amount_cents: 0,
  payout_failure_reason: null,
  payout_completed_at: '2026-11-05T10:00:00Z',
  payout_created_at: '2026-11-04T10:00:00Z',
  paid_cents: 0,
};

describe('useClubShowPayoutFigures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks the server for this club and maps each row', async () => {
    rpc.mockResolvedValue({ data: [fullyRefundedRow], error: null });
    const { result } = renderHook(() => useClubShowPayoutFigures('club-1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('club_show_payout_figures', { p_club_id: 'club-1' });
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]).toMatchObject({
      showId: 'show-1',
      collectedCents: 4000,
      refundedCents: 4000,
      owedCents: 0,
      paid: { kind: 'none' },
      fullyRefunded: true,
    });
  });

  it('reads a refused or failed call as an error, never as an empty list', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'club_show_payout_figures: not authorized for this club' },
    });
    const { result } = renderHook(() => useClubShowPayoutFigures('club-1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('reads a missing result as an error', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useClubShowPayoutFigures('club-1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('does not call the server without a club', () => {
    const { result } = renderHook(() => useClubShowPayoutFigures(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(rpc).not.toHaveBeenCalled();
  });
});
