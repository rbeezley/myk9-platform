import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useDogStoreCompat } from './useDogStoreCompat';
import { mockSupabase } from '@/test/mocks/supabase';
import type { DogInput } from '@/store/dogStore';
import { queryKeys } from '@/lib/queryClient';
import { fromAny } from '@total-typescript/shoehorn';

// ---------------------------------------------------------------------------
// Module-level mocks — use vi.hoisted so factories can reference these vars
// after vi.mock hoisting.
// ---------------------------------------------------------------------------

const { mockReplicatedDogsTable, mockMutateAsync, mockUpdateMutateAsync } = vi.hoisted(() => ({
  mockReplicatedDogsTable: {
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getDogById: vi.fn().mockResolvedValue(null),
  },
  mockMutateAsync: vi.fn(),
  mockUpdateMutateAsync: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockReplicatedDogsTable,
}));

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: () => ({
    data: [],
    isLoading: false,
    error: null,
    isStale: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useDogQuery: () => ({
    data: null,
    isLoading: false,
    error: null,
    isStale: false,
    refetch: vi.fn(),
  }),
  useDogsByOwnerQuery: () => ({
    data: [],
    isLoading: false,
    error: null,
    isStale: false,
    refetch: vi.fn(),
  }),
  useCreateDogMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false, error: null }),
  useUpdateDogMutation: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
    error: null,
  }),
  useDeleteDogMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDogStatisticsQuery: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/hooks/dogStoreCompatHelpers', () => ({
  syncDogRegistrations: vi.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

const minimalDogInput: DogInput = {
  name: 'Buddy',
  breed: 'Labrador',
  sex: 'male',
  ownerId: 'owner-123',
};

const dogInputWithRegistrations: DogInput = {
  ...minimalDogInput,
  registrations: [
    {
      organization: 'AKC',
      registeredName: 'CH Buddy the Great',
      number: 'AKC123',
      type: 'Labrador',
      status: 'active',
    },
  ],
};

const mockDbDogRow = {
  id: 'dog-abc',
  name: 'Buddy',
  breed: 'Labrador',
  sex: 'male',
  owner_id: 'owner-123',
  call_name: null,
  date_of_birth: null,
  color: null,
  weight: null,
  height: null,
  microchip_number: null,
  image_url: null,
  spayed_neutered: null,
  deceased: false,
  deceased_date: null,
  status: 'active',
  registrations: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockReplicatedDogsTable.set.mockResolvedValue(undefined);
  mockReplicatedDogsTable.delete.mockResolvedValue(undefined);
  mockMutateAsync.mockResolvedValue(mockDbDogRow);
  mockSupabase.rpc.mockImplementation(
    fromAny((_name: string, args?: { p_dog?: { id?: string } }) =>
      Promise.resolve({ data: args?.p_dog?.id ?? 'dog-abc', error: null })
    )
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDogStoreCompat.addDog — atomic RPC path (with registrations)', () => {
  it('calls create_dog_with_registrations RPC instead of the direct mutation', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog(dogInputWithRegistrations);
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'create_dog_with_registrations',
      expect.objectContaining({
        // MYK9-90 §5.3 — the RPC payload carries the call name and NOT the
        // legacy `dogs.name`. `minimalDogInput` supplies only `name`, which the
        // input mapper treats as the call name (the required identifier).
        p_dog: expect.not.objectContaining({ name: expect.anything() }),
        p_registrations: expect.anything(),
      })
    );
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'create_dog_with_registrations',
      expect.objectContaining({
        p_dog: expect.objectContaining({ call_name: 'Buddy', owner_id: 'owner-123' }),
        p_registrations: expect.arrayContaining([
          expect.objectContaining({
            organization: 'AKC',
            registered_name: 'CH Buddy the Great',
            registration_number: 'AKC123',
          }),
        ]),
      })
    );
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('writes to IDB and calls the RPC', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog(dogInputWithRegistrations);
    });

    expect(mockReplicatedDogsTable.set).toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalled();
  });

  it('rolls back IDB when the RPC returns an error', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'DB error', code: '23505' },
    });

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.addDog(dogInputWithRegistrations)).rejects.toBeDefined();
    });

    expect(mockReplicatedDogsTable.delete).toHaveBeenCalled();
  });

  it('removes the optimistic dog when the RPC returns an existing dog id', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: 'existing-dog-id', error: null });
    mockReplicatedDogsTable.getDogById.mockResolvedValue({
      id: 'existing-dog-id',
      name: 'Buddy',
      callName: 'Buddy',
      breed: 'Labrador',
      sex: 'male',
      ownerId: 'owner-123',
    });

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    let savedId = '';
    await act(async () => {
      const saved = await result.current.addDog(dogInputWithRegistrations);
      savedId = saved.id;
    });

    expect(savedId).toBe('existing-dog-id');
    expect(mockReplicatedDogsTable.delete).toHaveBeenCalled();
    expect(mockReplicatedDogsTable.getDogById).toHaveBeenCalledWith('existing-dog-id');
  });

  it('skips registrations with no registeredName from the RPC payload', async () => {
    const inputWithBlankReg: DogInput = {
      ...minimalDogInput,
      registrations: [
        {
          organization: 'AKC',
          registeredName: '',
          number: '',
          type: 'Labrador',
          status: 'pending',
        },
        {
          organization: 'UKC',
          registeredName: 'Buddy UKC',
          number: 'UKC456',
          type: 'Labrador',
          status: 'active',
        },
      ],
    };

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog(inputWithBlankReg);
    });

    const rpcCall = fromAny<unknown[][], unknown>(mockSupabase.rpc.mock.calls).find(
      call => call[0] === 'create_dog_with_registrations'
    );
    const payload = rpcCall?.[1] as { p_registrations: { registered_name: string }[] };
    expect(payload.p_registrations).toHaveLength(1);
    expect(payload.p_registrations[0].registered_name).toBe('Buddy UKC');
  });
});

