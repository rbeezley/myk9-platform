import type {
  PendingMutation,
  RefusedRowReplacement,
  ReplaceRefusedRowsResult,
  ReplicatedRow,
  RowRefetchAdapter,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { replicatedDogRegistrationsTable } from './ReplicatedDogRegistrationsTable';

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

export interface RepullResult<TLocal> extends ReplaceRefusedRowsResult {
  /** The server copies now in the replica, for the caller's caches. */
  replacedRows: TLocal[];
  /** The local rows that were removed (refused adds, or rows gone server-side). */
  removedRows: TLocal[];
}

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
): Promise<RepullResult<TLocal>> {
  const ids = [...new Set(rowIds.map(String))];
  if (ids.length === 0) {
    return { replaced: [], removed: [], skipped: [], replacedRows: [], removedRows: [] };
  }
  const expected = new Map<string, number | undefined>();
  const localRows = new Map<string, TLocal>();
  for (const id of ids) {
    const row = await table.getReplicatedRow(id);
    expected.set(id, row?.version);
    if (row) localRows.set(id, row.data);
  }

  const adapter = table.getRefetchAdapter();
  const remoteRows = await adapter.fetchRowsById(ids);
  const byId = new Map(remoteRows.map(remote => [adapter.getRemoteId(remote), remote]));

  const entries = ids.map(id => {
    const remote = byId.get(id);
    return {
      id,
      expectedRowVersion: expected.get(id),
      remote: remote === undefined ? null : adapter.toLocalRow(remote),
      remoteServerVersion: remote === undefined ? undefined : remoteVersionOf(remote),
    };
  });
  const result = await table.replaceRefusedRows(entries);
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  return {
    ...result,
    replacedRows: result.replaced.flatMap(id => entryById.get(id)?.remote ?? []),
    removedRows: result.removed.flatMap(id => localRows.get(id) ?? []),
  };
}

/** The tables whose refused rows are re-pulled. */
const REPULL_TABLES: Record<string, RepullableTable<unknown, { id: string }>> = {
  dog_registrations: replicatedDogRegistrationsTable as unknown as RepullableTable<
    unknown,
    { id: string }
  >,
};

/** Failed mutations whose refusal is final, so the local claim must go now. */
export function isFinalRefusal(mutation: Pick<PendingMutation, 'failureKind'>): boolean {
  return mutation.failureKind === 'permanent' || mutation.failureKind === 'authorization';
}

/** A table's re-pull outcome, for the caches that show it. */
export interface RepulledRows {
  tableName: string;
  replacedRows: { id: string }[];
  removedRows: { id: string }[];
}

/**
 * Re-pull the rows behind these mutations, for the tables in REPULL_TABLES.
 * Never rejects: a failed re-pull is logged and the next refusal or Discard
 * tries again. Returns, per table, the rows that changed.
 */
export async function repullRowsForMutations(
  mutations: readonly (Pick<PendingMutation, 'tableName'> & { rowId?: string })[]
): Promise<RepulledRows[]> {
  const idsByTable = new Map<string, string[]>();
  for (const mutation of mutations) {
    if (!(mutation.tableName in REPULL_TABLES) || mutation.rowId === undefined) continue;
    const ids = idsByTable.get(mutation.tableName) ?? [];
    ids.push(String(mutation.rowId));
    idsByTable.set(mutation.tableName, ids);
  }

  const outcomes = await Promise.all(
    [...idsByTable].map(async ([tableName, ids]): Promise<RepulledRows | null> => {
      try {
        const result = await repullRows(REPULL_TABLES[tableName]!, ids);
        if (result.replacedRows.length + result.removedRows.length === 0) return null;
        return { tableName, replacedRows: result.replacedRows, removedRows: result.removedRows };
      } catch (err) {
        logger.warn(`[${tableName}] Re-pull of refused rows failed`, err);
        return null;
      }
    })
  );
  return outcomes.filter((outcome): outcome is RepulledRows => outcome !== null);
}
