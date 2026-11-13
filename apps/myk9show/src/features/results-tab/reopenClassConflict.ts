import { replicatedClassesTable } from '@/services/replication';

/**
 * Brings back the conflict notice for one class from the conflict kept on this device. Raises the
 * same `replication:conflict` event the provider already turns into the notice (and replays on
 * sign-in), so the choice is the existing one, and it needs no connection. Returns whether a
 * conflict was found.
 */
export async function reopenClassConflict(classId: string): Promise<boolean> {
  const conflicts = await replicatedClassesTable.getConflictedRows();
  const snapshot = conflicts.find(conflict => conflict.rowId === classId);
  if (!snapshot) return false;
  window.dispatchEvent(new CustomEvent('replication:conflict', { detail: snapshot }));
  return true;
}
