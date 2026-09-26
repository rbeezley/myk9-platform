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
});
