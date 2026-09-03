import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';

type SyncStatus = ReplicationSyncContextValue['status'];

const PENDING_TABLE_STATUSES = new Set(['idle', 'syncing']);

/**
 * Is a caller still waiting for replicated data that may yet arrive?
 *
 * Callers gate a loading skeleton on this, so the answer has to mean "something
 * is coming" — not merely "nothing has happened yet".
 *
 * MYK9-365: those are not the same thing offline. `ReplicationSyncProvider`
 * returns early when `!isOnline` WITHOUT touching `tablesStatus`, so every table
 * sits at its initial `'idle'` for as long as the device has no signal. Reading
 * `'idle'` as pending therefore meant pending *forever*: an exhibitor who cold
 * booted at a venue got an animated skeleton with no text in it, permanently,
 * with their entries already in IndexedDB underneath. The connectivity test
 * belongs here rather than at each call site — it was hand-rolled correctly at
 * two of five call sites and missed at the other three, which is how the same
 * skeleton reached My Shows and both at-show entry lists.
 *
 * A table left at `'error'` is deliberately NOT pending: the sync ran and
 * failed, which is an answer. Only `'idle'`/`'syncing'` are open questions.
 */
export function areReplicationTablesPendingFirstSync(
  status: SyncStatus,
  tableNames: readonly string[]
): boolean {
  // A run that is genuinely underway is a bounded wait with a real end, so it
  // stays pending even if connectivity drops mid-flight.
  if (status.isSyncing) return true;

  // Offline there is nothing to wait for: no sync is running and none can
  // start. Let the caller render what it has, or its own offline/unknown state.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  return tableNames.some(tableName => PENDING_TABLE_STATUSES.has(status.tablesStatus[tableName]));
}
