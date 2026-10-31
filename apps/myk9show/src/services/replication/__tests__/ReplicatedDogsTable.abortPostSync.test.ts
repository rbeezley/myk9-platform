/**
 * MYK9-1624: the dogs post-download reconcile (a live-id read, then a local
 * delete) honours a cancelled pass. Abort landing before or during the id read
 * means nothing is pruned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPLICATION_STORES, databaseManager } from '@myk9/replication';
import { ReplicatedDogsTable } from '../ReplicatedDogsTable';
import { resetIdScanCadence } from '../idScanCadence';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { supabase } from '@/services/database/supabaseClient';

function installServer(onIdRead: () => void) {
  const sentSignals: unknown[] = [];
  vi.mocked(supabase.from).mockImplementation((() => {
    let cols = '';
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'gt', 'is', 'eq', 'order', 'limit', 'or', 'range']) {
      builder[method] = (arg?: string, opts?: { head?: boolean }) => {
        if (method === 'select') cols = opts?.head ? 'count' : String(arg);
        return builder;
      };
    }
    builder.abortSignal = (signal: unknown) => {
      sentSignals.push(signal);
      return builder;
    };
    builder.then = (resolve: (v: unknown) => unknown) => {
      if (cols === 'id') onIdRead();
      if (cols === 'count') return resolve({ count: null, error: { message: 'no count' } });
      return resolve({ data: cols === 'id' ? [{ id: 'dog-2' }] : [], error: null });
    };
    return builder;
  }) as unknown as typeof supabase.from);
  return sentSignals;
}

/** The raw replica row, bypassing the table's (mocked) reads. */
async function staleDogRow() {
  const db = await databaseManager.getDatabase('tests');
  return db.get(REPLICATION_STORES.REPLICATED_TABLES, ['dogs', 'dog-stale']);
}

describe('ReplicatedDogsTable post-download reconcile and cancellation (MYK9-1624)', () => {
  let table: ReplicatedDogsTable;
  beforeEach(async () => {
    await databaseManager.reset();
    resetIdScanCadence();
    table = new ReplicatedDogsTable();
    // A stale dog the id read does not list: the real prune removes it.
    await table.set('dog-stale', { id: 'dog-stale', name: 'Stale' } as never);
    expect(await staleDogRow()).toBeDefined();
    const now = Date.now();
    vi.spyOn(table, 'getSyncMetadata').mockResolvedValue({
      tableName: 'dogs',
      lastFullSyncAt: now,
      lastIncrementalSyncAt: now,
      totalRows: 1,
      syncStatus: 'idle',
    } as never);
    vi.spyOn(table, 'getAllOrThrow').mockResolvedValue([{ id: 'dog-1', name: 'A' } as never]);
    vi.spyOn(table, 'getReplicatedRowIncludingOtherAccounts').mockResolvedValue(null);
    vi.spyOn(table, 'batchSet').mockResolvedValue();
    vi.spyOn(table, 'updateSyncMetadata').mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await databaseManager.reset();
  });

  it('prunes with the signal on the id read when the pass is live', async () => {
    const controller = new AbortController();
    const sent = installServer(() => {});

    await table.sync('', { signal: controller.signal });

    expect(sent).toContain(controller.signal);
    expect(await staleDogRow()).toBeUndefined();
  });

  it('an abort during the id read prunes nothing', async () => {
    const controller = new AbortController();
    installServer(() => controller.abort());

    const result = await table.sync('', { signal: controller.signal });

    expect(result.success).toBe(true);
    // The id response arrived after the cancel: the real prune refuses.
    expect(await staleDogRow()).toBeDefined();
  });

  it('an abort after the download, before the id read, deletes nothing', async () => {
    const controller = new AbortController();
    installServer(() => {});
    // Aborts once the download phase has finished writing, before the reconcile.
    vi.spyOn(table, 'updateSyncMetadata').mockImplementation(async () => {
      controller.abort();
    });

    await table.sync('', { signal: controller.signal });

    expect(await staleDogRow()).toBeDefined();
  });
});
