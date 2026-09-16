import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { entryInvalidationKeys } from '@/services/database/entries/invalidation';
import { toBlockingEntryCountState } from '@/components/dogs/common/blockingEntryCount';

const countBlockingEntriesByDog = vi.fn<(dogId: string) => Promise<number>>();
const countActiveEntriesByDog = vi.fn<(dogId: string) => Promise<number>>();

vi.mock('@/services/database/entries', () => ({
  getAllEntries: vi.fn(),
  getEntryById: vi.fn(),
  getEntriesByShow: vi.fn(),
  getPublicEntriesByShow: vi.fn(),
  getEntriesByClass: vi.fn(),
  getPublicEntriesByClass: vi.fn(),
  getEntriesByDog: vi.fn(),
  countActiveEntriesByDog: (dogId: string) => countActiveEntriesByDog(dogId),
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

const {
  useDogBlockingEntryCountQuery,
  useDogActiveEntryCountQuery,
  dogBlockingEntryCountKey,
  dogActiveEntryCountKey,
} = await import('@/hooks/queries/useEntriesDatabase');

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

  it("re-reads on the app's actual path: close and re-open without unmounting", async () => {
    // This is the case that matters. `DogDialogs` calls the hook
    // unconditionally and toggles `enabled` with the dialog, so the observer
    // never unmounts and `refetchOnMount` never fires — a second open is an
    // ENABLE transition. `staleTime: 0` is what makes React Query refetch here,
    // and the remount test above cannot see that.
    const { wrapper } = makeWrapper();

    const view = renderHook(
      ({ open }: { open: boolean }) => useDogBlockingEntryCountQuery('dog-1', open),
      { wrapper, initialProps: { open: true } }
    );
    await waitFor(() => expect(countBlockingEntriesByDog).toHaveBeenCalledTimes(1));

    view.rerender({ open: false });
    view.rerender({ open: true });

    await waitFor(() => expect(countBlockingEntriesByDog).toHaveBeenCalledTimes(2));
    view.unmount();
  });
});

/**
 * The composed defect (MYK9-600 round-2 review): the real observer feeding the
 * real mapper. Neither half is wrong on its own, which is why a unit test on
 * either alone missed it. `DogDialogs` keeps the observer mounted and toggles
 * `enabled`, and React Query RETAINS `data` through `enabled: false` — `gcTime`
 * collects only at zero observers. So on re-open the mapper saw
 * `isError: false, data: <the previous dog-open's number>` and reported a
 * confident `ready` for the whole refetch window: an enabled Delete and "This
 * action cannot be undone." over a count that may already be 1.
 */
describe('blocking count across a close/re-open, mapped', () => {
  beforeEach(() => {
    countBlockingEntriesByDog.mockReset().mockResolvedValue(0);
  });

  it('reports pending, not a stale ready, until the re-open refetch lands', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const view = renderHook(
      ({ open }: { open: boolean }) => useDogBlockingEntryCountQuery('dog-1', open),
      { wrapper, initialProps: { open: true } }
    );

    await waitFor(() =>
      expect(toBlockingEntryCountState(view.result.current)).toEqual({
        status: 'ready',
        count: 0,
      })
    );

    // The dialog closes; the entry is paid meanwhile; the dialog re-opens.
    view.rerender({ open: false });
    countBlockingEntriesByDog.mockResolvedValue(1);
    view.rerender({ open: true });

    // THE moment that mattered: a refetch is in flight over a retained 0.
    expect(toBlockingEntryCountState(view.result.current)).toEqual({ status: 'pending' });

    await waitFor(() =>
      expect(toBlockingEntryCountState(view.result.current)).toEqual({
        status: 'ready',
        count: 1,
      })
    );
    view.unmount();
  });
});

describe('delete-dialog count cache keys', () => {
  // These assert the EXACT key the hooks use, read from the builders the hooks
  // themselves call — not from a literal retyped here. The earlier version of
  // this test rebuilt the key locally and then checked it against
  // `entryInvalidationKeys`, which always emits the bare `['entries']` root:
  // that prefix-matches anything entry-rooted, so re-rooting the hook's key to
  // `['entries', 'blocking-count', dogId]` left the test green while stranding
  // the count behind every per-dog invalidation. It also never varied `dogId`.
  //
  // Mutation-checked: changing `dogBlockingEntryCountKey` to
  // `['entries', 'blocking-count', dogId]` turns the first two cases below red,
  // and changing the hook's `queryKey` away from the builder turns the third red.
  it('is exactly the dogEntries key plus a discriminator', () => {
    expect(dogBlockingEntryCountKey('dog-1')).toEqual([
      ...queryKeys.dogEntries('dog-1'),
      'blocking-count',
    ]);
    expect(dogActiveEntryCountKey('dog-1')).toEqual([
      ...queryKeys.dogEntries('dog-1'),
      'active-count',
    ]);
  });

  it('is invalidated by a per-dog entry write, and only for that dog', () => {
    const isPrefixOf = (prefix: readonly unknown[], full: readonly unknown[]) =>
      prefix.length <= full.length && prefix.every((part, i) => part === full[i]);

    // The bare `['entries']` root matches everything entry-rooted, so it proves
    // nothing about this key. Ask the question that can actually fail: does a
    // write to THIS dog reach it, and does a write to another dog not?
    const perDogKeys = entryInvalidationKeys({ dogId: 'dog-1' }).filter(k => k.length > 1);
    const otherDogKeys = entryInvalidationKeys({ dogId: 'dog-2' }).filter(k => k.length > 1);

    expect(perDogKeys.some(k => isPrefixOf(k, dogBlockingEntryCountKey('dog-1')))).toBe(true);
    expect(perDogKeys.some(k => isPrefixOf(k, dogActiveEntryCountKey('dog-1')))).toBe(true);
    expect(otherDogKeys.some(k => isPrefixOf(k, dogBlockingEntryCountKey('dog-1')))).toBe(false);
  });

  it('is the key the hook actually registers in the cache', async () => {
    // The builder could be correct and the hook could still spell its own key
    // inline. Look the query up in the real cache by the builder's key.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const view = renderHook(() => useDogBlockingEntryCountQuery('dog-1', true), { wrapper });
    await waitFor(() => expect(countBlockingEntriesByDog).toHaveBeenCalled());

    expect(
      client.getQueryCache().find({ queryKey: dogBlockingEntryCountKey('dog-1') })
    ).toBeDefined();
    view.unmount();
  });
});

/**
 * The active count feeds the SAME dialog's "…and N entries." sentence — the
 * user's only statement of what the delete destroys — so it gets the same
 * freshness as the blocking count (MYK9-600 round-1 review).
 */
describe('useDogActiveEntryCountQuery freshness', () => {
  beforeEach(() => {
    countActiveEntriesByDog.mockReset().mockResolvedValue(0);
  });

  it('re-reads on a re-open without an unmount', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const view = renderHook(
      ({ open }: { open: boolean }) => useDogActiveEntryCountQuery('dog-1', open),
      {
        wrapper,
        initialProps: { open: true },
      }
    );
    await waitFor(() => expect(countActiveEntriesByDog).toHaveBeenCalledTimes(1));

    view.rerender({ open: false });
    view.rerender({ open: true });
    await waitFor(() => expect(countActiveEntriesByDog).toHaveBeenCalledTimes(2));
    view.unmount();
  });
});
