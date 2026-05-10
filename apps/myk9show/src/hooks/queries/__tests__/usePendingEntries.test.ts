import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { getPendingEntries } from '@/services/database/entries';
import { usePendingEntries } from '../usePendingEntries';

vi.mock('@/services/database/entries', () => ({
  getPendingEntries: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: createTestQueryClient() }, children);
}

const mockEntry = {
  id: 'entry-1',
  showId: 'show-1',
  showName: 'Spring Trial 2026',
  className: 'Novice A',
  handlerName: 'John Smith',
  dogName: 'Buddy',
  submittedAt: '2026-04-15T10:00:00Z',
};

describe('usePendingEntries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches pending entries across all shows', async () => {
    vi.mocked(getPendingEntries).mockResolvedValue([mockEntry]);

    const { result } = renderHook(() => usePendingEntries(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getPendingEntries).toHaveBeenCalledWith(undefined);
    expect(result.current.data).toEqual([mockEntry]);
  });

  it('filters by showId when provided', async () => {
    vi.mocked(getPendingEntries).mockResolvedValue([]);

    const { result } = renderHook(() => usePendingEntries('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getPendingEntries).toHaveBeenCalledWith('show-1');
  });
});
