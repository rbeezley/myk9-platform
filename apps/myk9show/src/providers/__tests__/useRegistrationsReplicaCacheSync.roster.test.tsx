/**
 * MYK9-1303: the dog rosters are refreshed at most once per 15 s window after a
 * registrations-replica change; every other registration read keeps the short
 * debounce.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createTestQueryClient, renderHook } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { DOG_ROSTER_META } from '@/hooks/queries/dogRosterMeta';
import {
  REGISTRATION_REFRESH_COALESCE_MS,
  ROSTER_REFRESH_COALESCE_MS,
  useRegistrationsReplicaCacheSync,
} from '../useRegistrationsReplicaCacheSync';

const { subscribers } = vi.hoisted(() => ({ subscribers: [] as Array<() => void> }));

vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    subscribe: (callback: () => void) => {
      subscribers.push(callback);
      return () => {
        subscribers.splice(subscribers.indexOf(callback), 1);
      };
    },
  },
}));

const ROSTER_KEY = [...queryKeys.dogs, 'person-1', 'own'];
const OWNER_ROSTER_KEY = queryKeys.personDogs('owner-1');
const DETAIL_KEY = queryKeys.dog('dog-1');

function mount() {
  const queryClient = createTestQueryClient();
  // A roster read is tagged by its hook; detail reads are not.
  queryClient.setQueryData(DETAIL_KEY, ['cached']);
  for (const key of [ROSTER_KEY, OWNER_ROSTER_KEY]) {
    queryClient
      .getQueryCache()
      .build(queryClient, { queryKey: key, meta: DOG_ROSTER_META })
      .setData(['cached']);
  }
  const view = renderHook(() => useRegistrationsReplicaCacheSync(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { queryClient, ...view };
}

const isInvalidated = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated ?? false;

const rostersInvalidated = (queryClient: QueryClient) =>
  [ROSTER_KEY, OWNER_ROSTER_KEY].map(key => isInvalidated(queryClient, key));

const change = () => subscribers.forEach(callback => callback());

const fresh = (queryClient: QueryClient) => {
  queryClient.setQueryData(ROSTER_KEY, ['fresh']);
  queryClient.setQueryData(OWNER_ROSTER_KEY, ['fresh']);
};

describe('dog roster refresh: leading edge, then one trailing per window (MYK9-1303)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribers.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('changes at 0, 5 and 10 s refresh the rosters at ~0.15 s and 15 s, not at 5 or 10', async () => {
    const { queryClient } = mount();

    change();
    await vi.advanceTimersByTimeAsync(REGISTRATION_REFRESH_COALESCE_MS);
    expect(rostersInvalidated(queryClient)).toEqual([true, true]);
    fresh(queryClient);

    await vi.advanceTimersByTimeAsync(5_000 - REGISTRATION_REFRESH_COALESCE_MS);
    change();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(rostersInvalidated(queryClient)).toEqual([false, false]);
    change();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(rostersInvalidated(queryClient)).toEqual([false, false]);

    // The window opened at ~0.15 s ends at ~15.15 s; the trailing refresh lands there.
    await vi.advanceTimersByTimeAsync(REGISTRATION_REFRESH_COALESCE_MS + 1);
    expect(rostersInvalidated(queryClient)).toEqual([true, true]);
    fresh(queryClient);

    // Idle again: nothing follows without a new change.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rostersInvalidated(queryClient)).toEqual([false, false]);
  });

  it('a lone change refreshes the rosters once', async () => {
    const { queryClient } = mount();
    const cancels = vi.spyOn(queryClient, 'cancelQueries');

    change();
    // The replica notices a change on a leading and a trailing edge.
    await vi.advanceTimersByTimeAsync(100);
    change();
    await vi.advanceTimersByTimeAsync(ROSTER_REFRESH_COALESCE_MS * 2);

    expect(rostersInvalidated(queryClient)).toEqual([true, true]);
    // 4 other-read filters, once, plus the roster filter, once.
    expect(cancels).toHaveBeenCalledTimes(5);
  });

  it('a change after the window is idle again refreshes at once', async () => {
    const { queryClient } = mount();
    change();
    await vi.advanceTimersByTimeAsync(
      ROSTER_REFRESH_COALESCE_MS + REGISTRATION_REFRESH_COALESCE_MS
    );
    fresh(queryClient);

    change();
    await vi.advanceTimersByTimeAsync(REGISTRATION_REFRESH_COALESCE_MS);

    expect(rostersInvalidated(queryClient)).toEqual([true, true]);
  });

  it('keeps the other registration reads on the short debounce', async () => {
    const { queryClient } = mount();
    change();
    await vi.advanceTimersByTimeAsync(REGISTRATION_REFRESH_COALESCE_MS);
    fresh(queryClient);
    change();
    await vi.advanceTimersByTimeAsync(REGISTRATION_REFRESH_COALESCE_MS);

    expect(isInvalidated(queryClient, DETAIL_KEY)).toBe(true);
    // The second change is inside the window: the rosters wait for the trailing refresh.
    expect(rostersInvalidated(queryClient)).toEqual([false, false]);
  });

  it('unmounting cancels the pending trailing refresh', async () => {
    const { queryClient, unmount } = mount();
    change();
    await vi.advanceTimersByTimeAsync(REGISTRATION_REFRESH_COALESCE_MS);
    fresh(queryClient);
    change();
    await vi.advanceTimersByTimeAsync(REGISTRATION_REFRESH_COALESCE_MS);
    unmount();
    await vi.advanceTimersByTimeAsync(ROSTER_REFRESH_COALESCE_MS * 2);

    expect(rostersInvalidated(queryClient)).toEqual([false, false]);
  });
});
