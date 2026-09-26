import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager } from './core/DatabaseManager';
import type { ReplicatedTable } from './core/ReplicatedTable';
import type { MutationManager } from './MutationManager';
import { OccRejectionError } from './mutation-occ';
import { handleOccRejection } from './mutation-occ-rejection';
import { syncReplicatedTable } from './syncReplicatedTable';
import {
  adapterFor,
  afterBackoff,
  makeServer,
  pendingFor,
  PlainEntriesTable,
  RefetchingEntriesTable,
  resetForStaleRowTest,
  seedStaleWrite,
  startStaleRowManager,
  stubWebLocks,
  teardownStaleRowTest,
  type LocalEntry,
  type ServerRow,
} from './test-utils/staleRowRefetchFixtures';

describe('a stale full-row write re-fetches its row (MYK9-771)', () => {
  let manager: MutationManager;
  let tableName: string;

  beforeEach(async () => {
    tableName = await resetForStaleRowTest();
  });

  afterEach(() => teardownStaleRowTest(manager));

  function startManager(table: ReplicatedTable<LocalEntry>, supabase: SupabaseClient) {
    const started = startStaleRowManager(table, supabase);
    manager = started.manager;
    return started.logger;
  }

  const pending = () => pendingFor(tableName);

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

  it('a re-fetch requested during an upload waits for that upload to release the lock', async () => {
    const events = stubWebLocks();
    const serverRow: ServerRow = { status: 'scored', final_placement: 2, version: 8 };
    const adapter = adapterFor(serverRow, async () => {
      events.push('fetch');
      return [{ id: '1', ...serverRow }];
    });
    const table = new RefetchingEntriesTable(tableName, adapter);
    startManager(table, makeServer(serverRow).supabase);
    await seedStaleWrite(table);

    // The OCC rejection inside the upload queues the re-fetch; awaiting the
    // lock there instead would deadlock this call.
    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect((await pending())[0]?.serverVersion).toBe(8));

    expect(events).toEqual([
      'acquire replication-upload #1',
      'release #1',
      'acquire replication-upload #2',
      'fetch',
      'release #2',
    ]);
  });

  it('no upload, and so no other OCC rejection, can run while a re-fetch holds the lock', async () => {
    const events = stubWebLocks();
    const serverRow: ServerRow = { status: 'scored', final_placement: 2, version: 8 };
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>(resolve => (releaseFetch = resolve));
    const adapter = adapterFor(serverRow, async () => {
      events.push('fetch started');
      await fetchGate;
      events.push('fetch done');
      return [{ id: '1', ...serverRow }];
    });
    const table = new RefetchingEntriesTable(tableName, adapter);
    const { supabase, updates } = makeServer(serverRow);
    startManager(table, supabase);
    await seedStaleWrite(table);

    await manager.uploadPendingMutations();
    await vi.waitFor(() => expect(events).toContain('fetch started'));
    afterBackoff();
    const secondUpload = manager.uploadPendingMutations();
    await new Promise(resolve => setTimeout(resolve, 20));

    // The second upload is parked on the lock: it has sent nothing.
    expect(updates).toHaveLength(1);
    releaseFetch();
    await secondUpload;

    expect(events.indexOf('fetch done')).toBeLessThan(
      events.indexOf('acquire replication-upload #3')
    );
    // It uploaded the REBASED write, not the stale one.
    expect(updates.map(call => call.expectedVersion)).toEqual([3, 8]);
    expect(await pending()).toHaveLength(0);
  });
});
