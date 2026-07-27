import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { DogInput } from '@/store/dogStore';
import { getDogBreedLabel, BREED_NOT_SET, type Dog } from '@/types/dog-types';
import { queryKeys } from '@/lib/queryClient';
import { cachedRegistrationRowsForDog } from '../dogRegistrationHydration';

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
  mockGetRegistrationsForDogs,
  mockUpdateMutateAsync,
  mockServerRegistrationsIn,
  mockDogsQueryData,
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
  mockGetRegistrationsForDogs: vi.fn(),
  mockUpdateMutateAsync: vi.fn(),
  mockServerRegistrationsIn: vi.fn(),
  mockDogsQueryData: vi.fn(() => [] as unknown[]),
  mockGetReplicatedDogById: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ in: mockServerRegistrationsIn }) }) },
  logQuery: vi.fn(),
  createDatabaseError: (e: unknown) => e,
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getAllDogs: mockGetAllReplicatedDogs,
    set: mockSetReplicatedDog,
    createDogWithId: mockCreateReplicatedDogWithId,
    createDogWithRegistrationsRpc: mockCreateReplicatedDogWithRegistrationsRpc,
    getPendingMutationIdsForRow: mockGetPendingDogMutationIdsForRow,
    delete: mockDeleteReplicatedDog,
    get: vi.fn().mockResolvedValue(null),
    getDogById: mockGetReplicatedDogById,
    getAll: mockGetAllReplicatedDogs,
  },
}));

vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  createRegistrationTimestamps: (count: number) =>
    Array.from({ length: count }, (_, index) => `2024-01-01T00:00:0${index}.000Z`),
  replicatedDogRegistrationsTable: {
    createRegistrationsForDog: mockCreateReplicatedDogRegistrationsForDog,
    createLocalRegistrationsForDog: mockCreateLocalReplicatedDogRegistrationsForDog,
    toSupabaseRow: (registration: Record<string, unknown>) => registration,
    getRegistrationsForDogs: mockGetRegistrationsForDogs,
  },
}));

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: () => ({
    data: mockDogsQueryData(),
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
    mockServerRegistrationsIn.mockResolvedValue({ data: [], error: null });
    mockGetRegistrationsForDogs.mockResolvedValue([]);
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
        createdAt: '2024-01-01T00:00:00.000Z',
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
    // MYK9-90 round 4: the RPC payload must carry the ordered creation
    // timestamp from the local mirror. Without it every registration in the
    // RPC's transaction gets an identical server `created_at` and the primary
    // registration is decided by a random server UUID.
    expect(registrationRows).toEqual([
      {
        organization: 'AKC',
        registered_name: 'Beacon Hill Fast Lane',
        registration_number: 'SW123456',
        breed: 'Border Collie',
        status: 'pending',
        created_at: '2024-01-01T00:00:00.000Z',
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

// MYK9-90 review round 3, finding 3 — REALISTIC-DATA proof.
//
// `updateDog` returns a locally-mapped dog straight to `DogDialogs`, which
// replaces detail state with it. Breed is resolved from `dog_registrations`, so
// mapping a bare replicated row yields "Breed not set" for a registered dog.
//
// The round-2 fix hydrated from `replicatedDogRegistrationsTable` ALONE, which
// is inert in production: that table's `sync()` is a no-op and server reads are
// never written into it, so it only holds registrations created locally. These
// tests therefore model production — the LOCAL table returns nothing and the
// registrations exist only on the server. A fixture that seeded the local table
// would have passed against the broken code.
describe('useDogStoreCompat.updateDog — breed survives the local re-map', () => {
  const serverRegistration = {
    id: 'reg-akc',
    dog_id: 'dog-1',
    created_at: '2024-01-01T00:00:00Z',
    organization: 'AKC',
    registered_name: 'Ziva of the North',
    registration_number: 'DN61191906',
    breed: 'Belgian Malinois',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMutateAsync.mockResolvedValue({});
    mockGetReplicatedDogById.mockResolvedValue({
      id: 'dog-1',
      name: 'Ziva',
      callName: 'Ziva',
      breed: 'Belgian Malinois',
      ownerId: 'person-1',
    });
    // Production reality: the replica holds no server-originated registrations.
    mockGetRegistrationsForDogs.mockResolvedValue([]);
    // The dogs query has already loaded this dog WITH its registrations, which
    // is where the immediate return now gets the breed from.
    mockDogsQueryData.mockReturnValue([
      {
        id: 'dog-1',
        name: 'Ziva',
        call_name: 'Ziva',
        owner_id: 'person-1',
        registrations: [serverRegistration],
      },
    ]);
  });

  it('keeps the breed for a dog whose registrations came from the SERVER', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    const updated = await result.current.updateDog('dog-1', { callName: 'Zee' });

    expect(getDogBreedLabel(updated!)).toBe('Belgian Malinois');
    expect(updated?.breed).toBe('Belgian Malinois');
  });

  // MYK9-90 review round 4, finding 3. `updateDog` is local-first: a
  // call-name-only edit at a venue must not wait on PostgREST to fail or time
  // out before the UI updates.
  it('does NOT hit the network on the save path', async () => {
    let networkCalled = false;
    mockServerRegistrationsIn.mockImplementation(() => {
      networkCalled = true;
      return new Promise(() => {}); // never settles — a hung venue connection
    });

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    // Would hang forever if the save path awaited the registration read.
    const updated = await result.current.updateDog('dog-1', { callName: 'Zee' });

    expect(updated?.callName).toBe('Zee');
    expect(getDogBreedLabel(updated!)).toBe('Belgian Malinois');
    expect(networkCalled).toBe(false);
  });

  it('reports no breed for a dog that genuinely has no registration', async () => {
    mockDogsQueryData.mockReturnValue([
      { id: 'dog-1', name: 'Ziva', call_name: 'Ziva', owner_id: 'person-1', registrations: [] },
    ]);

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });
    const updated = await result.current.updateDog('dog-1', { callName: 'Zee' });

    expect(getDogBreedLabel(updated!)).toBe(BREED_NOT_SET);
  });

  // MYK9-90 review round 5. React Query keeps serving an invalidated-but-
  // INACTIVE query's old data, so `registrationsByDog` can still hold a
  // registration the user just deleted. A loaded dogs list that shows zero
  // registrations is authoritative and must win over that stale cache.
  it('does not resurrect a deleted registration when an UNRELATED field is edited', async () => {
    // The dogs query has refreshed after the deletion: the dog is present, with
    // an authoritative empty registration list.
    mockDogsQueryData.mockReturnValue([
      { id: 'dog-1', name: 'Ziva', call_name: 'Ziva', owner_id: 'person-1', registrations: [] },
    ]);

    // ...but the per-dog registrations query is invalidated-and-inactive, so it
    // still serves the deleted row.
    const staleQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    staleQueryClient.setQueryData(queryKeys.registrationsByDog('dog-1'), [serverRegistration]);
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: staleQueryClient }, children);

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

    // Edit something that has nothing to do with registrations.
    const updated = await result.current.updateDog('dog-1', { callName: 'Zee' });

    expect(updated?.callName).toBe('Zee');
    expect(updated?.registrations).toEqual([]);
    expect(updated?.breed).toBe('');
    expect(getDogBreedLabel(updated!)).toBe(BREED_NOT_SET);
  });

  it('keeps the cached registration when the dog-list registration read is incomplete', async () => {
    mockDogsQueryData.mockReturnValue([
      {
        id: 'dog-1',
        name: 'Ziva',
        call_name: 'Ziva',
        owner_id: 'person-1',
        registrations: [],
        registrations_read_complete: false,
      },
    ]);

    const staleQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    staleQueryClient.setQueryData(queryKeys.registrationsByDog('dog-1'), [serverRegistration]);
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: staleQueryClient }, children);

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper });
    const updated = await result.current.updateDog('dog-1', { callName: 'Zee' });

    expect(updated?.callName).toBe('Zee');
    expect(getDogBreedLabel(updated!)).toBe('Belgian Malinois');
    expect(updated?.registrations?.[0]?.breed).toBe('Belgian Malinois');
  });

  it('keeps known loaded registrations when an incomplete read has no cache', async () => {
    const loadedRegistration = {
      id: 'reg-akc',
      organization: 'AKC',
      registeredName: 'Ziva of the North',
      registrationNumber: 'DN61191906',
      breed: 'Belgian Malinois',
      status: 'Active' as const,
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    expect(
      cachedRegistrationRowsForDog(
        'dog-1',
        [
          {
            id: 'dog-1',
            name: 'Ziva',
            breed: 'Belgian Malinois',
            sex: 'female',
            ownerId: 'person-1',
            registrations: [loadedRegistration],
            registrationsReadComplete: false,
          } satisfies Dog,
        ],
        queryClient
      )
    ).toEqual([loadedRegistration]);
  });
});

