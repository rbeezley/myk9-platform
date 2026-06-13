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
