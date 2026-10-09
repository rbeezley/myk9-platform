import type {
  PendingMutation,
  RefusedRowReplacement,
  ReplaceRefusedRowsResult,
  ReplicatedRow,
  RowRefetchAdapter,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { replicatedDogRegistrationsTable } from './ReplicatedDogRegistrationsTable';
import { replicatedShowDeskPeopleTable } from './ReplicatedShowDeskPeopleTable';

/**
 * Re-pull a refused row from the server (MYK9-1071, decision D3).
 *
 * When the server permanently refuses a queued write (non-retryable, or the
 * user discards it), the local replica row still shows the refused value. That
 * row must not keep claiming something the server rejected (MYK9-1031). The fix
 * is to RE-PULL the server copy, never to hand-heal the local row:
 *   - the server returns the row: it replaces the local row, with its version;
 *   - the server does not (a refused INSERT, or the row is gone or hidden): the
 *     local row is removed.
 * A row edited or queued again since, or whose server copy is older than its
 * token, is left alone (atomically, see replaceRefusedRows in the package). A failed mutation does not protect the row; it stays in
 * failed_mutations for the user's Retry or Discard, untouched by this.
 *
 * Reusable: a table joins by exposing the members below and an entry in
 * REPULL_TABLES (MYK9-1076 will add dogs).
 */
export interface RepullableTable<TRemote, TLocal extends { id: string }> {
  getTableName(): string;
  getRefetchAdapter(): RowRefetchAdapter<TRemote, TLocal>;
  getReplicatedRow(id: string): Promise<ReplicatedRow<TLocal> | null>;
  replaceRefusedRows(
    entries: readonly RefusedRowReplacement<TLocal>[]
  ): Promise<ReplaceRefusedRowsResult>;
}

export type RepullResult = ReplaceRefusedRowsResult;

function remoteVersionOf(remote: unknown): number | undefined {
  const version = (remote as { version?: unknown } | null)?.version;
  return typeof version === 'number' ? version : undefined;
}

/**
 * Read each row's local revision, fetch the server copies, then hand both to the
 * table's atomic replaceRefusedRows: a row edited or queued again in between, or
 * a server copy older than the row's token, is left alone.
 */
export async function repullRows<TRemote, TLocal extends { id: string }>(
  table: RepullableTable<TRemote, TLocal>,
  rowIds: readonly string[]
): Promise<RepullResult> {
  const ids = [...new Set(rowIds.map(String))];
  if (ids.length === 0) return { replaced: [], removed: [], skipped: [] };
  const expected = new Map<string, number | undefined>();
  for (const id of ids) expected.set(id, (await table.getReplicatedRow(id))?.version);

  const adapter = table.getRefetchAdapter();
  const remoteRows = await adapter.fetchRowsById(ids);
  const byId = new Map(remoteRows.map(remote => [adapter.getRemoteId(remote), remote]));

  return table.replaceRefusedRows(
    ids.map(id => {
      const remote = byId.get(id);
      return {
        id,
        expectedRowVersion: expected.get(id),
        remote: remote === undefined ? null : adapter.toLocalRow(remote),
        remoteServerVersion: remote === undefined ? undefined : remoteVersionOf(remote),
      };
    })
  );
}

/** The tables whose refused rows are re-pulled. */
const REPULL_TABLES: Record<string, RepullableTable<unknown, { id: string }>> = {
  dog_registrations: replicatedDogRegistrationsTable as unknown as RepullableTable<
    unknown,
    { id: string }
  >,
  people: replicatedShowDeskPeopleTable as unknown as RepullableTable<unknown, { id: string }>,
};

/** Failed mutations whose refusal is final, so the local claim must go now. */
export function isFinalRefusal(mutation: Pick<PendingMutation, 'failureKind'>): boolean {
  return mutation.failureKind === 'permanent' || mutation.failureKind === 'authorization';
}

/**
 * Re-pull the rows behind these mutations, for the tables in REPULL_TABLES.
 * Never rejects: a failed re-pull is logged and the next refusal or Discard
 * tries again. Returns the tables whose rows changed.
 */
export async function repullRowsForMutations(
  mutations: readonly (Pick<PendingMutation, 'tableName'> & { rowId?: string })[]
): Promise<string[]> {
  const idsByTable = new Map<string, string[]>();
  for (const mutation of mutations) {
    if (!(mutation.tableName in REPULL_TABLES) || mutation.rowId === undefined) continue;
    const ids = idsByTable.get(mutation.tableName) ?? [];
    ids.push(String(mutation.rowId));
    idsByTable.set(mutation.tableName, ids);
  }

  const touched = await Promise.all(
    [...idsByTable].map(async ([tableName, ids]) => {
      try {
        const result = await repullRows(REPULL_TABLES[tableName]!, ids);
        return result.replaced.length + result.removed.length > 0 ? tableName : null;
      } catch (err) {
        logger.warn(`[${tableName}] Re-pull of refused rows failed`, err);
        return null;
      }
    })
  );
  return touched.filter((name): name is string => name !== null);
}

/**
 * The React Query caches that show each re-pullable table (MYK9-1071). Those
 * readers do not subscribe to the replica, so a re-pull must refresh them or the
 * UI keeps showing the refused value.
 */
export const REPULL_CONSUMER_QUERY_KEYS: Record<string, readonly (readonly string[])[]> = {
  dog_registrations: [['registrations'], ['dogs']],
  people: [['users'], ['dogs']],
};
