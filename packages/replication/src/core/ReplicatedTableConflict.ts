import type { ReplicatedRow, ReplicationConflictSnapshot } from '../types';

export function applyConflictSnapshot<T>(
  existingRow: ReplicatedRow<T> | undefined,
  conflict: ReplicationConflictSnapshot<T>
): ReplicatedRow<T> | null {
  if (!existingRow || existingRow.version !== conflict.localVersion) {
    return null;
  }

  return {
    ...existingRow,
    isDirty: true,
    syncStatus: 'conflict',
    conflict,
  };
}

export function clearConflictSnapshot<T>(
  existingRow: ReplicatedRow<T> | undefined,
  newServerVersion?: number
): ReplicatedRow<T> | null {
  if (!existingRow || existingRow.syncStatus !== 'conflict') {
    return null;
  }

  return {
    ...existingRow,
    syncStatus: 'pending',
    conflict: undefined,
    ...(newServerVersion !== undefined && { serverVersion: newServerVersion }),
  };
}

export interface BuildRemoteReplacementRowOptions<T extends { id: string }> {
  tableName: string;
  id: string;
  remoteData: T;
  existingRow: ReplicatedRow<T> | undefined;
  remoteServerVersion?: number;
  now?: number;
}

export function buildRemoteReplacementRow<T extends { id: string }>({
  tableName,
  id,
  remoteData,
  existingRow,
  remoteServerVersion,
  now = Date.now(),
}: BuildRemoteReplacementRowOptions<T>): ReplicatedRow<T> {
  const normalizedId = String(id);

  return {
    tableName,
    id: normalizedId,
    data: { ...remoteData, id: normalizedId } as T,
    version: existingRow ? existingRow.version + 1 : 1,
    lastSyncedAt: now,
    lastAccessedAt: now,
    accessCount: existingRow?.accessCount || 0,
    lastModifiedAt: now,
    isDirty: false,
    syncStatus: 'synced',
    baseData: undefined,
    baseVersion: undefined,
    serverVersion: remoteServerVersion ?? existingRow?.serverVersion,
    conflict: undefined,
  };
}

export function getConflictSnapshots<T>(
  rows: Array<ReplicatedRow<T>>
): Array<ReplicationConflictSnapshot<T>> {
  return rows
    .filter(row => row.syncStatus === 'conflict' && row.conflict !== undefined)
    .map(row => row.conflict!);
}
