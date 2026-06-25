import type { ReplicatedRow } from '../types';

interface BuildReplicatedRowForSetOptions<T extends { id: string }> {
  tableName: string;
  id: string;
  data: T;
  isDirty: boolean;
  existingRow?: ReplicatedRow<T> | undefined;
  incomingServerVersion?: number | undefined;
  now: number;
}

export function buildReplicatedRowForSet<T extends { id: string }>({
  tableName,
  id,
  data,
  isDirty,
  existingRow,
  incomingServerVersion,
  now,
}: BuildReplicatedRowForSetOptions<T>): ReplicatedRow<T> {
  const normalizedData = { ...data, id } as T;
  const shouldCaptureBase = isDirty && existingRow && !existingRow.isDirty;
  const baseData = isDirty
    ? existingRow?.isDirty
      ? existingRow.baseData
      : shouldCaptureBase
        ? existingRow.data
        : undefined
    : undefined;
  const baseVersion = isDirty
    ? existingRow?.isDirty
      ? existingRow.baseVersion
      : shouldCaptureBase
        ? existingRow.version
        : undefined
    : undefined;
  const shouldPreserveConflict = isDirty && existingRow?.syncStatus === 'conflict';
  const conflict = shouldPreserveConflict ? existingRow.conflict : undefined;
  const serverVersion = isDirty
    ? existingRow?.serverVersion
    : (incomingServerVersion ?? existingRow?.serverVersion);

  return {
    tableName,
    id,
    data: normalizedData,
    version: existingRow ? existingRow.version + 1 : 1,
    lastSyncedAt: now,
    lastAccessedAt: now,
    accessCount: existingRow?.accessCount || 0,
    lastModifiedAt: now,
    isDirty,
    syncStatus: isDirty ? (shouldPreserveConflict ? 'conflict' : 'pending') : 'synced',
    ...(baseData !== undefined && { baseData }),
    ...(baseVersion !== undefined && { baseVersion }),
    ...(serverVersion !== undefined && { serverVersion }),
    conflict,
  };
}

interface BuildReconciledDirtyRowOptions<T extends { id: string }> {
  existingRow: ReplicatedRow<T>;
  /** Local data with server-authoritative untouched fields merged in. */
  mergedData: T;
  /** New merge base — the current server snapshot the dirty edit now sits on top of. */
  newBaseData: T;
  /** Forward-advanced OCC token (server `version`); undefined leaves it unchanged. */
  serverVersion: number | undefined;
  now: number;
}

/**
 * Rebuild a locally-dirty row after a non-conflicting sync-down reconciliation:
 * adopt server-changed untouched fields, advance the merge base, and advance the
 * OCC `serverVersion` token — WITHOUT discarding the pending local edit.
 *
 * Deliberately preserves `version` (this is not a new user edit, so the local
 * optimistic counter must not bump and trip an in-flight optimisticUpdate's
 * expectedVersion check) and `baseVersion`, and keeps `isDirty: true` so the
 * queued mutation still uploads. Only callable for a row that is dirty and not in
 * `conflict` state — the caller guards that.
 */
export function buildReconciledDirtyRow<T extends { id: string }>({
  existingRow,
  mergedData,
  newBaseData,
  serverVersion,
  now,
}: BuildReconciledDirtyRowOptions<T>): ReplicatedRow<T> {
  return {
    ...existingRow,
    data: { ...mergedData, id: existingRow.id },
    baseData: { ...newBaseData, id: existingRow.id },
    lastSyncedAt: now,
    lastModifiedAt: now,
    isDirty: true,
    syncStatus: 'pending',
    conflict: undefined,
    ...(serverVersion !== undefined && { serverVersion }),
  };
}

export function buildSyncedReplicatedRow<T>(row: ReplicatedRow<T>, now: number): ReplicatedRow<T> {
  return {
    ...row,
    isDirty: false,
    syncStatus: 'synced',
    lastSyncedAt: now,
    baseData: undefined,
    baseVersion: undefined,
    conflict: undefined,
  };
}

export function collectFreshLocalIds<T extends { id: string }>(
  rows: readonly ReplicatedRow<T>[],
  isExpired: (row: ReplicatedRow<T>) => boolean
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (isExpired(row)) continue;
    ids.add(row.id);
  }
  return ids;
}

export function selectStaleCleanRows<T>(
  rows: readonly ReplicatedRow<T>[],
  serverIds: ReadonlySet<string>
): ReplicatedRow<T>[] {
  return rows.filter(row => !row.isDirty && !serverIds.has(row.id));
}
