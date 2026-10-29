/**
 * MYK9-1476: a staff member whose role was revoked reads ZERO rows from the
 * results view (no own entries in the show). The engine evicts the cached
 * privileged rows after a zero-row full sync only when the entries adapter's
 * independent proof says so; the manager-only count refuses a revoked user, so
 * the "caller has no access to this show" proof must carry it. Dirty rows are
 * never evicted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncReplicatedTableAdapter } from '@myk9/replication';

const engine = vi.hoisted(() => ({ adapters: [] as unknown[], rpc: vi.fn() }));

vi.mock('@myk9/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@myk9/replication')>();
  return {
    ...actual,
    syncReplicatedTable: vi.fn(async (_table: unknown, adapter: unknown) => {
      engine.adapters.push(adapter);
      return { tableName: 'entries', success: true, operation: 'incremental-sync' };
    }),
  };
});

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: engine.rpc },
}));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { ReplicatedEntriesTable, type ReplicatedEntry } from '../ReplicatedEntriesTable';

function entry(id: string): ReplicatedEntry {
  return {
    id,
    showId: 'show-1',
    classId: 'class-1',
    dogId: `dog-${id}`,
    entryStatus: 'confirmed',
  } as ReplicatedEntry;
}

function answerRpc(noAccess: boolean) {
  engine.rpc.mockImplementation(async (name: string) =>
    name === 'entry_results_caller_has_no_show_access'
      ? { data: noAccess, error: null }
      : { data: null, error: { code: '42501', message: 'Not authorized' } }
  );
}

describe('ReplicatedEntriesTable revoked-staff zero-row cleanup (MYK9-1476)', () => {
  let table: ReplicatedEntriesTable;
  let adapter: SyncReplicatedTableAdapter<unknown, ReplicatedEntry>;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    engine.adapters.length = 0;
    engine.rpc.mockReset();
    table = new ReplicatedEntriesTable();
    await table.clearCache();
    await table.sync('show-1');
    adapter = engine.adapters[0] as SyncReplicatedTableAdapter<unknown, ReplicatedEntry>;

    await table.batchSet([entry('clean-1'), entry('clean-2'), entry('dirty-1')]);
    await table.set('dirty-1', { ...entry('dirty-1'), entryStatus: 'withdrawn' }, true);
    await table.updateSyncMetadata({ lastIncrementalSyncAt: 1000, lastFullSyncAt: Date.now() });
    // The cleanup cutoff is strict: rows synced BEFORE the fetch began.
    await new Promise(resolve => setTimeout(resolve, 5));
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  /** The real adapter and the real engine, with the view answering zero rows. */
  async function zeroRowFullSync() {
    const { syncReplicatedTable } =
      await vi.importActual<typeof import('@myk9/replication')>('@myk9/replication');
    return syncReplicatedTable(table, {
      ...adapter,
      fetchRemoteRows: async () => [],
      getRemoteRowCount: async () => 0,
    });
  }

  it('removes the clean cached rows and keeps the dirty one once the server proves no access', async () => {
    answerRpc(true);

    const result = await zeroRowFullSync();

    expect(result.success).toBe(true);
    expect(engine.rpc).toHaveBeenCalledWith('entry_results_caller_has_no_show_access', {
      p_show_id: 'show-1',
    });
    expect(await table.get('clean-1')).toBeNull();
    expect(await table.get('clean-2')).toBeNull();
    expect(await table.get('dirty-1')).not.toBeNull();
  });

  it('keeps every row when the server does not prove the caller lost access', async () => {
    answerRpc(false);

    const result = await zeroRowFullSync();

    expect(result.success).toBe(true);
    expect(await table.get('clean-1')).not.toBeNull();
    expect(await table.get('clean-2')).not.toBeNull();
    expect(await table.get('dirty-1')).not.toBeNull();
  });
});
