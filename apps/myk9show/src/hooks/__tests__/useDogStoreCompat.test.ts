import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { DogInput } from '@/store/dogStore';

// ── Mocks (hoisted so factories can reference them) ──────────────────────────

const {
  mockSetReplicatedDog,
  mockDeleteReplicatedDog,
  mockGetAllReplicatedDogs,
  mockCreateMutateAsync,
  mockDeleteMutateAsync,
} = vi.hoisted(() => ({
  mockSetReplicatedDog: vi.fn(),
  mockDeleteReplicatedDog: vi.fn(),
  mockGetAllReplicatedDogs: vi.fn(),
  mockCreateMutateAsync: vi.fn(),
  mockDeleteMutateAsync: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getAllDogs: mockGetAllReplicatedDogs,
    set: mockSetReplicatedDog,
    delete: mockDeleteReplicatedDog,
    get: vi.fn().mockResolvedValue(null),
    getAll: mockGetAllReplicatedDogs,
  },
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
  useCreateDogMutation: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
    error: null,
  }),
  useUpdateDogMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDeleteDogMutation: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
    error: null,
  }),
  useDogStatisticsQuery: () => ({ data: undefined, isLoading: false }),
  useDogQuery: () => ({ data: null, isLoading: false, error: null }),
  useDogsByOwnerQuery: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('@/hooks/dogStoreCompatHelpers', () => ({
  syncDogRegistrations: vi.fn().mockResolvedValue(false),
}));

// Import the hook AFTER mocks are set up
import { useDogStoreCompat } from '../useDogStoreCompat';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const baseDogInput: DogInput = {
  name: 'Biscuit',
  breed: 'Beagle',
  sex: 'male',
  ownerId: 'person-123',
};

