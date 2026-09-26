import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetConflictSurfacingForTests, configureConflictSurfacing } from './conflictConfig';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { ReplicatedTable } from './core/ReplicatedTable';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { OccRejectionError } from './mutation-occ';
import { handleOccRejection } from './mutation-occ-rejection';
import type { RowRefetchAdapter } from './refetchDirtyRowsById';
import { syncReplicatedTable } from './syncReplicatedTable';
import type { PendingMutation, SyncOptions, SyncResult } from './types';

const AUTH_USER_ID = 'stale-row-refetch-user';

interface LocalEntry {
  id: string;
  status: string;
  finalPlacement: number | null;
}

interface RemoteEntry {
  id: string;
  status: string;
  final_placement: number | null;
  version: number;
}

interface ServerRow {
  status: string;
  final_placement: number | null;
  version: number;
}

/** A table with no `fetchRowsById`: a stale full-row write keeps backing off. */
class PlainEntriesTable extends ReplicatedTable<LocalEntry> {
  async sync(_scope: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(_local: LocalEntry, remote: LocalEntry): LocalEntry {
    return remote;
  }
}

class RefetchingEntriesTable extends PlainEntriesTable {
  constructor(
    tableName: string,
    private readonly adapter: RowRefetchAdapter<RemoteEntry, LocalEntry>
  ) {
    super(tableName);
  }

  protected override getRowRefetchAdapter(): RowRefetchAdapter<RemoteEntry, LocalEntry> {
    return this.adapter;
  }
}

interface UpdateCall {
  data: Record<string, unknown>;
  expectedVersion: unknown;
}

/** A one-row fake server with a real OCC precondition: `version=eq.<n>` must match. */
function makeServer(row: ServerRow, options: { offline?: boolean } = {}) {
  const updates: UpdateCall[] = [];
  const from = vi.fn(() => ({
    update: (data: Record<string, unknown>) => {
      const call: UpdateCall = { data, expectedVersion: undefined };
      updates.push(call);
      const builder = {
        eq(column: string, value: unknown) {
          if (column === 'version') call.expectedVersion = value;
          return builder;
        },
        async select() {
          if (options.offline) throw new TypeError('Failed to fetch');
          if (call.expectedVersion !== undefined && call.expectedVersion !== row.version) {
            return { data: [], error: null };
          }
          row.status = data.status as string;
          row.final_placement = data.final_placement as number | null;
          row.version += 1;
          return { data: [{ id: data.id, version: row.version }], error: null };
        },
      };
      return builder;
    },
    // The OCC re-check that tells a stale token from an RLS denial.
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { version: row.version }, error: null }),
      }),
    }),
  }));
  return { supabase: { from } as unknown as SupabaseClient, updates };
}

function adapterFor(
  row: ServerRow,
  fetchRowsById?: (ids: string[]) => Promise<RemoteEntry[]>
): RowRefetchAdapter<RemoteEntry, LocalEntry> {
  return {
    fetchRowsById: vi.fn(
      fetchRowsById ?? (async (ids: string[]) => (ids.includes('1') ? [{ id: '1', ...row }] : []))
    ),
    getRemoteId: remote => remote.id,
    toLocalRow: remote => ({
      id: remote.id,
      status: remote.status,
      finalPlacement: remote.final_placement,
    }),
    rebuildUpdatePayload: local => ({
      id: local.id,
      status: local.status,
      final_placement: local.finalPlacement,
    }),
  };
}

/**
 * MYK9-771. A queued full-row UPDATE can hold an OCC token older than the
 * server's. The OCC handler advances only the ROW's token, and an incremental
 * sync never downloads a row it already holds at the server's version, so the
 * write retried `version=eq.<stale>` forever while the page read it as saved.
 * Each such rejection now re-fetches exactly that row and reconciles it.
 */
