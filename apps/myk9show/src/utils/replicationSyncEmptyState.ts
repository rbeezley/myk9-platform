import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';

type SyncStatus = ReplicationSyncContextValue['status'];

const PENDING_TABLE_STATUSES = new Set(['idle', 'syncing']);

export function areReplicationTablesPendingFirstSync(
  status: SyncStatus,
  tableNames: readonly string[]
): boolean {
  if (status.isSyncing) return true;

  return tableNames.some(tableName => PENDING_TABLE_STATUSES.has(status.tablesStatus[tableName]));
}
