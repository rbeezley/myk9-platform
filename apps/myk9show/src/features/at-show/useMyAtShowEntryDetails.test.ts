import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMyAtShowEntryDetails } from './useMyAtShowEntryDetails';
import { replicatedEntriesTable } from '@/services/replication';
import type { AtShowClassSummary } from './myAtShowEntryDetails.helpers';

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(),
    subscribe: vi.fn(),
  },
}));

const emptyClasses: ReadonlyMap<string, AtShowClassSummary> = new Map();

describe('useMyAtShowEntryDetails — reconciles via table subscription, not a specific mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  it('subscribes to replicatedEntriesTable and refetches when the table changes — regardless of which surface wrote it', async () => {
    let subscribedCallback: (() => void) | undefined;
    vi.mocked(replicatedEntriesTable.subscribe).mockImplementation(cb => {
      subscribedCallback = cb;
      return vi.fn();
    });
    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([]);

    renderHook(() => useMyAtShowEntryDetails('show-1', new Set(['entry-1']), false, emptyClasses), {
      wrapper,
    });

    await waitFor(() => {
      expect(replicatedEntriesTable.getEntriesByShow).toHaveBeenCalledTimes(1);
    });
    expect(subscribedCallback).toBeDefined();

    // Simulate ANY write reaching the table (ringside entry-list page,
    // ClassResultsTable, replication sync of a self-checkin RPC — the
    // subscription doesn't care which).
    subscribedCallback?.();

    await waitFor(() => {
      expect(replicatedEntriesTable.getEntriesByShow).toHaveBeenCalledTimes(2);
    });
  });

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn();
    vi.mocked(replicatedEntriesTable.subscribe).mockReturnValue(unsubscribe);
    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([]);

    const { unmount } = renderHook(
      () => useMyAtShowEntryDetails('show-1', new Set(['entry-1']), false, emptyClasses),
      { wrapper }
    );

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