const mockDbDog = {
  id: 'server-uuid',
  name: 'Biscuit',
  breed: 'Beagle',
  sex: 'male',
  owner_id: 'person-123',
  call_name: null,
  date_of_birth: null,
  color: null,
  height: null,
  weight: null,
  microchip_number: null,
  spayed_neutered: null,
  image_url: null,
  owner: null,
  registrations: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDogStoreCompat.addDog — local-first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMutateAsync.mockResolvedValue(mockDbDog);
    mockSetReplicatedDog.mockResolvedValue(undefined);
    mockDeleteReplicatedDog.mockResolvedValue(undefined);
    mockGetAllReplicatedDogs.mockResolvedValue([]);
  });

  it('writes to IndexedDB before PostgREST insert', async () => {
    let indexedDbWriteOrder = 0;
    let postgrestCallOrder = 0;
    let counter = 0;

    mockSetReplicatedDog.mockImplementation(() => {
      indexedDbWriteOrder = ++counter;
      return Promise.resolve();
    });
    mockCreateMutateAsync.mockImplementation(() => {
      postgrestCallOrder = ++counter;
      return Promise.resolve(mockDbDog);
    });

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog(baseDogInput);
    });

    expect(indexedDbWriteOrder).toBeGreaterThan(0);
    expect(postgrestCallOrder).toBeGreaterThan(0);
    expect(indexedDbWriteOrder).toBeLessThan(postgrestCallOrder);
  });

  it('writes to IndexedDB with isDirty=false (synced status)', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog(baseDogInput);
    });

    expect(mockSetReplicatedDog).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'Biscuit', breed: 'Beagle' }),
      false
    );
  });

  it('uses the same UUID for IndexedDB and PostgREST', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog(baseDogInput);
    });

    const indexedDbId = mockSetReplicatedDog.mock.calls[0][0] as string;
    const postgrestPayload = mockCreateMutateAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(postgrestPayload.id).toBe(indexedDbId);
  });

  it('removes from IndexedDB when PostgREST insert fails', async () => {
    mockCreateMutateAsync.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.addDog(baseDogInput)).rejects.toThrow();
    });

    expect(mockDeleteReplicatedDog).toHaveBeenCalledWith(expect.any(String));
  });

  it('uses same UUID in rollback delete as in initial IndexedDB write', async () => {
    mockCreateMutateAsync.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.addDog(baseDogInput)).rejects.toThrow();
    });

    const writtenId = mockSetReplicatedDog.mock.calls[0][0] as string;
    const deletedId = mockDeleteReplicatedDog.mock.calls[0][0] as string;
    expect(deletedId).toBe(writtenId);
  });

  // This test pins the invariant that `addDog` writes the new dog into the
  // same IndexedDB store that `getAllDogs` reads from. A Map-backed mock
  // stands in for replicatedDogsTable. We do not exercise the
  // `useDogsQuery → dogQueries.getAllDogs → withReplicationFallback` path
  // here (that is mocked at the `useDogsQuery` level); the Supabase-merge
  // behavior is covered in `dogQueries.test.ts`.
  it('REGRESSION: after addDog, IndexedDB store holds both pre-existing and new dog', async () => {
    const existingDog = {
      id: 'existing-uuid',
      name: 'Rex',
      breed: 'Lab',
      sex: 'male',
      ownerId: 'person-123',
    };
    const store = new Map<string, unknown>([[existingDog.id, existingDog]]);
    mockSetReplicatedDog.mockImplementation((id: string, dog: unknown) => {
      store.set(id, dog);
      return Promise.resolve();
    });
    mockDeleteReplicatedDog.mockImplementation((id: string) => {
      store.delete(id);
      return Promise.resolve();
    });
    mockGetAllReplicatedDogs.mockImplementation(() => Promise.resolve(Array.from(store.values())));

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDog({ ...baseDogInput, name: 'Biscuit' });
    });

    const all = (await mockGetAllReplicatedDogs()) as Array<{ name: string }>;
    expect(all).toHaveLength(2);
    expect(all.map(d => d.name).sort()).toEqual(['Biscuit', 'Rex']);
  });

  it('REGRESSION: rollback removes new dog from IndexedDB store, leaving pre-existing dogs', async () => {
    const existingDog = {
      id: 'existing-uuid',
      name: 'Rex',
      breed: 'Lab',
      sex: 'male',
      ownerId: 'person-123',
    };
    const store = new Map<string, unknown>([[existingDog.id, existingDog]]);
    mockSetReplicatedDog.mockImplementation((id: string, dog: unknown) => {
      store.set(id, dog);
      return Promise.resolve();
    });
    mockDeleteReplicatedDog.mockImplementation((id: string) => {
      store.delete(id);
      return Promise.resolve();
    });
    mockGetAllReplicatedDogs.mockImplementation(() => Promise.resolve(Array.from(store.values())));
    mockCreateMutateAsync.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.addDog({ ...baseDogInput, name: 'Biscuit' })).rejects.toThrow();
    });

    const all = (await mockGetAllReplicatedDogs()) as Array<{ name: string }>;
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe('Rex');
  });

  it('does not mask PostgREST error when IndexedDB rollback itself fails', async () => {
    mockCreateMutateAsync.mockRejectedValue(new Error('PostgREST down'));
    mockDeleteReplicatedDog.mockRejectedValue(new Error('IndexedDB blown up'));

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.addDog(baseDogInput)).rejects.toThrow('PostgREST down');
    });

    expect(mockDeleteReplicatedDog).toHaveBeenCalled();
  });
});

describe('useDogStoreCompat.deleteDog — soft-delete + IndexedDB cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteMutateAsync.mockResolvedValue(undefined);
    mockDeleteReplicatedDog.mockResolvedValue(undefined);
  });

  it('calls replicatedDogsTable.delete after a successful DB mutation', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.deleteDog('dog-123');
    });

    expect(mockDeleteMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'dog-123' }));
    expect(mockDeleteReplicatedDog).toHaveBeenCalledWith('dog-123');
  });

  it('does not throw when replicatedDogsTable.delete rejects (warn-only contract)', async () => {
    mockDeleteReplicatedDog.mockRejectedValue(new Error('IndexedDB unavailable'));

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.deleteDog('dog-123')).resolves.toBeUndefined();
    });

    expect(mockDeleteReplicatedDog).toHaveBeenCalledWith('dog-123');
  });

  it('propagates the error and skips IndexedDB cleanup when DB mutation fails', async () => {
    mockDeleteMutateAsync.mockRejectedValue(new Error('DB delete failed'));

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(result.current.deleteDog('dog-123')).rejects.toThrow('DB delete failed');
    });

    expect(mockDeleteReplicatedDog).not.toHaveBeenCalled();
  });
});
