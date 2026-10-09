// @vitest-environment jsdom
/**
 * MYK9-1067 — a dog edit must go through the replication mutation queue, not an
 * un-awaited direct PostgREST write that offline or a failed request silently drops.
 *
 * Uses the REAL ReplicatedDogsTable and a REAL MutationManager (fake-indexeddb from
 * the global test setup); only the Supabase client the manager uploads through is
 * stubbed, so "one upload", "queued while offline" and "dead-lettered" are measured
 * on the queue itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  onlineManager,
} from '@tanstack/react-query';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { MutationManager, configureConflictSurfacing } from '@myk9/replication';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useDogStoreCompat } from './useDogStoreCompat';
import { replicatedDogsTable, rowToDog } from '@/services/replication/ReplicatedDogsTable';
import { queryKeys } from '@/lib/queryClient';

const { mockDirectUpdate, mockRoster, mockNotify } = vi.hoisted(() => ({
  mockDirectUpdate: vi.fn(),
  mockRoster: { rows: [] as unknown[] },
  mockNotify: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: mockNotify, warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: () => ({ data: mockRoster.rows, isLoading: false, error: null, isStale: false }),
  useDogQuery: () => ({ data: null, isLoading: false, error: null, isStale: false }),
  useDogsByOwnerQuery: () => ({ data: [], isLoading: false, error: null, isStale: false }),
  useCreateDogMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  // The legacy direct-write path: if the hook still reaches for it, this records it.
  useUpdateDogMutation: () => ({ mutateAsync: mockDirectUpdate, isPending: false, error: null }),
  useDeleteDogMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDogStatisticsQuery: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/hooks/dogStoreCompatHelpers', () => ({
  syncDogRegistrations: vi.fn().mockResolvedValue(false),
}));

const USER = 'auth-user-1';

// What the provider's syncTable('dogs') does in the cold-replica tests.
let syncDogsImpl: (() => Promise<void>) | undefined;
const DOG_ID = 'dog-queue-1';

type UpdateResult = { data: { id: string; version: number }[] | null; error: unknown };

function makeSupabase(result: () => UpdateResult) {
  const eqs: [string, unknown][] = [];
  const update = vi.fn((_payload: Record<string, unknown>) => {
    const chain = {
      eq: (col: string, val: unknown) => {
        eqs.push([col, val]);
        return chain;
      },
      select: () => Promise.resolve(result()),
    };
    return chain;
  });
  const client = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient;
  return { client, update, eqs };
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

describe('useDogStoreCompat.updateDog — mutation queue (MYK9-1067)', () => {
  let manager: MutationManager | undefined;

  const setup = async (result: () => UpdateResult) => {
    const { client, update, eqs } = makeSupabase(result);
    manager = new MutationManager(client, {
      maxRetries: 1,
      retryBackoffBase: 1,
      getCurrentUserId: async () => USER,
      getCurrentUploadContext: async () => ({ authUserId: USER, supabaseClient: client }),
    });
    replicatedDogsTable.setMutationManager(manager);
    await replicatedDogsTable.set(
      DOG_ID,
      { id: DOG_ID, name: 'Tera', callName: 'Tera', breed: 'Beagle', ownerId: 'owner-1' },
      false
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const syncValue = {
      status: { isSyncing: false, lastSyncAt: null, error: null, tablesStatus: {} },
      triggerSync: async () => {},
      syncTable: async () => {
        await syncDogsImpl?.();
      },
    };
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        ReplicationSyncContext.Provider,
        { value: syncValue },
        React.createElement(QueryClientProvider, { client: queryClient }, children)
      );
    const { result: hook } = renderHook(() => useDogStoreCompat(), { wrapper });
    return { hook, update, queryClient, eqs };
  };

  beforeEach(() => {
    mockDirectUpdate.mockReset();
    mockRoster.rows = [];
    mockNotify.mockReset();
    syncDogsImpl = undefined;
    mockDirectUpdate.mockRejectedValue(new Error('network down'));
    setOnline(true);
  });

  afterEach(async () => {
    // The queue lives in IndexedDB and outlives the manager: drain it so a mutation
    // left by one test is not uploaded (and counted) by the next.
    await manager?.clearAllMutations();
    manager?.destroy();
    await replicatedDogsTable.delete(DOG_ID);
    onlineManager.setOnline(true);
    setOnline(true);
  });

  it('records a pending mutation even when the direct network write would reject', async () => {
    const { hook } = await setup(() => ({ data: [{ id: DOG_ID, version: 2 }], error: null }));
    setOnline(false);

    await act(async () => {
      await hook.current.updateDog(DOG_ID, { color: 'tri' });
    });

    expect(await manager!.getPendingCount()).toBe(1);
    expect(mockDirectUpdate).not.toHaveBeenCalled();
  });

  it('offline edit uploads exactly once after reconnect', async () => {
    const { hook, update } = await setup(() => ({
      data: [{ id: DOG_ID, version: 2 }],
      error: null,
    }));
    setOnline(false);
    await act(async () => {
      await hook.current.updateDog(DOG_ID, { color: 'tri' });
    });
    expect(update).not.toHaveBeenCalled();

    setOnline(true);
    await act(async () => {
      await manager!.uploadPendingMutations();
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0]).toMatchObject({ id: DOG_ID, color: 'tri' });
    expect(await manager!.getPendingCount()).toBe(0);
    expect(mockDirectUpdate).not.toHaveBeenCalled();
  });

  it('online edit produces one upload and no duplicate direct write', async () => {
    const { hook, update } = await setup(() => ({
      data: [{ id: DOG_ID, version: 2 }],
      error: null,
    }));

    await act(async () => {
      await hook.current.updateDog(DOG_ID, { color: 'tri' });
      await manager!.uploadPendingMutations();
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(mockDirectUpdate).not.toHaveBeenCalled();
  });

  it('a permanent server rejection lands in failed_mutations', async () => {
    const { hook } = await setup(() => ({
      data: null,
      error: { code: '42501', message: 'permission denied for table dogs' },
    }));

    await act(async () => {
      await hook.current.updateDog(DOG_ID, { color: 'tri' });
      await manager!.uploadPendingMutations();
    });

    const failed = await manager!.getFailedMutations();
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ tableName: 'dogs', rowId: DOG_ID });
  });

  it('offline: cached roster shows the edit at once with owner and registrations kept; one refetch on reconnect', async () => {
    const { hook, queryClient } = await setup(() => ({ data: [], error: null }));
    const rosterKey = [...queryKeys.dogs, 'person-1', 'all'];
    const row = {
      id: DOG_ID,
      color: 'black',
      breed: 'Beagle',
      owner: { id: 'owner-1', first_name: 'Ann', last_name: 'Lee' },
      registrations: [{ id: 'reg-1', registered_name: 'Reg Name' }],
    };
    const rosterFetch = vi.fn(async () => [row]);
    const unsubscribe = new QueryObserver(queryClient, {
      queryKey: rosterKey,
      queryFn: rosterFetch,
      staleTime: Infinity,
    }).subscribe(() => {});
    await vi.waitFor(() => expect(rosterFetch).toHaveBeenCalledTimes(1));
    onlineManager.setOnline(false);
    setOnline(false);

    await act(async () => {
      await hook.current.updateDog(DOG_ID, { color: 'tri' });
    });

    const cached = queryClient.getQueryData(rosterKey) as (typeof row)[];
    expect(cached[0]).toMatchObject({ color: 'tri', breed: 'Beagle' });
    expect(cached[0]!.owner.first_name).toBe('Ann');
    expect(cached[0]!.registrations).toHaveLength(1);
    expect(rosterFetch).toHaveBeenCalledTimes(1);

    onlineManager.setOnline(true);
    await vi.waitFor(() => expect(rosterFetch).toHaveBeenCalledTimes(2));
    unsubscribe();
  });

  it('still refreshes the roster immediately after the local write (#2840)', async () => {
    const { hook, queryClient } = await setup(() => ({ data: [], error: null }));
    setOnline(false);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await hook.current.updateDog(DOG_ID, { color: 'tri' });
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.dogs });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.personDogs('owner-1') });
  });

  describe('cold local replica (dog on the roster via the PostgREST fallback)', () => {
    // The server rows, exactly as PostgREST returns them: sex NULL, version 7.
    const serverRow = (id: string) => ({
      id,
      name: null,
      call_name: id,
      breed: 'Beagle',
      sex: null,
      owner_id: 'owner-1',
      version: 7,
    });
    const OTHER_IDS = ['dog-b', 'dog-c'];

    // The OCC precondition is only attached while conflict surfacing is on.
    beforeEach(() => {
      configureConflictSurfacing(true);
    });
    afterEach(() => {
      configureConflictSurfacing(false);
    });

    /** Stands in for the provider's table sync: stores EVERY server row like a download. */
    const normalSync = async () => {
      const rows = [DOG_ID, ...OTHER_IDS].map(id => rowToDog(serverRow(id) as never));
      await replicatedDogsTable.batchSet(rows, new Map(rows.map(r => [r.id, 7])));
    };

    const coldSetup = async () => {
      // Roster display rows must NOT feed the replica: give it a row whose display
      // defaults (sex 'male') differ from the server row.
      mockRoster.rows = [
        { id: DOG_ID, name: 'Tera', call_name: 'Tera', breed: '', sex: 'male', registrations: [] },
      ];
      const ctx = await setup(() => ({ data: [{ id: DOG_ID, version: 8 }], error: null }));
      await replicatedDogsTable.delete(DOG_ID);
      return ctx;
    };

    afterEach(async () => {
      for (const id of OTHER_IDS) await replicatedDogsTable.delete(id);
    });

    it('syncs the whole table first: full roster present, edit queues with the OCC version', async () => {
      const cold = await coldSetup();
      syncDogsImpl = normalSync;

      await act(async () => {
        await cold.hook.current.updateDog(DOG_ID, { color: 'tri' });
      });

      const all = await replicatedDogsTable.getAllDogs();
      expect(all.map(d => d.id).sort()).toEqual([DOG_ID, ...OTHER_IDS].sort());
      expect((await replicatedDogsTable.getReplicatedRow(DOG_ID))?.serverVersion).toBe(7);

      await act(async () => {
        await manager!.uploadPendingMutations();
      });
      const coldEqs = [...cold.eqs];
      expect(coldEqs).toContainEqual(['version', 7]);
      const payload = cold.update.mock.calls[0]![0];
      // Display defaults never reach the server.
      expect(payload.sex).toBeNull();
      expect(payload.breed).toBe('Beagle');

      // A warm row at the same server version attaches the identical precondition.
      await manager!.clearAllMutations();
      await replicatedDogsTable.delete(DOG_ID);
      await replicatedDogsTable.set(
        DOG_ID,
        { id: DOG_ID, name: DOG_ID, callName: DOG_ID, breed: 'Beagle', ownerId: 'owner-1' },
        false,
        undefined,
        7
      );
      cold.eqs.length = 0;
      await act(async () => {
        await cold.hook.current.updateDog(DOG_ID, { color: 'tri' });
        await manager!.uploadPendingMutations();
      });
      expect(cold.eqs).toEqual(coldEqs);
    });

    it('sync that cannot fill the replica: error toast, nothing queued, replica untouched', async () => {
      const { hook } = await coldSetup();
      syncDogsImpl = async () => {
        throw new Error('offline');
      };

      await act(async () => {
        const out = await hook.current.updateDog(DOG_ID, { color: 'tri' });
        expect(out).toBeNull();
      });

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(await manager!.getPendingCount()).toBe(0);
      expect(await replicatedDogsTable.getAllDogs()).toEqual([]);
      expect(mockDirectUpdate).not.toHaveBeenCalled();
    });
  });
});
