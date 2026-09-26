import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { MutationQueueStore } from './MutationQueueStore';
import type { PendingMutation } from './types';

const AUTH_USER_ID = 'reconcile-race-user';

/**
 * MYK9-791. reconcilePendingMutationsForRow reads the row's queued writes, then
 * writes the rebuilt ones back. A write that uploads and is acknowledged in
 * between must stay deleted: writing it back would upload it a second time.
 */
describe('reconcilePendingMutationsForRow and a write deleted mid-reconcile (MYK9-791)', () => {
  let tableName: string;

  beforeEach(async () => {
    await databaseManager.reset();
    tableName = `entries_${crypto.randomUUID()}`;
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  function queued(id: string, data: Record<string, unknown>): PendingMutation {
    return {
      id,
      authUserId: AUTH_USER_ID,
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', ...data },
      explicitDataKeys: ['id', ...Object.keys(data)],
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      serverVersion: 3,
    };
  }

  async function queuedFor(): Promise<PendingMutation[]> {
    const db = await databaseManager.getDatabase('test');
    const all = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
    return all.filter(mutation => mutation.tableName === tableName);
  }

  it('does not bring back a write acknowledged between the read and the write-back', async () => {
    const db = await databaseManager.getDatabase('test');
    const acknowledged = queued(`ack-${tableName}`, { status: 'done' });
    const stillQueued = queued(`kept-${tableName}`, { final_placement: 1 });
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, acknowledged);
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, stillQueued);
    const store = new MutationQueueStore({
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    });

    const changed = await store.reconcilePendingMutationsForRow(
      tableName,
      '1',
      8,
      AUTH_USER_ID,
      { id: '1', status: 'done', final_placement: 1 },
      [],
      // Runs after the read and before the write-back: the upload runner
      // acknowledges the first write and deletes it from the queue.
      async () => {
        await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, acknowledged.id);
      }
    );

    expect(await queuedFor()).toEqual([
      expect.objectContaining({ id: stillQueued.id, serverVersion: 8 }),
    ]);
    expect(changed).toBe(1);
  });

  it('updateMutationServerVersions does not bring one back either', async () => {
    const db = await databaseManager.getDatabase('test');
    const acknowledged = queued(`ack-${tableName}`, { status: 'done' });
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, acknowledged);
    const store = new MutationQueueStore({
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    });

    const updated = await store.updateMutationServerVersions(
      tableName,
      '1',
      8,
      AUTH_USER_ID,
      async () => {
        await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, acknowledged.id);
      }
    );

    expect(await queuedFor()).toEqual([]);
    expect(updated).toBe(0);
  });
});
