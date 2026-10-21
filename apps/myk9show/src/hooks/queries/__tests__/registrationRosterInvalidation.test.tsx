/**
 * MYK9-1303: the dog rosters carry each dog's registrations, and the replica
 * listener now refreshes them only once per 15 s window. A registration add,
 * edit or delete on this device refreshes them at once, so an exhibitor who adds
 * a registration and goes straight to the entry wizard sees it.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { createTestQueryClient, renderHook } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { DOG_ROSTER_META } from '@/hooks/queries/dogRosterMeta';
import {
  useCreateRegistrationMutation,
  useDeleteRegistrationMutation,
  useUpdateRegistrationMutation,
} from '@/hooks/queries/useRegistrationsDatabase';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';

const direct = vi.hoisted(() => ({ updateRegistration: vi.fn() }));
vi.mock('@/services/database/registrations', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/registrations')>()),
  updateRegistration: direct.updateRegistration,
}));
vi.mock('@/services/database/registrations/editGuard', () => ({
  assertRegistrationEditable: vi.fn(async () => undefined),
}));

const ROSTER_KEY = [...queryKeys.dogs, 'person-1', 'own'];
const OWNER_ROSTER_KEY = queryKeys.personDogs('owner-1');
const DETAIL_KEY = queryKeys.dog('dog-1');

function setup() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(DETAIL_KEY, ['cached']);
  for (const key of [ROSTER_KEY, OWNER_ROSTER_KEY]) {
    queryClient
      .getQueryCache()
      .build(queryClient, { queryKey: key, meta: DOG_ROSTER_META })
      .setData(['cached']);
  }
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const rostersInvalidated = (queryClient: QueryClient) =>
  [ROSTER_KEY, OWNER_ROSTER_KEY].map(key => queryClient.getQueryState(key)?.isInvalidated);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a registration write refreshes the dog rosters at once (MYK9-1303)', () => {
  it('add', async () => {
    vi.spyOn(replicatedDogRegistrationsTable, 'addRegistration').mockResolvedValue({
      id: 'reg-1',
      dogId: 'dog-1',
      organization: 'AKC',
    } as never);
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useCreateRegistrationMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ dogId: 'dog-1', organization: 'AKC' } as never);
    });

    expect(rostersInvalidated(queryClient)).toEqual([true, true]);
    expect(queryClient.getQueryState(DETAIL_KEY)?.isInvalidated).toBe(false);
  });

  it('edit', async () => {
    direct.updateRegistration.mockResolvedValue({
      data: { id: 'reg-1', organization: 'AKC' },
      error: null,
    });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useUpdateRegistrationMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'reg-1', updates: { registered_name: 'New' } });
    });

    expect(rostersInvalidated(queryClient)).toEqual([true, true]);
  });

  it('delete', async () => {
    vi.spyOn(replicatedDogRegistrationsTable, 'deleteRegistration').mockResolvedValue(undefined);
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useDeleteRegistrationMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('reg-1');
    });

    expect(rostersInvalidated(queryClient)).toEqual([true, true]);
  });
});
