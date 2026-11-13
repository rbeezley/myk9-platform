/**
 * MYK9-1922: a score the server refuses for good (23514 class_cancelled) is
 * dead-lettered, and Discard on the failed-changes banner must put the entry
 * back as the server has it, so the dog reads unscored. Check-in and in-ring
 * writes take the same Discard path and are covered alongside.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { databaseManager, MutationManager } from '@myk9/replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const ID = 'entry-1';
const AUTH = 'judge-user';

const seed = {
  id: ID,
  showId: 'show-1',
  classId: 'class-1',
  dogId: 'dog-1',
  armband: '200',
  entryStatus: 'confirmed',
  checkInStatus: 'checked-in',
  check_in_status: 'checked-in',
  isScored: false,
  is_scored: false,
  resultStatus: 'pending',
  result_status: 'pending',
} as ReplicatedEntry;

describe('Discard of a refused entry write (MYK9-1922)', () => {
  let table: ReplicatedEntriesTable;
  let manager: MutationManager;

  beforeEach(async () => {
    await databaseManager.reset();
    // The class was cancelled: every ringside write is refused for good.
    const client = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: '23514', message: 'class_cancelled' },
      })),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: client }),
    });
    table = new ReplicatedEntriesTable();
    table.setMutationManager(manager);
    await table.clearCache();
    await table.batchSet([seed], new Map([[ID, 1]]));
  });

  afterEach(async () => {
    manager.destroy();
    await databaseManager.reset();
  });

  async function refuse(mutationId: string | null): Promise<string> {
    await manager.uploadPendingMutations();
    await vi.waitFor(async () => {
      const failed = await manager.getFailedMutations();
      expect(failed.map(m => m.id)).toContain(mutationId);
    });
    return mutationId!;
  }

  it('a refused score is removed and the dog reads unscored again', async () => {
    const scoreId = await table.updateEntry(ID, {
      isScored: true,
      is_scored: true,
      resultStatus: 'qualified',
      result_status: 'qualified',
      checkInStatus: 'completed',
      check_in_status: 'completed',
    });
    expect((await table.get(ID))?.isScored).toBe(true);
    await refuse(scoreId);
    const listener = vi.fn();
    const unsubscribe = table.subscribe(listener, { emitCurrent: false });

    await manager.discardFailedMutation(scoreId!);

    const entry = await table.get(ID);
    expect(entry?.isScored).toBe(false);
    expect(entry?.resultStatus).toBe('pending');
    expect(entry?.checkInStatus).toBe('checked-in');
    const row = await table.getReplicatedRow(ID);
    expect(row?.isDirty).toBe(false);
    expect(await manager.getFailedMutations()).toEqual([]);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    unsubscribe();
  });

  it.each([
    ['check-in', 'no-status', () => table.updateCheckInStatus(ID, 'no-status')],
    ['in-ring', 'in-ring', () => table.updateCheckInStatus(ID, 'in-ring')],
  ])('a refused %s write goes back to the server row on Discard', async (_name, status, write) => {
    const id = await write();
    expect((await table.get(ID))?.checkInStatus).toBe(status);
    await refuse(id);

    await manager.discardFailedMutation(id!);

    expect((await table.get(ID))?.checkInStatus).toBe('checked-in');
    expect((await table.getReplicatedRow(ID))?.isDirty).toBe(false);
  });
});
