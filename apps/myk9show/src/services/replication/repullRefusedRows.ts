import type { PendingMutation, RowRefetchAdapter } from '@myk9/replication';
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
 * A row that still has a PENDING mutation is left alone: that write may yet
 * succeed. A failed mutation does not protect the row; it stays in
 * failed_mutations for the user's Retry or Discard, untouched by this.
 *
 * Reusable: a table joins by exposing the members below and an entry in
 * REPULL_TABLES (MYK9-1076 will add dogs).
 */
export interface RepullableTable<TRemote, TLocal extends { id: string }> {
  getTableName(): string;
  getRefetchAdapter(): RowRefetchAdapter<TRemote, TLocal>;
  getPendingMutationIdsForRow(rowId: string): Promise<string[]>;
  replaceFromRemote(id: string, remoteData: TLocal, remoteServerVersion?: number): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface RepullResult {
  replaced: string[];
  removed: string[];
  skipped: string[];
}

function remoteVersionOf(remote: unknown): number | undefined {
  const version = (remote as { version?: unknown } | null)?.version;
  return typeof version === 'number' ? version : undefined;
}

export async function repullRows<TRemote, TLocal extends { id: string }>(
  table: RepullableTable<TRemote, TLocal>,
  rowIds: readonly string[]
): Promise<RepullResult> {
  const result: RepullResult = { replaced: [], removed: [], skipped: [] };
  const hasPending = async (id: string) => (await table.getPendingMutationIdsForRow(id)).length > 0;

  const candidates: string[] = [];
  for (const id of new Set(rowIds.map(String))) {
    if (await hasPending(id)) result.skipped.push(id);
    else candidates.push(id);
  }
  if (candidates.length === 0) return result;

  const adapter = table.getRefetchAdapter();
  const remoteRows = await adapter.fetchRowsById(candidates);
  const byId = new Map(remoteRows.map(remote => [adapter.getRemoteId(remote), remote]));

  for (const id of candidates) {
    // Re-checked after the fetch: an edit queued meanwhile wins over the re-pull.
    if (await hasPending(id)) {
      result.skipped.push(id);
      continue;
    }
    const remote = byId.get(id);
    if (remote === undefined) {
      await table.delete(id);
      result.removed.push(id);
    } else {
      await table.replaceFromRemote(id, adapter.toLocalRow(remote), remoteVersionOf(remote));
      result.replaced.push(id);
    }
  }
  return result;
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
 * tries again.
 */
export async function repullRowsForMutations(
  mutations: readonly (Pick<PendingMutation, 'tableName'> & { rowId?: string })[]
): Promise<void> {
  const idsByTable = new Map<string, string[]>();
  for (const mutation of mutations) {
    if (!(mutation.tableName in REPULL_TABLES) || mutation.rowId === undefined) continue;
    const ids = idsByTable.get(mutation.tableName) ?? [];
    ids.push(String(mutation.rowId));
    idsByTable.set(mutation.tableName, ids);
  }

  await Promise.all(
    [...idsByTable].map(async ([tableName, ids]) => {
      try {
        await repullRows(REPULL_TABLES[tableName]!, ids);
      } catch (err) {
        logger.warn(`[${tableName}] Re-pull of refused rows failed`, err);
      }
    })
  );
}
