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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MutationManager, configureConflictSurfacing } from '@myk9/replication';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useDogStoreCompat } from './useDogStoreCompat';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
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
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    const { result: hook } = renderHook(() => useDogStoreCompat(), { wrapper });
    return { hook, update, queryClient, eqs };
  };

  beforeEach(() => {
    mockDirectUpdate.mockReset();
    mockRoster.rows = [];
    mockNotify.mockReset();
    mockDirectUpdate.mockRejectedValue(new Error('network down'));
    setOnline(true);
  });

  afterEach(async () => {
    // The queue lives in IndexedDB and outlives the manager: drain it so a mutation
    // left by one test is not uploaded (and counted) by the next.
    await manager?.clearAllMutations();
    manager?.destroy();
    await replicatedDogsTable.delete(DOG_ID);
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
    // The server row, exactly as PostgREST returns it: sex NULL, version 7.
    const serverRow = {
      id: DOG_ID,
      name: null,
      call_name: 'Tera',
      breed: 'Beagle',
      sex: null,
      owner_id: 'owner-1',
      version: 7,
    };

    // The OCC precondition is only attached while conflict surfacing is on.
    beforeEach(() => configureConflictSurfacing(true));
    afterEach(() => configureConflictSurfacing(false));

    const coldSetup = async (opts: { server: boolean }) => {
      // Roster display rows must NOT feed the replica: give it a row whose display
      // defaults (sex 'male') differ from the server row.
      mockRoster.rows = [
        { id: DOG_ID, name: 'Tera', call_name: 'Tera', breed: '', sex: 'male', registrations: [] },
      ];
      const ctx = await setup(() => ({ data: [{ id: DOG_ID, version: 8 }], error: null }));
      await replicatedDogsTable.delete(DOG_ID);
      vi.spyOn(
        replicatedDogsTable as unknown as { getRowRefetchAdapter: () => unknown },
        'getRowRefetchAdapter'
      ).mockReturnValue({
        fetchRowsById: async () => {
          if (!opts.server) throw new Error('offline');
          return [serverRow];
        },
      });
      return ctx;
    };

    it('stores the fetched row with its serverVersion and queues the same OCC precondition as a warm row', async () => {
      const cold = await coldSetup({ server: true });
      await act(async () => {
        await cold.hook.current.updateDog(DOG_ID, { color: 'tri' });
      });
      const stored = await replicatedDogsTable.getReplicatedRow(DOG_ID);
      expect(stored?.serverVersion).toBe(7);
      await act(async () => {
        await manager!.uploadPendingMutations();
      });
      const coldEqs = [...cold.eqs];
      expect(coldEqs).toContainEqual(['version', 7]);

      // Warm row with the same server version attaches the identical precondition.
      await manager!.clearAllMutations();
      await replicatedDogsTable.delete(DOG_ID);
      await replicatedDogsTable.set(
        DOG_ID,
        { id: DOG_ID, name: 'Tera', callName: 'Tera', breed: 'Beagle', ownerId: 'owner-1' },
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

    it('never writes display defaults: an unrelated edit leaves sex null and breed unchanged', async () => {
      const { hook, update } = await coldSetup({ server: true });
      await act(async () => {
        await hook.current.updateDog(DOG_ID, { color: 'tri' });
        await manager!.uploadPendingMutations();
      });
      const payload = update.mock.calls[0]![0];
      expect(payload.sex).toBeNull();
      expect(payload.breed).toBe('Beagle');
    });

    it('offline with no fetchable row: tells the user and queues nothing', async () => {
      const { hook } = await coldSetup({ server: false });
      setOnline(false);

      await act(async () => {
        await hook.current.updateDog(DOG_ID, { color: 'tri' });
      });

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(await manager!.getPendingCount()).toBe(0);
      expect(mockDirectUpdate).not.toHaveBeenCalled();
    });
  });
});
