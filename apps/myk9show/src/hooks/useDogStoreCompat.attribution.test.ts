/**
 * MYK9-1059 — the dog create paths hand `created_from_show_id` to the server
 * only when the add-entry wizard supplies a show.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fromAny } from '@total-typescript/shoehorn';
import { useDogStoreCompat } from './useDogStoreCompat';
import { mockSupabase } from '@/test/mocks/supabase';
import type { DogInput } from '@/store/dogStore';

const SHOW_ID = '6349d047-34fe-4307-b29a-c1ae6d7750c7';

const { dogsTable, registrationsTable, mockMutateAsync } = vi.hoisted(() => ({
  dogsTable: {
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getDogById: vi.fn().mockResolvedValue(null),
    createDogWithId: vi.fn(),
    createDogWithRegistrationsRpc: vi.fn(),
  },
  registrationsTable: {
    createLocalRegistrationsForDog: vi.fn(),
    toSupabaseRow: vi.fn().mockReturnValue({}),
  },
  mockMutateAsync: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({ replicatedDogsTable: dogsTable }));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: registrationsTable,
  createRegistrationTimestamps: (count: number) =>
    Array.from({ length: count }, () => '2026-10-09T00:00:00.000Z'),
}));
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: () => ({ data: [], isLoading: false, error: null }),
  useDogQuery: () => ({ data: null, isLoading: false, error: null }),
  useDogsByOwnerQuery: () => ({ data: [], isLoading: false, error: null }),
  useCreateDogMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false, error: null }),
  useDeleteDogMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDogStatisticsQuery: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/dogStoreCompatHelpers', () => ({
  syncDogRegistrations: vi.fn().mockResolvedValue(true),
}));

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  );

const plain: DogInput = { name: 'Liddle', breed: 'Mixed', sex: 'female', ownerId: 'owner-1' };
const withReg: DogInput = {
  ...plain,
  registrations: [
    { organization: 'AKC', registeredName: 'Liddle Bit', number: 'N1', type: 'Mixed', status: 'a' },
  ],
};
const savedDog = { id: 'dog-1', name: 'Liddle', callName: 'Liddle', breed: 'Mixed' };

beforeEach(() => {
  vi.clearAllMocks();
  mockMutateAsync.mockResolvedValue({ id: 'dog-1', name: 'Liddle', breed: 'Mixed' });
  dogsTable.createDogWithId.mockResolvedValue(savedDog);
  dogsTable.createDogWithRegistrationsRpc.mockResolvedValue(savedDog);
  registrationsTable.createLocalRegistrationsForDog.mockResolvedValue([
    { createdAt: '2026-10-09T00:00:00.000Z' },
  ]);
  mockSupabase.rpc.mockImplementation(
    fromAny((_name: string, args?: { p_dog?: { id?: string } }) =>
      Promise.resolve({ data: args?.p_dog?.id ?? 'dog-1', error: null })
    )
  );
});

describe('useDogStoreCompat creation attribution (MYK9-1059)', () => {
  it('online + registrations: the RPC p_dog carries created_from_show_id', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper });
    await act(async () => {
      await result.current.addDog(withReg, { createdFromShowId: SHOW_ID });
    });
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'create_dog_with_registrations',
      expect.objectContaining({
        p_dog: expect.objectContaining({ created_from_show_id: SHOW_ID }),
      })
    );
  });

  it('online, no registrations: the INSERT row carries created_from_show_id', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper });
    await act(async () => {
      await result.current.addDog(plain, { createdFromShowId: SHOW_ID });
    });
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ created_from_show_id: SHOW_ID })
    );
  });

  it('online without a show (profile page, admin): neither path sends the field', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper });
    await act(async () => {
      await result.current.addDog(plain);
      await result.current.addDog(withReg);
    });
    expect(mockMutateAsync.mock.calls[0]![0]).not.toHaveProperty('created_from_show_id');
    const rpcArgs = fromAny<{ p_dog: object }, unknown>(mockSupabase.rpc.mock.calls[0]![1]);
    expect(rpcArgs.p_dog).not.toHaveProperty('created_from_show_id');
  });

  it('offline, no registrations: createDogWithId receives the show id', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper });
    await act(async () => {
      await result.current.addDogOfflineFirst(plain, {
        dependsOn: ['m1'],
        createdFromShowId: SHOW_ID,
      });
    });
    expect(dogsTable.createDogWithId).toHaveBeenCalledWith(expect.anything(), {
      dependsOn: ['m1'],
      createdFromShowId: SHOW_ID,
    });
  });

  it('offline + registrations: createDogWithRegistrationsRpc receives the show id', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper });
    await act(async () => {
      await result.current.addDogOfflineFirst(withReg, { createdFromShowId: SHOW_ID });
    });
    expect(dogsTable.createDogWithRegistrationsRpc).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { createdFromShowId: SHOW_ID }
    );
  });

  it('offline without a show: options stay empty', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper });
    await act(async () => {
      await result.current.addDogOfflineFirst(plain);
    });
    expect(dogsTable.createDogWithId).toHaveBeenCalledWith(expect.anything(), {});
  });
});
