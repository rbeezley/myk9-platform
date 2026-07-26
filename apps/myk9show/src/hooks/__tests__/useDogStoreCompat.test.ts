import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { DogInput } from '@/store/dogStore';

// ── Mocks (hoisted so factories can reference them) ──────────────────────────

const {
  mockSetReplicatedDog,
  mockCreateReplicatedDogWithId,
  mockCreateReplicatedDogWithRegistrationsRpc,
  mockDeleteReplicatedDog,
  mockGetAllReplicatedDogs,
  mockGetPendingDogMutationIdsForRow,
  mockCreateMutateAsync,
  mockDeleteMutateAsync,
  mockCreateReplicatedDogRegistrationsForDog,
  mockCreateLocalReplicatedDogRegistrationsForDog,
  mockUpdateMutateAsync,
  mockGetReplicatedDogById,
} = vi.hoisted(() => ({
  mockSetReplicatedDog: vi.fn(),
  mockCreateReplicatedDogWithId: vi.fn(),
  mockCreateReplicatedDogWithRegistrationsRpc: vi.fn(),
  mockDeleteReplicatedDog: vi.fn(),
  mockGetAllReplicatedDogs: vi.fn(),
  mockGetPendingDogMutationIdsForRow: vi.fn(),
  mockCreateMutateAsync: vi.fn(),
  mockDeleteMutateAsync: vi.fn(),
  mockCreateReplicatedDogRegistrationsForDog: vi.fn(),
  mockCreateLocalReplicatedDogRegistrationsForDog: vi.fn(),
  mockUpdateMutateAsync: vi.fn(),
  mockGetReplicatedDogById: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getAllDogs: mockGetAllReplicatedDogs,
    set: mockSetReplicatedDog,
    createDogWithId: mockCreateReplicatedDogWithId,
    createDogWithRegistrationsRpc: mockCreateReplicatedDogWithRegistrationsRpc,
    getDogById: mockGetReplicatedDogById,
    getPendingMutationIdsForRow: mockGetPendingDogMutationIdsForRow,
    delete: mockDeleteReplicatedDog,
    get: vi.fn().mockResolvedValue(null),
    getAll: mockGetAllReplicatedDogs,
  },
}));

vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    createRegistrationsForDog: mockCreateReplicatedDogRegistrationsForDog,
    createLocalRegistrationsForDog: mockCreateLocalReplicatedDogRegistrationsForDog,
    toSupabaseRow: (registration: Record<string, unknown>) => registration,
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
  useUpdateDogMutation: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
    error: null,
  }),
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
    mockCreateReplicatedDogRegistrationsForDog.mockResolvedValue([]);
    mockCreateLocalReplicatedDogRegistrationsForDog.mockResolvedValue([]);
    mockGetPendingDogMutationIdsForRow.mockResolvedValue(['dog-mutation-1']);
    mockCreateReplicatedDogWithId.mockImplementation(dog =>
      Promise.resolve({
        ...dog,
        _syncStatus: 'pending',
        _localOnly: true,
      })
    );
    mockCreateReplicatedDogWithRegistrationsRpc.mockImplementation(dog =>
      Promise.resolve({
        ...dog,
        _syncStatus: 'pending',
        _localOnly: true,
      })
    );
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

  // MYK9-90 §5.1 — `dogs.call_name` is NOT NULL, and the mappers are what
  // reject a dog that cannot satisfy it. They now run BEFORE the local write:
  // called after it, the throw fired from outside `addDog`'s rollback `try`,
  // so creation reported an error while leaving the row behind in IndexedDB.
  // "   " is the specific input — it is truthy, so it survived every `||`.
  it.each([
    ['whitespace-only', '   '],
    ['empty', ''],
  ])('leaves no ghost dog in IndexedDB when the call name is %s', async (_label, callName) => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await expect(
        result.current.addDog({ ...baseDogInput, name: callName, callName })
      ).rejects.toThrow(/call name/i);
    });

    // The invariant: nothing was persisted locally, so nothing needs rolling back.
    expect(mockSetReplicatedDog).not.toHaveBeenCalled();
    expect(mockDeleteReplicatedDog).not.toHaveBeenCalled();
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
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

  it('creates a dog through the offline-first atomic registration RPC path', async () => {
    const registrations = [
      {
        organization: 'AKC',
        number: 'SW123456',
        registeredName: 'Beacon Hill Fast Lane',
        type: 'Border Collie',
        status: 'pending',
      },
    ];
    mockCreateLocalReplicatedDogRegistrationsForDog.mockResolvedValue([
      {
        id: 'registration-1',
        dogId: 'dog-1',
        organization: 'AKC',
        registrationNumber: 'SW123456',
        registeredName: 'Beacon Hill Fast Lane',
        breed: 'Border Collie',
        status: 'pending',
      },
    ]);
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.addDogOfflineFirst(
        { ...baseDogInput, registrations },
        { dependsOn: ['person-mutation-1'] }
      );
    });

    const [replicatedDog, registrationRows, options] =
      mockCreateReplicatedDogWithRegistrationsRpc.mock.calls[0];
    expect(replicatedDog).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: 'Biscuit',
        breed: 'Beagle',
        ownerId: 'person-123',
      })
    );
    expect(registrationRows).toEqual([
      {
        organization: 'AKC',
        registered_name: 'Beacon Hill Fast Lane',
        registration_number: 'SW123456',
        breed: 'Border Collie',
        status: 'pending',
      },
    ]);
    expect(options).toEqual({ dependsOn: ['person-mutation-1'] });
    expect(mockCreateLocalReplicatedDogRegistrationsForDog).toHaveBeenCalledWith(
      replicatedDog.id,
      registrations
    );
    expect(mockCreateReplicatedDogWithId).not.toHaveBeenCalled();
    expect(mockCreateReplicatedDogRegistrationsForDog).not.toHaveBeenCalled();
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
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

  it('invalidates the dogs query again after IndexedDB cleanup (closes the resurrection race)', async () => {
    // exhibitor-ux-remediation: getAllDogs falls back to the same IndexedDB
    // table, so the mutation's own onSuccess invalidate/refetch can race this
    // cleanup and resurrect the just-deleted dog. A second invalidation after
    // the local row is definitely gone closes that race.
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.deleteDog('dog-123');
    });

    const deleteCleanupOrder = mockDeleteReplicatedDog.mock.invocationCallOrder[0];
    const laterInvalidateCall = invalidateSpy.mock.invocationCallOrder.find(
      order => order > deleteCleanupOrder
    );
    expect(laterInvalidateCall).toBeDefined();

    invalidateSpy.mockRestore();
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

