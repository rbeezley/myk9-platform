import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getUserEntries = vi.fn();
vi.mock('@/services/database/entries', () => ({
  getUserEntries: (...args: unknown[]) => getUserEntries(...args),
}));
vi.mock('@/hooks/useEntriesPersonId', () => ({
  useEntriesPersonId: () => 'person-1',
}));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { subscribe: () => () => undefined },
}));

import { useMyShowResults } from './useMyShowResults';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useMyShowResults (MYK9-1026)', () => {
  beforeEach(() => {
    getUserEntries.mockReset();
  });

  it("maps this show's own masked rows by entry id and ignores other shows", async () => {
    getUserEntries.mockResolvedValue({
      data: [
        {
          id: 'e1',
          show_id: 'show-1',
          is_scored: true,
          result_status: 'qualified',
          search_time_seconds: 58,
          total_faults: 2,
          class_results_released_at: null,
        },
        { id: 'e2', show_id: 'other', is_scored: true, result_status: 'qualified' },
      ],
      error: null,
      source: 'confirmed',
    });

    const { result } = renderHook(() => useMyShowResults('show-1'), { wrapper });

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(getUserEntries).toHaveBeenCalledWith('person-1');
    expect(result.current.get('e1')).toEqual({
      isScored: true,
      resultStatus: 'qualified',
      searchTimeSeconds: 58,
      totalFaults: 2,
      resultsReleasedAt: null,
    });
    expect(result.current.has('e2')).toBe(false);
  });

  it('answers with no results when the read fails', async () => {
    getUserEntries.mockResolvedValue({ data: [], error: new Error('boom'), source: 'confirmed' });

    const { result } = renderHook(() => useMyShowResults('show-1'), { wrapper });

    await waitFor(() => expect(getUserEntries).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });
});
