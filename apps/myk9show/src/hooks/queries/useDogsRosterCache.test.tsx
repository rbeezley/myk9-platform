import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queryClient';
import { DOG_ROSTER_QUERY_TIMING, useDogsByOwnerQuery, useDogsQuery } from './useDogsDatabase';

/**
 * MYK9-1303: the roster reads cost ~1 s each on the server. Every mount of one
 * key shares one fetch, a remount inside the 5 minute window does not refetch,
 * and a dog write still does.
 */

const { mockGetAllDogs, mockGetDogsByOwner } = vi.hoisted(() => ({
  mockGetAllDogs: vi.fn(),
  mockGetDogsByOwner: vi.fn(),
}));

vi.mock('@/services/database/dogs', () => ({
  getAllDogs: mockGetAllDogs,
  getDogById: vi.fn(),
  getDogsByOwner: mockGetDogsByOwner,
  createDog: vi.fn(),
  updateDog: vi.fn(),
  deleteDog: vi.fn(),
  searchDogs: vi.fn(),
  getDogStatistics: vi.fn(),
  getOwnedLiveDogsByPerson: vi.fn(),
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { delete: vi.fn() },
}));
vi.mock('@/hooks/useCurrentPersonId', () => ({ useCurrentPersonId: () => 'person-1' }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    getUserRoles: () => ['exhibitor'],
    hasRole: () => false,
    userWithRoles: { id: 'user-1' },
  }),
}));

const OWNER = 'owner-1';
const FIVE_MINUTES = 5 * 60 * 1000;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('dog roster query cache (MYK9-1303)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllDogs.mockResolvedValue({ data: [{ id: 'd1' }], error: null });
    mockGetDogsByOwner.mockResolvedValue({ data: [{ id: 'd1' }], error: null });
  });

  it('states a 5 minute staleTime and a gcTime at least as long', () => {
    expect(DOG_ROSTER_QUERY_TIMING.staleTime).toBe(FIVE_MINUTES);
    expect(DOG_ROSTER_QUERY_TIMING.gcTime).toBeGreaterThanOrEqual(FIVE_MINUTES);
  });

  it('applies the timing to both roster queries', async () => {
    const { queryClient, wrapper } = setup();
    renderHook(() => useDogsQuery(), { wrapper });
    renderHook(() => useDogsByOwnerQuery(OWNER), { wrapper });
    await waitFor(() => expect(mockGetDogsByOwner).toHaveBeenCalled());
    await waitFor(() => expect(mockGetAllDogs).toHaveBeenCalled());

    const queries = queryClient.getQueryCache().getAll();
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      // The cache widens the options type; the roster hooks set both fields.
      const options = query.options as { staleTime?: number; gcTime?: number };
      expect(options.staleTime).toBe(FIVE_MINUTES);
      expect(options.gcTime).toBeGreaterThanOrEqual(FIVE_MINUTES);
    }
  });

  it('several mounts of the same roster share one fetch', async () => {
    const { wrapper } = setup();
    renderHook(() => useDogsByOwnerQuery(OWNER), { wrapper });
    renderHook(() => useDogsByOwnerQuery(OWNER), { wrapper });
    renderHook(() => useDogsQuery(), { wrapper });
    renderHook(() => useDogsQuery(), { wrapper });
    await waitFor(() => expect(mockGetDogsByOwner).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockGetAllDogs).toHaveBeenCalledTimes(1));
  });

  it('a remount within the window does not refetch either roster', async () => {
    const { wrapper } = setup();
    const first = renderHook(() => ({ owned: useDogsByOwnerQuery(OWNER), all: useDogsQuery() }), {
      wrapper,
    });
    await waitFor(() => expect(first.result.current.owned.isSuccess).toBe(true));
    await waitFor(() => expect(first.result.current.all.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => ({ owned: useDogsByOwnerQuery(OWNER), all: useDogsQuery() }), {
      wrapper,
    });
    await waitFor(() => expect(second.result.current.owned.isSuccess).toBe(true));

    expect(second.result.current.owned.isFetching).toBe(false);
    expect(mockGetDogsByOwner).toHaveBeenCalledTimes(1);
    expect(mockGetAllDogs).toHaveBeenCalledTimes(1);
  });

  it('a dog write invalidation still refetches both rosters', async () => {
    const { queryClient, wrapper } = setup();
    const view = renderHook(() => ({ owned: useDogsByOwnerQuery(OWNER), all: useDogsQuery() }), {
      wrapper,
    });
    await waitFor(() => expect(view.result.current.owned.isSuccess).toBe(true));
    await waitFor(() => expect(view.result.current.all.isSuccess).toBe(true));

    await queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
    await queryClient.invalidateQueries({ queryKey: queryKeys.personDogs(OWNER) });

    await waitFor(() => expect(mockGetAllDogs).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockGetDogsByOwner).toHaveBeenCalledTimes(2));
  });
});