describe('useDogStoreCompat.addDog — existing path (no registrations)', () => {
  it('calls createMutation.mutateAsync instead of the RPC when no registrations', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog(minimalDogInput);
    });

    expect(mockMutateAsync).toHaveBeenCalled();
    const rpcCalls = fromAny<unknown[][], unknown>(mockSupabase.rpc.mock.calls).filter(
      call => call[0] === 'create_dog_with_registrations'
    );
    expect(rpcCalls).toHaveLength(0);
  });

  it('rolls back IDB when createMutation throws', async () => {
    mockMutateAsync.mockRejectedValue(new Error('insert failed'));

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.addDog(minimalDogInput)).rejects.toThrow('insert failed');
    });

    expect(mockReplicatedDogsTable.delete).toHaveBeenCalled();
  });
});

describe('useDogStoreCompat.updateDog — roster refresh (MYK9-1061)', () => {
  // A real roster query under the production key shape (prefix + personId + scope)
  // whose queryFn reads the "IndexedDB" the local write lands in.
  const setup = () => {
    let storedBirthDate: string | undefined = '2020-01-01';
    mockReplicatedDogsTable.getDogById.mockImplementation(async () => ({
      id: 'dog-abc',
      ownerId: 'owner-123',
      dateOfBirth: storedBirthDate,
    }));
    mockReplicatedDogsTable.set.mockImplementation(
      async (_id: string, dog: { dateOfBirth?: string }) => {
        storedBirthDate = dog.dateOfBirth;
      }
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 5 * 60 * 1000 },
        mutations: { retry: false },
      },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(
      () => ({
        compat: useDogStoreCompat(),
        roster: useQuery({
          queryKey: [...queryKeys.dogs, 'owner-123', 'scope'],
          queryFn: async () => storedBirthDate,
        }),
      }),
      { wrapper }
    );
    return { result, client };
  };

  it('refetches the roster with the new date while the network write is pending', async () => {
    mockUpdateMutateAsync.mockReturnValue(new Promise(() => {}));
    const { result } = setup();
    await vi.waitFor(() => expect(result.current.roster.data).toBe('2020-01-01'));

    await act(async () => {
      await result.current.compat.updateDog('dog-abc', { birthDate: '2021-02-03' });
    });

    await vi.waitFor(() => expect(result.current.roster.data).toBe('2021-02-03'));
  });

  it('keeps the new date after the network write rejects', async () => {
    mockUpdateMutateAsync.mockRejectedValue(new Error('offline'));
    const { result } = setup();
    await vi.waitFor(() => expect(result.current.roster.data).toBe('2020-01-01'));

    await act(async () => {
      await result.current.compat.updateDog('dog-abc', { birthDate: '2021-02-03' });
    });

    await vi.waitFor(() => expect(result.current.roster.data).toBe('2021-02-03'));
    expect(mockUpdateMutateAsync).toHaveBeenCalled();
  });

  it('invalidates the dogs prefix and the owner person-dogs key', async () => {
    mockUpdateMutateAsync.mockReturnValue(new Promise(() => {}));
    const { result, client } = setup();
    const spy = vi.spyOn(client, 'invalidateQueries');

    await act(async () => {
      await result.current.compat.updateDog('dog-abc', { birthDate: '2021-02-03' });
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.dogs });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.personDogs('owner-123') });
  });
});
