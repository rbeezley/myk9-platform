import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useMoveUpRequestsCount } from '../useMoveUpRequestsCount';

vi.mock('@/services/database/day-of-operations', () => ({
  getPendingMoveUpRequests: vi.fn(),
}));

import { getPendingMoveUpRequests } from '@/services/database/day-of-operations';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useMoveUpRequestsCount', () => {
  it('counts the pending move-up requests for the show', async () => {
    vi.mocked(getPendingMoveUpRequests).mockResolvedValue({
      data: [{ id: 'r1' }, { id: 'r2' }],
      error: null,
    } as never);

    const { result } = renderHook(() => useMoveUpRequestsCount('show-1'), { wrapper });

    await waitFor(() => expect(result.current.count).toBe(2));
    expect(getPendingMoveUpRequests).toHaveBeenCalledWith('show-1');
  });

  it('does not fetch, and reports 0, without a show id', () => {
    vi.mocked(getPendingMoveUpRequests).mockClear();
    const { result } = renderHook(() => useMoveUpRequestsCount(null), { wrapper });

    expect(result.current.count).toBe(0);
    expect(getPendingMoveUpRequests).not.toHaveBeenCalled();
  });

  // Codex finding on MYK9-795: `getPendingMoveUpRequests` returns `{ data: [],
  // error }` (not a throw, not `data: null`) on a failed read — see
  // move-up.ts's catch branch. Reporting `0` in that case asserts "nothing
  // needs attention" when the count is actually unknown (see
  // blockingEntryCount.ts / MYK9-600: unknown is not zero).
  it('reports an unknown count, not 0, when the move-up read fails', async () => {
    vi.mocked(getPendingMoveUpRequests).mockResolvedValue({
      data: [],
      error: new Error('read failed'),
    } as never);

    const { result } = renderHook(() => useMoveUpRequestsCount('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.count).toBeUndefined();
  });

  it('exposes a refetch so a caller can refresh the count after a move-up mutation', async () => {
    vi.mocked(getPendingMoveUpRequests).mockResolvedValue({
      data: [{ id: 'r1' }],
      error: null,
    } as never);

    const { result } = renderHook(() => useMoveUpRequestsCount('show-1'), { wrapper });

    await waitFor(() => expect(result.current.count).toBe(1));

    vi.mocked(getPendingMoveUpRequests).mockResolvedValue({
      data: [],
      error: null,
    } as never);
    await result.current.refetch();

    await waitFor(() => expect(result.current.count).toBe(0));
  });
});
