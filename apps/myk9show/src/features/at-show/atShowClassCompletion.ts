import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { markClassCompletionPending } from '@myk9/ringside';
import {
  expectedEntries,
  isAccountedFor,
  outstandingEntries,
} from '@/features/_shared/entryAccounting';

export function isFinalPendingExpectedEntry(entries: ReplicatedEntry[], entryId: string): boolean {
  const pending = outstandingEntries(entries);
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
