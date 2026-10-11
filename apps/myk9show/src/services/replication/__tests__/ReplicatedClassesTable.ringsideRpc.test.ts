/**
 * MYK9-1096 / MYK9-1086: ringside class writes route through ringside_update_class.
 *
 * Value-sensitive: a judge's status change or max time reaches the server only if the queued
 * mutation names the RPC with the class id parameter and the snake_case delta. A direct UPDATE
 * is denied by classes_update RLS for a judge and dead-letters long after the judge saw it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { ReplicatedClassesTable, type ReplicatedClass } from '../ReplicatedClassesTable';
import { REPLICATION_STORES } from '@myk9/replication';

type QueueMutation = (
  operation: string,
  rowId: string,
  payload: Record<string, unknown>,
  dependsOn?: string[],
  rpc?: { name: string; idParam?: string; fields?: Record<string, unknown> }
) => Promise<string | null>;

function baseClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Container Novice A',
    classStatus: 'upcoming',
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
    ...overrides,
  };
}

describe('ReplicatedClassesTable ringside routing (MYK9-1096 / MYK9-1086)', () => {
  let table: ReplicatedClassesTable;
  let queueMutation: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    table = new ReplicatedClassesTable();
    const resettable = table as unknown as {
      runTransaction: (
        storeName: string,
        mode: IDBTransactionMode,
        callback: (store: { clear?: () => Promise<void> }) => Promise<void>
      ) => Promise<void>;
    };
    for (const storeName of [
      REPLICATION_STORES.REPLICATED_TABLES,
      REPLICATION_STORES.SYNC_METADATA,
    ]) {
      await resettable.runTransaction(storeName, 'readwrite', async store => {
        await store.clear?.();
      });
    }
    queueMutation = vi.spyOn(table as unknown as { queueMutation: QueueMutation }, 'queueMutation');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queues a ringside status change through ringside_update_class', async () => {
    await table.set('class-1', baseClass());

    await table.updateClass('class-1', { classStatus: 'in_progress', startTime: '09:30' });

    const call = queueMutation.mock.calls.at(-1)!;
    expect(call[0]).toBe('UPDATE');
    expect(call[1]).toBe('class-1');
    expect(call[4]).toEqual({
      name: 'ringside_update_class',
      idParam: 'p_class_id',
      fields: { status: 'in_progress', start_time: '09:30' },
    });
  });

  it('queues a max time change through ringside_update_class', async () => {
    await table.set('class-1', baseClass());

    await table.updateClass('class-1', { timeLimitSeconds: 150 });

    expect(queueMutation.mock.calls.at(-1)![4]).toEqual({
      name: 'ringside_update_class',
      idParam: 'p_class_id',
      fields: { time_limit_seconds: 150 },
    });
  });

  it('keeps a secretary edit of other columns on the direct path', async () => {
    await table.set('class-1', baseClass());

    await table.updateClass('class-1', { name: 'Renamed', timeLimitSeconds: 150 });

    expect(queueMutation.mock.calls.at(-1)![4]).toBeUndefined();
  });
});