describe('cachedRegistrationRowsForDog', () => {
  it('uses the per-dog cache when the dog is absent from the loaded list', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.registrationsByDog('dog-1'), [
      { id: 'reg-akc', breed: 'Belgian Malinois' },
    ]);

    expect(cachedRegistrationRowsForDog('dog-1', [], queryClient)).toEqual([
      { id: 'reg-akc', breed: 'Belgian Malinois' },
    ]);
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

  /**
   * Reads the one patch that each destination actually received. Every test
   * below asserts across both in a single test on purpose: split into a
   * "writes X to IndexedDB" test and a "writes X to Supabase" test, both pass
   * while the two values disagree, which is exactly the bug being pinned.
   */
  const bothDestinations = () => ({
    local: mockSetReplicatedDog.mock.calls[0]?.[1] as Record<string, unknown> | undefined,
    db: (mockUpdateMutateAsync.mock.calls[0]?.[0] as { updates?: Record<string, unknown> })
      ?.updates,
  });

  it('marks a dog deceased in IndexedDB and in Supabase, not just in Supabase', async () => {
    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.updateDog('dog-123', {
        status: 'deceased',
        deceasedDate: '2026-07-01',
      });
    });

    const { local, db } = bothDestinations();

    // The status itself: the local row used to keep its previous value while
    // Supabase moved on, so an offline read disagreed with the server read until
    // some unrelated refetch happened to overwrite it.
    expect(local?.status).toBe('deceased');
    expect(db?.status).toBe('deceased');
    expect(local?.status).toBe(db?.status);

    // And the date behind it, so the next edit does not round-trip the gap back
    // to the server as `deceased_date: null`.
    expect(local?.deceasedDate).toBe('2026-07-01');
    expect(db?.deceased_date).toBe('2026-07-01');
    expect(local?.deceasedDate).toBe(db?.deceased_date);

    // `deceased` stays derived, never a second stored copy of the status.
    expect(db?.deceased).toBe(true);
    expect(local).not.toHaveProperty('deceased');
  });

  it('retires a dog on both destinations and clears the deceased date with it', async () => {
    mockGetReplicatedDogById.mockResolvedValue({
      id: 'dog-123',
      name: 'Biscuit',
      callName: 'Biscuit',
      breed: 'Beagle',
      ownerId: 'person-123',
      status: 'deceased',
      deceasedDate: '2026-07-01',
    });

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.updateDog('dog-123', { status: 'retired' });
    });

    const { local, db } = bothDestinations();

    expect(local?.status).toBe('retired');
    expect(db?.status).toBe('retired');
    // Both key the date off the status, so neither is left holding a deceased
    // date for a dog the other one considers retired.
    expect(local?.deceasedDate).toBeUndefined();
    expect(db?.deceased_date).toBeNull();
    expect(db?.deceased).toBe(false);
  });

  it('drops a stale deceased date when the status moves off deceased', async () => {
    // The realistic shape of this edit, and the one the first retire test missed
    // by omitting the date: `mapDogToDogInput` carries `deceasedDate` alongside
    // `status`, so `UserDetailsTabs` sends BOTH — the old date rides along with
    // the new status. Passing it through would store `deceased: false` next to a
    // populated `deceased_date`: a row contradicting itself, on both paths.
    mockGetReplicatedDogById.mockResolvedValue({
      id: 'dog-123',
      name: 'Biscuit',
      callName: 'Biscuit',
      breed: 'Beagle',
      ownerId: 'person-123',
      status: 'deceased',
      deceasedDate: '2026-07-01',
    });

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.updateDog('dog-123', {
        status: 'retired',
        deceasedDate: '2026-07-01',
      });
    });

    const { local, db } = bothDestinations();

    expect(db?.deceased).toBe(false);
    expect(db?.deceased_date).toBeNull();
    expect(local?.deceasedDate).toBeUndefined();
  });

  it('treats a 0 measurement as cleared on both destinations', async () => {
    // Seed real values so "cleared" is observable in the merged local row rather
    // than indistinguishable from a field that was never there.
    mockGetReplicatedDogById.mockResolvedValue({
      id: 'dog-123',
      name: 'Biscuit',
      callName: 'Biscuit',
      breed: 'Beagle',
      ownerId: 'person-123',
      weight: '30',
      height: '15',
    });

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.updateDog('dog-123', { weight: 0, height: 0 });
    });

    const { local, db } = bothDestinations();

    // Supabase nulled a 0 while IndexedDB stored the string "0" — one "no
    // weight", one weight of zero.
    expect(db?.weight).toBeNull();
    expect(db?.height).toBeNull();
    expect(local?.weight).toBeUndefined();
    expect(local?.height).toBeUndefined();
  });

  it('treats a blank sex as cleared on both destinations', async () => {
    mockGetReplicatedDogById.mockResolvedValue({
      id: 'dog-123',
      name: 'Biscuit',
      callName: 'Biscuit',
      breed: 'Beagle',
      ownerId: 'person-123',
      sex: 'female',
    });

    const { result } = renderHook(() => useDogStoreCompat(), { wrapper: makeWrapper() });

    await act(async () => {
      // Only reachable from a caller that bypasses the form schema, which is
      // where this whole mapper pair gets its ill-formed input.
      await result.current.updateDog('dog-123', { sex: '' as 'male' | 'female' });
    });

    const { local, db } = bothDestinations();

    expect(db?.sex).toBeNull();
    expect(local?.sex).toBeUndefined();
  });
});
