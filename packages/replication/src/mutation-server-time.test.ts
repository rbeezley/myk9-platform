import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MutationManager } from './MutationManager';
import {
  PlainEntriesTable,
  resetForStaleRowTest,
  startStaleRowManager,
  teardownStaleRowTest,
} from './test-utils/staleRowRefetchFixtures';

/** The server's updated_at read back with an acknowledged write, for tables that opt in. */

class WritingTable extends PlainEntriesTable {
  async create(id: string, status: string) {
    await this.set(id, { id, status, finalPlacement: null }, true);
    return this.queueMutation('INSERT', id, { id, status });
  }
  async edit(id: string, status: string) {
    await this.set(id, { id, status, finalPlacement: null }, true);
    return this.queueMutation('UPDATE', id, { id, status });
  }
}

class OptedTable extends WritingTable {
  protected override readonly readsBackServerUpdatedAt = true;
}

const STAMP = '2026-10-26T12:00:00.000Z';

/** A server that records the select() column list of every write and returns updated_at. */
function recordingServer() {
  const selects: string[] = [];
  const supabase = {
    from: () => ({
      insert: () => ({
        select: async (columns: string) => {
          selects.push(columns);
          return { data: [{ id: 'row-1', updated_at: STAMP }], error: null };
        },
      }),
      update: () => {
        const builder = {
          eq: () => builder,
          select: async (columns: string) => {
            selects.push(columns);
            return { data: [{ id: 'row-1', version: 2, updated_at: STAMP }], error: null };
          },
        };
        return builder;
      },
    }),
  } as unknown as SupabaseClient;
  return { supabase, selects };
}

describe('reading the server updated_at back with an acknowledged write', () => {
  let manager: MutationManager | undefined;
  let tableName: string;

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });
  afterEach(() => teardownStaleRowTest(manager));

  it('leaves the select column lists byte-identical for a table that did not opt in', async () => {
    const table = new WritingTable(tableName);
    const { supabase, selects } = recordingServer();
    manager = startStaleRowManager(table, supabase).manager;
    await table.create('row-1', 'a');
    await manager.uploadPendingMutations();
    await table.edit('row-1', 'b');
    await manager.uploadPendingMutations();

    expect(selects).toEqual(['id', 'id, version']);
    expect((await table.getReplicatedRow('row-1'))?.data).not.toHaveProperty('serverUpdatedAt');
  });

  it('reads updated_at back for an opted-in table and stores it on the row', async () => {
    const table = new OptedTable(tableName);
    const { supabase, selects } = recordingServer();
    manager = startStaleRowManager(table, supabase).manager;
    await table.create('row-1', 'a');
    await manager.uploadPendingMutations();
    expect(selects).toEqual(['id, updated_at']);
    expect((await table.getReplicatedRow('row-1'))?.data).toMatchObject({
      serverUpdatedAt: Date.parse(STAMP),
    });

    await table.edit('row-1', 'b');
    await manager.uploadPendingMutations();
    expect(selects).toEqual(['id, updated_at', 'id, version, updated_at']);
    expect((await table.getReplicatedRow('row-1'))?.data).toMatchObject({
      status: 'b',
      serverUpdatedAt: Date.parse(STAMP),
    });
  });

  it('does not stamp a row that a newer queued write has since changed', async () => {
    const table = new OptedTable(tableName);
    const { supabase } = recordingServer();
    manager = startStaleRowManager(table, supabase).manager;
    await table.create('row-1', 'a');
    await table.edit('row-1', 'b'); // queued behind the insert, before it is acknowledged

    // Send only the INSERT: the UPDATE is held back in backoff.
    const queued = await manager.getPendingMutationsForTable(tableName);
    const update = queued.find(m => m.operation === 'UPDATE')!;
    const { databaseManager, REPLICATION_STORES } = await import('./core/DatabaseManager');
    const db = await databaseManager.getDatabase('test');
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
      ...update,
      nextRetryAt: Date.now() + 3_600_000,
    });
    await manager.uploadPendingMutations();

    const row = await table.getReplicatedRow('row-1');
    expect(row?.isDirty).toBe(true);
    expect(row?.data).not.toHaveProperty('serverUpdatedAt');
  });
});
