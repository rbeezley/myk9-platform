// @vitest-environment jsdom
/**
 * MYK9-1070 — a bulk status change must go through the replication mutation queue
 * (replicatedDogsTable.updateDog), not an awaited direct PostgREST write that an
 * offline device loses. Real ReplicatedDogsTable + real MutationManager; only the
 * Supabase client the manager uploads through is stubbed.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  onlineManager,
} from '@tanstack/react-query';
import { MutationManager } from '@myk9/replication';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { replicatedDogsTable, rowToDog } from '@/services/replication/ReplicatedDogsTable';
import type { Dog } from '@/types/dog-types';
import { queryKeys } from '@/lib/queryClient';
import { DogsBulkActionsBar } from '../DogsBulkActionsBar';

const { mockDirectUpdate, mockNotify } = vi.hoisted(() => ({
  mockDirectUpdate: vi.fn(),
  mockNotify: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: mockNotify, warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useUpdateDogMutation: () => ({ mutateAsync: mockDirectUpdate }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'staff-1' }, hasRole: () => false }),
}));

const USER = 'auth-user-1';
const ID_A = 'bulk-dog-a';
const ID_B = 'bulk-dog-b';

type UpdateResult = { data: { id: string; version: number }[] | null; error: unknown };

const uiDog = (id: string): Dog => ({
  id,
  name: id,
  callName: id,
  breed: 'Beagle',
  sex: 'male',
  ownerId: 'owner-1',
  status: 'active',
});

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

describe('DogsBulkActionsBar — status change uses the mutation queue (MYK9-1070)', () => {
  let manager: MutationManager | undefined;
  let syncDogsImpl: (() => Promise<void>) | undefined;
  const unsubscribers: (() => void)[] = [];

  const setup = async (result: () => UpdateResult, seed = true) => {
    const update = vi.fn((_payload: Record<string, unknown>) => {
      const chain = { eq: () => chain, select: () => Promise.resolve(result()) };
      return chain;
    });
    const client = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      maxRetries: 1,
      retryBackoffBase: 1,
      getCurrentUserId: async () => USER,
      getCurrentUploadContext: async () => ({ authUserId: USER, supabaseClient: client }),
    });
    replicatedDogsTable.setMutationManager(manager);
    if (seed) {
      for (const id of [ID_A, ID_B]) {
        await replicatedDogsTable.set(
          id,
          { id, name: id, callName: id, breed: 'Beagle', ownerId: 'owner-1' },
          false
        );
      }
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const syncValue = {
      status: { isSyncing: false, lastSyncAt: null, error: null, tablesStatus: {} },
      triggerSync: async () => {},
      syncTable: async () => {
        await syncDogsImpl?.();
      },
    };
    const onClear = vi.fn();
    // A mounted roster read in the REAL cached shape: DB-row objects with the
    // joined owner and registrations the PostgREST half supplies.
    const rosterKey = [...queryKeys.dogs, 'person-1', 'all'];
    const rosterRows = [ID_A, ID_B].map(id => ({
      id,
      status: 'active',
      breed: 'Beagle',
      owner: { id: 'owner-1', first_name: 'Ann', last_name: 'Lee' },
      registrations: [{ id: `reg-${id}`, registered_name: 'Reg Name' }],
    }));
    const rosterFetch = vi.fn(async () => rosterRows);
    const observer = new QueryObserver(queryClient, {
      queryKey: rosterKey,
      queryFn: rosterFetch,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(rosterFetch).toHaveBeenCalledTimes(1));
    unsubscribers.push(unsubscribe);
    const roster = () => queryClient.getQueryData(rosterKey) as typeof rosterRows;
    render(
      <ReplicationSyncContext.Provider value={syncValue}>
        <QueryClientProvider client={queryClient}>
          <DogsBulkActionsBar selectedDogs={[uiDog(ID_A), uiDog(ID_B)]} onClear={onClear} />
        </QueryClientProvider>
      </ReplicationSyncContext.Provider>
    );
    const user = userEvent.setup();
    const run = async () => {
      await user.click(screen.getByRole('button', { name: 'Change status' }));
      await user.click(await screen.findByRole('menuitem', { name: /mark 2 dogs retired/i }));
    };
    return { update, run, onClear, roster, rosterFetch };
  };

  beforeEach(() => {
    mockDirectUpdate.mockReset().mockRejectedValue(new Error('network down'));
    mockNotify.mockReset();
    syncDogsImpl = undefined;
    setOnline(true);
  });

  afterEach(async () => {
    await manager?.clearAllMutations();
    manager?.destroy();
    for (const id of [ID_A, ID_B]) await replicatedDogsTable.delete(id);
    unsubscribers.splice(0).forEach(u => u());
    onlineManager.setOnline(true);
    setOnline(true);
  });

  it('offline: roster shows the new status at once, owner and registrations kept, one refetch on reconnect', async () => {
    const { run, onClear, roster, rosterFetch } = await setup(() => ({ data: [], error: null }));
    onlineManager.setOnline(false);
    setOnline(false);
    await run();
    await waitFor(() => expect(onClear).toHaveBeenCalled());

    expect(roster().map(r => r.status)).toEqual(['retired', 'retired']);
    expect(roster()[0]!.owner.first_name).toBe('Ann');
    expect(roster()[0]!.registrations).toHaveLength(1);
    expect(roster()[0]!.breed).toBe('Beagle');
    expect(rosterFetch).toHaveBeenCalledTimes(1);

    onlineManager.setOnline(true);
    await waitFor(() => expect(rosterFetch).toHaveBeenCalledTimes(2));
  });

  it('offline: queues one UPDATE per dog, no direct write; reconnect uploads each once', async () => {
    const { update, run, onClear } = await setup(() => ({
      data: [{ id: ID_A, version: 2 }],
      error: null,
    }));
    setOnline(false);
    await run();

    await waitFor(() => expect(onClear).toHaveBeenCalled());
    expect(mockDirectUpdate).not.toHaveBeenCalled();
    expect(await manager!.getPendingCount()).toBe(2);
    expect(update).not.toHaveBeenCalled();
    expect((await replicatedDogsTable.getDogById(ID_A))?.status).toBe('retired');

    setOnline(true);
    await act(async () => {
      await manager!.uploadPendingMutations();
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0]![0]).toMatchObject({ status: 'retired' });
    expect(await manager!.getPendingCount()).toBe(0);
  });

  it('a permanent server rejection lands in failed_mutations', async () => {
    const { run, onClear } = await setup(() => ({
      data: null,
      error: { code: '42501', message: 'permission denied for table dogs' },
    }));
    await run();
    await waitFor(() => expect(onClear).toHaveBeenCalled());
    await act(async () => {
      await manager!.uploadPendingMutations();
    });
    expect(await manager!.getFailedMutations()).toHaveLength(2);
  });

  it('cold replica: syncs the dogs table, then queues; if still missing nothing is queued', async () => {
    const { run, onClear } = await setup(() => ({ data: [], error: null }), false);
    syncDogsImpl = async () => {
      const rows = [ID_A, ID_B].map(id =>
        rowToDog({ id, name: null, call_name: id, breed: 'Beagle', sex: null, version: 7 } as never)
      );
      await replicatedDogsTable.batchSet(rows, new Map(rows.map(r => [r.id, 7])));
    };
    await run();
    await waitFor(() => expect(onClear).toHaveBeenCalled());
    expect(await manager!.getPendingCount()).toBe(2);
    expect(mockDirectUpdate).not.toHaveBeenCalled();
  });

  it('cold replica the sync cannot fill: error toast, nothing queued, selection kept', async () => {
    const { run, onClear } = await setup(() => ({ data: [], error: null }), false);
    syncDogsImpl = async () => {
      throw new Error('offline');
    };
    await run();
    await waitFor(() => expect(mockNotify).toHaveBeenCalled());
    expect(await manager!.getPendingCount()).toBe(0);
    expect(onClear).not.toHaveBeenCalled();
    expect(mockDirectUpdate).not.toHaveBeenCalled();
  });
});
