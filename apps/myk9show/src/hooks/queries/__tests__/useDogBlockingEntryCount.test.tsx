import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { entryInvalidationKeys } from '@/services/database/entries/invalidation';

const countBlockingEntriesByDog = vi.fn<(dogId: string) => Promise<number>>();

vi.mock('@/services/database/entries', () => ({
  getAllEntries: vi.fn(),
  getEntryById: vi.fn(),
  getEntriesByShow: vi.fn(),
  getPublicEntriesByShow: vi.fn(),
  getEntriesByClass: vi.fn(),
  getPublicEntriesByClass: vi.fn(),
  getEntriesByDog: vi.fn(),
  countActiveEntriesByDog: vi.fn(),
  countBlockingEntriesByDog: (dogId: string) => countBlockingEntriesByDog(dogId),
  getEntriesByStatus: vi.fn(),
  getEntriesForShow: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  updateEntryStatusWithAudit: vi.fn(),
  createMultipleEntries: vi.fn(),
  getEntryStatistics: vi.fn(),
  searchEntries: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1', is_anonymous: false }, loading: false }),
}));

const { useDogBlockingEntryCountQuery } = await import('@/hooks/queries/useEntriesDatabase');

/**
 * MYK9-600. The count that decides whether a delete is blocked is a money and
 * results fact — a paid entry that was just refunded, or a score that was just
 * cleared, changes the answer. Serving it from a five-minute cache meant the
 * delete dialog could confidently describe a state the database left minutes
 * ago, in either direction: refusing a delete that is now allowed, or offering
 * a plain Delete the server is about to reject.
 */
describe('useDogBlockingEntryCountQuery freshness', () => {
  beforeEach(() => {
    countBlockingEntriesByDog.mockReset().mockResolvedValue(0);
  });

  const makeWrapper = () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);
    return { client, wrapper };
  };

  it('re-reads the count every time the dialog opens, never from a warm cache', async () => {
    const { wrapper } = makeWrapper();

    const first = renderHook(() => useDogBlockingEntryCountQuery('dog-1', true), { wrapper });
    await waitFor(() => expect(countBlockingEntriesByDog).toHaveBeenCalledTimes(1));
    first.unmount();

    // A second open, immediately — well inside any stale window.
    const second = renderHook(() => useDogBlockingEntryCountQuery('dog-1', true), { wrapper });
    await waitFor(() => expect(countBlockingEntriesByDog).toHaveBeenCalledTimes(2));
    second.unmount();
  });
});

describe('blocking-count cache key reachability', () => {
  it('is invalidated by the shared entry-write key set', () => {
    // Every entry write — payment, refund, scratch, score — that uses React
    // Query routes through `entryInvalidationKeys`. React Query invalidates by
    // key PREFIX, so the blocking count is only reached if its key extends one
    // of these. Pin it: renaming the key or re-rooting it elsewhere would
    // silently strand the count behind every one of those mutations.
    const blockingCountKey = [...queryKeys.dogEntries('dog-1'), 'blocking-count'];
    const keys = entryInvalidationKeys({ dogId: 'dog-1' });

    const isPrefixOf = (prefix: readonly unknown[], full: readonly unknown[]) =>
      prefix.length <= full.length && prefix.every((part, i) => part === full[i]);

    expect(keys.some(k => isPrefixOf(k, blockingCountKey))).toBe(true);
  });
});
