import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { _resetConflictSurfacingForTests, configureConflictSurfacing } from '../conflictConfig';
import { databaseManager, REPLICATION_STORES } from '../core/DatabaseManager';
import { ReplicatedTable } from '../core/ReplicatedTable';
import type { Logger } from '../dependencies';
import { MutationManager } from '../MutationManager';
import type { RowRefetchAdapter } from '../refetchDirtyRowsById';
import type { PendingMutation, SyncOptions, SyncResult } from '../types';

/** Shared fixtures for the MYK9-771 stale-row re-fetch tests. */

export const AUTH_USER_ID = 'stale-row-refetch-user';

export interface LocalEntry {
  id: string;
  status: string;
  finalPlacement: number | null;
}

export interface RemoteEntry {
  id: string;
  status: string;
  final_placement: number | null;
  version: number;
}

export interface ServerRow {
  status: string;
  final_placement: number | null;
  version: number;
}

/** A table with no `fetchRowsById`: a stale full-row write keeps backing off. */
export class PlainEntriesTable extends ReplicatedTable<LocalEntry> {
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

export class RefetchingEntriesTable extends PlainEntriesTable {
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

export interface UpdateCall {
  data: Record<string, unknown>;
  expectedVersion: unknown;
  /** True when the precondition matched and the server applied the write. */
  applied?: boolean;
}

/** A one-row fake server with a real OCC precondition: `version=eq.<n>` must match. */
export function makeServer(row: ServerRow, options: { offline?: boolean } = {}) {
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
            call.applied = false;
            return { data: [], error: null };
          }
          row.status = data.status as string;
          row.final_placement = data.final_placement as number | null;
          row.version += 1;
          call.applied = true;
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

export function adapterFor(
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
 * The row was clean at version 3 and the device set `status` to `done`; the
 * queued full-row write carries version 3. The server has since moved on.
 */
export async function seedStaleWrite(
  table: ReplicatedTable<LocalEntry>,
  extra: Partial<PendingMutation> = {}
) {
  const tableName = table.getTableName();
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

/**
 * databaseManager.reset() closes the shared IndexedDB without deleting it, so
 * queue reads are scoped to one test's table.
 */
export async function pendingFor(tableName: string): Promise<PendingMutation[]> {
  const db = await databaseManager.getDatabase('test');
  const all = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
  return all.filter(mutation => mutation.tableName === tableName);
}

/** Let the OCC backoff lapse so the next pass attempts the mutation again. */
export function afterBackoff(minutes = 10) {
  const later = Date.now() + minutes * 60_000;
  vi.spyOn(Date, 'now').mockReturnValue(later);
}

/** A FIFO stand-in for navigator.locks that records every lock section. */
export function stubWebLocks() {
  const events: string[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  let sections = 0;
  const request = <R>(name: string, callback: () => Promise<R>): Promise<R> => {
    const id = ++sections;
    const run = tail.then(async () => {
      events.push(`acquire ${name} #${id}`);
      try {
        return await callback();
      } finally {
        events.push(`release #${id}`);
      }
    });
    tail = run.catch(() => undefined);
    return run;
  };
  vi.stubGlobal('navigator', { onLine: true, locks: { request } });
  return events;
}

/**
 * Per-test setup. reset() closes the shared IndexedDB without deleting it, and
 * an upload pass sends EVERY queued mutation to the test's fake server, which
 * ignores the table name. A write another test left queued would land there
 * and move the fake row's version under the test's assertions.
 * @returns a fresh table name for the test.
 */
export async function resetForStaleRowTest(): Promise<string> {
  await databaseManager.reset();
  const db = await databaseManager.getDatabase('test');
  await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
  await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
  configureConflictSurfacing(true);
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    configurable: true,
  });
  return `entries_${crypto.randomUUID()}`;
}

export async function teardownStaleRowTest(manager: MutationManager | undefined) {
  manager?.destroy();
  _resetConflictSurfacingForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await databaseManager.reset();
}

export function startStaleRowManager(table: ReplicatedTable<LocalEntry>, supabase: SupabaseClient) {
  const logger: Logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const manager = new MutationManager(supabase, {
    logger,
    // Keep the runner's self-scheduled retry timer (30s cap) out of the way:
    // only the test's explicit passes upload.
    retryBackoffBase: 60_000,
    getCurrentUserId: async () => AUTH_USER_ID,
    getCurrentUploadContext: async () => ({ authUserId: AUTH_USER_ID, supabaseClient: supabase }),
  });
  table.setMutationManager(manager);
  return { manager, logger };
}
