import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { markClassCompletionPending } from '@myk9/ringside';

const EXCLUDED_ENTRY_STATUSES = new Set(['scratched', 'withdrawn', 'cancelled']);
const ACCOUNTED_RESULT_STATUSES = new Set(['absent', 'excused']);

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function isExpectedEntry(entry: ReplicatedEntry): boolean {
  if (entry.deletedAt != null || entry.deleted_at != null) return false;

  const entryStatus = normalized(entry.entryStatus ?? entry.entry_status ?? entry.status);
  const checkInStatus = normalized(entry.checkInStatus ?? entry.check_in_status);
  return !EXCLUDED_ENTRY_STATUSES.has(entryStatus) && checkInStatus !== 'pulled';
}

function isAccountedFor(entry: ReplicatedEntry): boolean {
  const resultStatus = normalized(entry.resultStatus ?? entry.result_status);
  return (
    entry.isScored === true ||
    entry.is_scored === true ||
    ACCOUNTED_RESULT_STATUSES.has(resultStatus)
  );
}

function expectedEntries(entries: ReplicatedEntry[]): ReplicatedEntry[] {
  return entries.filter(isExpectedEntry);
}

export function isFinalPendingExpectedEntry(entries: ReplicatedEntry[], entryId: string): boolean {
  const pending = expectedEntries(entries).filter(entry => !isAccountedFor(entry));
  return pending.length === 1 && pending[0]?.id === entryId;
}

export function isClassAccountedFor(entries: ReplicatedEntry[]): boolean {
  const expected = expectedEntries(entries);
  return expected.length > 0 && expected.every(isAccountedFor);
}

export async function isCurrentFinalPendingEntry(
  classId: string,
  entryId: string
): Promise<boolean> {
  const entries = await replicatedEntriesTable.getEntriesByClass(classId);
  return isFinalPendingExpectedEntry(entries, entryId);
}

export async function recordCompletionIntentIfConfirmed(
  classId: string,
  wasFinalPendingEntry: boolean
): Promise<void> {
  if (!wasFinalPendingEntry) return;

  const entries = await replicatedEntriesTable.getEntriesByClass(classId);
  if (isClassAccountedFor(entries)) {
    markClassCompletionPending(classId);
  }
}
