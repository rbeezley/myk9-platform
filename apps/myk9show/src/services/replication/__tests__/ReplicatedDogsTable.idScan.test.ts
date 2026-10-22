/**
 * Dog id scan cadence (MYK9-1302): a dog removed on the server is still pruned
 * when the scan is due, and an intermediate pass does not send the id read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedDogsTable } from '../ReplicatedDogsTable';
import { ID_SCAN_INTERVAL_MS, resetIdScanCadence } from '../idScanCadence';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { supabase } from '@/services/database/supabaseClient';

/** Every builder method chains; awaiting resolves ids for `select('id')`, else the delta. */
function installServer(liveIds: string[]): { idReads: () => number } {
  let idReads = 0;
  vi.mocked(supabase.from).mockImplementation((() => {
    let cols = '';
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'gt', 'is', 'eq', 'order', 'limit', 'or', 'range']) {
      builder[method] = (arg?: string, opts?: { head?: boolean }) => {
        if (method === 'select') {
          cols = opts?.head ? 'count' : String(arg);
        }
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) => {
      if (cols === 'id') idReads += 1;
      if (cols === 'count') return resolve({ count: null, error: { message: 'no count' } });
      return resolve({ data: cols === 'id' ? liveIds.map(id => ({ id })) : [], error: null });
    };
    return builder;
  }) as unknown as typeof supabase.from);
  return { idReads: () => idReads };
}

describe('ReplicatedDogsTable id scan cadence', () => {
  let table: ReplicatedDogsTable;
  let pruned: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    resetIdScanCadence();
    table = new ReplicatedDogsTable();
    const now = Date.now();
    // A warm, recently full-synced replica holding one dog: an incremental pass.
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
    pruned = vi.spyOn(
      table as unknown as { removeStaleEntries: (ids: Set<string>) => Promise<number> },
      'removeStaleEntries'
    ) as never;
    pruned.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('scans on the first pass, skips the next, and prunes again when an hour has passed', async () => {
    const server = installServer(['dog-2']);

    const first = await table.sync('');
    expect(first.operation).toBe('incremental-sync');
    expect(server.idReads()).toBe(1);
    expect(pruned).toHaveBeenCalledTimes(1);
    expect([...pruned.mock.calls[0]![0]]).toEqual(['dog-2']);

    vi.setSystemTime(Date.now() + 60_000);
    await table.sync('');
    expect(server.idReads()).toBe(1);
    expect(pruned).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + ID_SCAN_INTERVAL_MS);
    await table.sync('');
    expect(server.idReads()).toBe(2);
    expect(pruned).toHaveBeenCalledTimes(2);
  });

  it('leaves the scan owed when an id page fails', async () => {
    vi.mocked(supabase.from).mockImplementation((() => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'gt', 'is', 'eq', 'order', 'limit', 'or', 'range']) b[m] = () => b;
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: { message: 'x' } });
      return b;
    }) as unknown as typeof supabase.from);
    await table.reconcileDeleted();

    const server = installServer(['dog-2']);
    await table.sync('');
    expect(server.idReads()).toBe(1);
  });
});