describe('useDogStoreCompat.updateDog — one normalized value reaches both destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMutateAsync.mockResolvedValue(mockDbDog);
    mockGetReplicatedDogById.mockResolvedValue({
      id: 'dog-123',
      name: 'Biscuit',
      callName: 'Biscuit',
      breed: 'Beagle',
      ownerId: 'person-123',
    });
  });

  // MYK9-90 §5.1 — asserts BOTH destinations in ONE test on purpose. Two tests
  // each checking their own side would both have passed while the values
  // silently disagreed: IndexedDB stored the trimmed "Tera" while Supabase was
  // sent the padded "  Tera  ", so the next server-backed sync reverted the
  // local value. This caller bypasses the form schema, which is the only other
  // place the value is normalized.
  it('sends the identical trimmed call name to IndexedDB and to Supabase', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.updateDog('dog-123', { callName: '  Tera  ' });
    });

    expect(mockSetReplicatedDog).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1);

    const indexedDbCallName = (
      mockSetReplicatedDog.mock.calls[0]?.[1] as { callName?: string } | undefined
    )?.callName;
    const supabaseCallName = (
      mockUpdateMutateAsync.mock.calls[0]?.[0] as { updates?: { call_name?: string } } | undefined
    )?.updates?.call_name;

    // The invariant: one value, not two that happen to look similar.
    expect(indexedDbCallName).toBe(supabaseCallName);
    expect(indexedDbCallName).toBe('Tera');
  });

  it('still skips a whitespace-only call name on both destinations', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.updateDog('dog-123', { callName: '   ', breed: 'Border Collie' });
    });

    const localPatch = mockSetReplicatedDog.mock.calls[0]?.[1] as {
      callName?: string;
      breed?: string;
    };
    const dbPatch = (
      mockUpdateMutateAsync.mock.calls[0]?.[0] as { updates?: Record<string, unknown> } | undefined
    )?.updates;

    // Neither clears the required identifier; the rest of the edit still lands.
    expect(localPatch?.callName).toBe('Biscuit');
    expect(dbPatch).not.toHaveProperty('call_name');
    expect(localPatch?.breed).toBe('Border Collie');
    expect(dbPatch?.breed).toBe('Border Collie');
  });
});
