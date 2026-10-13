/**
 * MYK9-1143: a registration delete hides its row from every dog's
 * registrations read at once, instead of waiting on the replica listener's
 * refetch. A failed delete refetches from the replica, the source of truth,
 * rather than restoring a snapshot that could resurrect another delete.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { createTestQueryClient, renderHook } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { useDeleteRegistrationMutation } from '@/hooks/queries/useRegistrationsDatabase';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import type { RegistrationsForDog } from '@/services/database/registrations/replicaReads';

/** What the replica holds for dog-1; the read below answers from it. */
let replica: string[];

const asRead = (ids: string[]): RegistrationsForDog =>
  ({ rows: ids.map(id => ({ id })), source: 'device' }) as unknown as RegistrationsForDog;

/** A delete the test settles by hand. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderDelete() {
  const queryClient = createTestQueryClient();
  const { result } = renderHook(
    () => ({
      read: useQuery({
        queryKey: queryKeys.registrationsByDog('dog-1'),
        queryFn: async () => asRead([...replica]),
      }),
      remove: useDeleteRegistrationMutation(),
    }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    }
  );
  await vi.waitFor(() => expect(result.current.read.data).toBeDefined());
  const rowIds = () => result.current.read.data?.rows.map(row => row.id);
  /** What the replica listener does on every replica change. */
  const listenerRefresh = () =>
    act(() => queryClient.invalidateQueries({ queryKey: queryKeys.registrationsByDogAll }));
  return { result, rowIds, listenerRefresh };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a registration delete', () => {
  it('hides the row from the dog’s cached registrations before the write settles', async () => {
    replica = ['reg-1', 'reg-2'];
    const write = deferred();
    vi.spyOn(replicatedDogRegistrationsTable, 'deleteRegistration').mockReturnValue(write.promise);
    const { result, rowIds } = await renderDelete();

    let settled!: Promise<void>;
    act(() => {
      settled = result.current.remove.mutateAsync('reg-1');
    });
    await vi.waitFor(() => expect(rowIds()).toEqual(['reg-2']));

    replica = ['reg-2'];
    await act(async () => {
      write.resolve();
      await settled;
    });
    expect(rowIds()).toEqual(['reg-2']);
  });

  it('a failed delete brings its row back from the replica', async () => {
    replica = ['reg-1', 'reg-2'];
    const write = deferred();
    vi.spyOn(replicatedDogRegistrationsTable, 'deleteRegistration').mockReturnValue(write.promise);
    const { result, rowIds } = await renderDelete();

    let settled!: Promise<void>;
    act(() => {
      settled = result.current.remove.mutateAsync('reg-1');
    });
    await vi.waitFor(() => expect(rowIds()).toEqual(['reg-2']));

    await act(async () => {
      write.reject(new Error('refused'));
      await settled.catch(() => undefined);
    });
    await vi.waitFor(() => expect(rowIds()).toEqual(['reg-1', 'reg-2']));
  });

  // Codex P2: delete A waits on a cold-row load while delete B succeeds and is
  // reconciled. A then fails. Restoring A's snapshot brought B back too.
  it('a failed delete does not bring back another delete that succeeded meanwhile', async () => {
    replica = ['reg-a', 'reg-b'];
    const deleteA = deferred();
    vi.spyOn(replicatedDogRegistrationsTable, 'deleteRegistration').mockImplementation(id =>
      id === 'reg-a' ? deleteA.promise : Promise.resolve()
    );
    const { result, rowIds, listenerRefresh } = await renderDelete();

    let settledA!: Promise<void>;
    act(() => {
      settledA = result.current.remove.mutateAsync('reg-a');
    });
    await vi.waitFor(() => expect(rowIds()).toEqual(['reg-b']));

    await act(async () => {
      await result.current.remove.mutateAsync('reg-b');
    });
    replica = ['reg-a'];
    await listenerRefresh();
    await vi.waitFor(() => expect(rowIds()).toEqual(['reg-a']));

    await act(async () => {
      deleteA.reject(new Error('refused'));
      await settledA.catch(() => undefined);
    });
    // Let any refetch the failure starts land before judging the screen.
    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
    expect(rowIds()).toEqual(['reg-a']);
  });
});