describe('a stale full-row write re-fetches its row (MYK9-771)', () => {
  let manager: MutationManager;
  let tableName: string;

  beforeEach(async () => {
    await databaseManager.reset();
    // reset() closes the shared IndexedDB without deleting it, and an upload
    // pass sends EVERY queued mutation to this test's fake server, which
    // ignores the table name. A write another test left queued would land
    // here and move the fake row's version under this test's assertions.
    const db = await databaseManager.getDatabase('test');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    configureConflictSurfacing(true);
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      configurable: true,
    });
    tableName = `entries_${crypto.randomUUID()}`;
  });

  afterEach(async () => {
    manager?.destroy();
    _resetConflictSurfacingForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  function startManager(table: ReplicatedTable<LocalEntry>, supabase: SupabaseClient) {
    const logger: Logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    manager = new MutationManager(supabase, {
      logger,
      // Keep the runner's self-scheduled retry timer (30s cap) out of the way:
      // only the test's explicit passes upload.
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH_USER_ID,
      getCurrentUploadContext: async () => ({ authUserId: AUTH_USER_ID, supabaseClient: supabase }),
    });
    table.setMutationManager(manager);
    return logger;
  }

  /**
   * The row was clean at version 3 and the device set `status` to `done`; the
   * queued full-row write carries version 3. The server has since moved on.
   */
  async function seedStaleWrite(
    table: ReplicatedTable<LocalEntry>,
    extra: Partial<PendingMutation> = {}
  ) {
    await table.set('1', { id: '1', status: 'scored', finalPlacement: null }, false, undefined, 3);
    await table.set('1', { id: '1', status: 'done', finalPlacement: null }, true);
    const db = await databaseManager.getDatabase('test');
    const mutation: PendingMutation = {
      id: `mut-stale-${tableName}`,
      authUserId: AUTH_USER_ID,
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', status: 'done', final_placement: null },
      explicitDataKeys: ['id', 'status', 'final_placement'],
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      serverVersion: 3,
      ...extra,
    };
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
  }

  // databaseManager.reset() closes the shared IndexedDB without deleting it, so
  // queue reads are scoped to this test's table.
  async function pending(): Promise<PendingMutation[]> {
    const db = await databaseManager.getDatabase('test');
    const all = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
    return all.filter(mutation => mutation.tableName === tableName);
  }

  /** Let the OCC backoff lapse so the next pass attempts the mutation again. */
  function afterBackoff(minutes = 10) {
    const later = Date.now() + minutes * 60_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
  }

  it('a stale token alone rebases the write onto the server version, then uploads', async () => {
    // Another writer set `final_placement` (a field this device never touched)
    // and moved the server to version 8.
    const serverRow: ServerRow = { status: 'scored', final_placement: 2, version: 8 };
    const adapter = adapterFor(serverRow);
    const table = new RefetchingEntriesTable(tableName, adapter);
    const { supabase, updates } = makeServer(serverRow);
    startManager(table, supabase);
    await seedStaleWrite(table);

    await manager.uploadPendingMutations();

    await vi.waitFor(async () => expect((await pending())[0]?.serverVersion).toBe(8));
    expect(adapter.fetchRowsById).toHaveBeenCalledWith(['1']);
    // Rebuilt from the reconciled row: the local edit survives and the other
    // writer's field is kept, not regressed to null.
    expect((await pending())[0]?.data).toEqual({ id: '1', status: 'done', final_placement: 2 });

    afterBackoff();
    await manager.uploadPendingMutations();

    expect(updates.map(call => call.expectedVersion)).toEqual([3, 8]);
    expect(await pending()).toHaveLength(0);
    expect(serverRow).toEqual({ status: 'done', final_placement: 2, version: 9 });
  });

  it('a genuine same-field conflict surfaces for reconciliation and is never overwritten', async () => {
    // Another writer changed `status`, the field this device also wrote.
    const serverRow: ServerRow = { status: 'scratched', final_placement: null, version: 8 };
    const adapter = adapterFor(serverRow);
    const table = new RefetchingEntriesTable(tableName, adapter);
    const { supabase, updates } = makeServer(serverRow);
    startManager(table, supabase);
    await seedStaleWrite(table);
    const conflicts: unknown[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        if (event.type === 'replication:conflict') conflicts.push((event as CustomEvent).detail);
        return true;
      },
    });

    await manager.uploadPendingMutations();

    await vi.waitFor(async () =>
      expect((await table.getReplicatedRow('1'))?.syncStatus).toBe('conflict')
    );
    expect(conflicts).toHaveLength(1);
    // Not rebased: still on its own token and payload, queued for the resolver.
    expect(await pending()).toMatchObject([
      { serverVersion: 3, data: { id: '1', status: 'done', final_placement: null } },
    ]);

    afterBackoff();
    await manager.uploadPendingMutations();
    expect(await pending()).toHaveLength(1);
    expect(serverRow).toEqual({ status: 'scratched', final_placement: null, version: 8 });
    expect(updates.every(call => call.expectedVersion === 3)).toBe(true);
  });

  it('a failed fetch leaves the write queued, and the next rejection fetches again', async () => {
    const serverRow: ServerRow = { status: 'scored', final_placement: 2, version: 8 };
    let calls = 0;
    const adapter = adapterFor(serverRow, async ids => {
      calls++;
      if (calls === 1) throw new Error('network down');
      return ids.includes('1') ? [{ id: '1', ...serverRow }] : [];
    });
    const table = new RefetchingEntriesTable(tableName, adapter);
    const { supabase, updates } = makeServer(serverRow);
    const logger = startManager(table, supabase);
    await seedStaleWrite(table);

    await manager.uploadPendingMutations();
    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('its next rejection retries the fetch'),
        expect.any(Error)
      )
    );
    expect(adapter.fetchRowsById).toHaveBeenCalledTimes(1);

    // Nothing lost and nothing recorded: still dirty, still queued as written.
    expect((await table.getReplicatedRow('1'))?.isDirty).toBe(true);
    expect(await pending()).toMatchObject([
      { serverVersion: 3, data: { id: '1', status: 'done', final_placement: null } },
    ]);

    afterBackoff();
    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect((await pending())[0]?.serverVersion).toBe(8));
    expect(adapter.fetchRowsById).toHaveBeenCalledTimes(2);

    afterBackoff(30);
    await manager.uploadPendingMutations();
    expect(updates.map(call => call.expectedVersion)).toEqual([3, 3, 8]);
    expect(await pending()).toHaveLength(0);
  });

  it('a table without fetchRowsById keeps the current behavior', async () => {
    const serverRow: ServerRow = { status: 'scored', final_placement: 2, version: 8 };
    const table = new PlainEntriesTable(tableName);
    const { supabase } = makeServer(serverRow);
    startManager(table, supabase);
    await seedStaleWrite(table);

    await manager.uploadPendingMutations();

    expect(manager.rowRefetchers.request(tableName, '1')).toBeUndefined();
    // The row token advanced; the queued write kept its own token.
    expect((await table.getReplicatedRow('1'))?.serverVersion).toBe(8);
    expect(await pending()).toMatchObject([{ serverVersion: 3, occRetries: 1 }]);
  });

  it('an offline upload never re-fetches: the queued write stays exactly as written', async () => {
    const serverRow: ServerRow = { status: 'scored', final_placement: 2, version: 8 };
    const adapter = adapterFor(serverRow);
    const table = new RefetchingEntriesTable(tableName, adapter);
    startManager(table, makeServer(serverRow, { offline: true }).supabase);
    await seedStaleWrite(table);

    await manager.uploadPendingMutations();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(adapter.fetchRowsById).not.toHaveBeenCalled();
    expect(await pending()).toMatchObject([
      { serverVersion: 3, data: { id: '1', status: 'done', final_placement: null } },
    ]);
    expect((await table.getReplicatedRow('1'))?.serverVersion).toBe(3);
  });

  it('an OCC-rejected ringside score (RPC delta) is never re-fetched and stays queued', async () => {
    const serverRow: ServerRow = { status: 'scored', final_placement: 2, version: 8 };
    const adapter = adapterFor(serverRow);
    const table = new RefetchingEntriesTable(tableName, adapter);
    startManager(table, makeServer(serverRow).supabase);
    await seedStaleWrite(table, {
      rpc: { name: 'ringside_update_entry', fields: { status: 'done' } },
    });
    const db = await databaseManager.getDatabase('test');
    const [queued] = await pending();
    const requestRowRefetch = vi.fn();

    await handleOccRejection({
      db,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      error: new OccRejectionError(tableName, '1', 3, 8),
      queuedMutation: queued!,
      now: Date.now(),
      retryBackoffBase: 1000,
      maxOccAttempts: 50,
      results: [],
      failedMutations: [],
      blockedDependencyIds: new Set(),
      failedDependencyIds: new Set(),
      requestRowRefetch,
    });

    expect(requestRowRefetch).not.toHaveBeenCalled();
    expect(adapter.fetchRowsById).not.toHaveBeenCalled();
    expect(await pending()).toMatchObject([
      { rpc: { name: 'ringside_update_entry', fields: { status: 'done' } }, occRetries: 1 },
    ]);
  });

  it('a download that finds the row token already current still rebases a write behind it', async () => {
    // The kept half of the first MYK9-771 attempt: an OCC rejection advanced the
    // row's token to 8, the queued write is still on 3, and a later sync
    // downloads the row at 8. Before, reconcileDirtyRow rebased only when the
    // download moved the row token forward.
    const serverRow: ServerRow = { status: 'scored', final_placement: 2, version: 8 };
    const table = new PlainEntriesTable(tableName);
    startManager(table, makeServer(serverRow).supabase);
    await seedStaleWrite(table);
    const db = await databaseManager.getDatabase('test');
    const { advanceReplicatedRowServerVersion } = await import('./mutation-row-sync');
    await advanceReplicatedRowServerVersion(db, tableName, '1', 8);

    const adapter = adapterFor(serverRow);
    await syncReplicatedTable(
      table,
      { ...adapter, fetchRemoteRows: async () => [{ id: '1', ...serverRow }] },
      {},
      { conflictSurfacingEnabled: true }
    );

    expect(await pending()).toMatchObject([
      { serverVersion: 8, data: { id: '1', status: 'done', final_placement: 2 } },
    ]);
  });

  it('discards a by-id response older than a sync that landed while it was in flight', async () => {
    // The rejection advanced the row to 8. While the re-fetch of version 8 is in
    // flight, a normal sync downloads version 9 (another writer set
    // final_placement to 3) and rebases the write onto it. The late version-8
    // response must not roll the row, its base or the write back.
    const v8: ServerRow = { status: 'scored', final_placement: 2, version: 8 };
    const v9: ServerRow = { status: 'scored', final_placement: 3, version: 9 };
    const syncAdapter = adapterFor(v9);
    let table!: RefetchingEntriesTable;
    const adapter = adapterFor(v8, async () => {
      await syncReplicatedTable(
        table,
        { ...syncAdapter, fetchRemoteRows: async () => [{ id: '1', ...v9 }] },
        {},
        { conflictSurfacingEnabled: true }
      );
      return [{ id: '1', ...v8 }];
    });
    table = new RefetchingEntriesTable(tableName, adapter);
    startManager(table, makeServer(v9).supabase);
    await seedStaleWrite(table);
    const db = await databaseManager.getDatabase('test');
    const { advanceReplicatedRowServerVersion } = await import('./mutation-row-sync');
    await advanceReplicatedRowServerVersion(db, tableName, '1', 8);

    await manager.rowRefetchers.request(tableName, '1');

    const row = await table.getReplicatedRow('1');
    expect(row?.syncStatus).not.toBe('conflict');
    expect(row?.serverVersion).toBe(9);
    expect(row?.data).toEqual({ id: '1', status: 'done', finalPlacement: 3 });
    expect(row?.baseData).toEqual({ id: '1', status: 'scored', finalPlacement: 3 });
    expect(await pending()).toMatchObject([
      { serverVersion: 9, data: { id: '1', status: 'done', final_placement: 3 } },
    ]);
  });
});
