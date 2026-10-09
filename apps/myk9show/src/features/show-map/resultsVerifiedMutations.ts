/**
 * MYK9-1031: record and undo "scores match the paper" for one class.
 *
 * Offline-first, like the judge's sign-off beside it: the local class row changes at once and the
 * write is queued as an RPC-routed UPDATE (`ReplicatedClassesTable.setResultsVerified`), so a
 * secretary with no signal checks the class and it syncs, in queue order, on reconnect. The
 * server authorizes each one (`mark_class_results_verified` / `clear_class_results_verified`,
 * show managers only).
 *
 * The mark carries the fingerprint of the results the secretary was looking at. It is computed
 * from the same replica the Results tab renders (`replicatedEntriesTable.getEntriesByClass`),
 * which holds every column the server hashes; the secretary read behind the table does not.
 *
 * No React here, so the Results tab and its tests share it.
 */
import { replicatedEntriesTable, replicatedClassesTable } from '@/services/replication';
import { entryToSupabaseRow } from '@/services/replication/ReplicatedEntriesTable.mapper';
import {
  classResultsFingerprint,
  type ClassResultsFingerprintEntry,
} from './classResultsFingerprint';

/**
 * A class's results as this device holds them right now: their fingerprint, and whether any entry
 * still has a local change the server has not acknowledged (so the fingerprint may describe
 * results the server has never seen).
 *
 * Each entry is projected through `entryToSupabaseRow`, the exact row the upload writes, so the
 * hash covers what the server will hold (the legacy snake_case aliases can be stale: a placement
 * recalculation updates `finalPlacement` alone, and a non-qualified result uploads no placement).
 */
export async function classResultsSnapshot(
  classId: string
): Promise<{ fingerprint: string; hasUnsyncedEntries: boolean }> {
  const entries = await replicatedEntriesTable.getEntriesByClass(classId);
  const fingerprint = await classResultsFingerprint(
    entries.map(entry => {
      const row = entryToSupabaseRow(entry) as Omit<ClassResultsFingerprintEntry, 'id'>;
      return { ...row, id: entry.id } as ClassResultsFingerprintEntry;
    })
  );
  return {
    fingerprint,
    hasUnsyncedEntries: entries.some(
      entry => entry._syncStatus !== undefined && entry._syncStatus !== 'synced'
    ),
  };
}

/** The fingerprint of a class's results as this device holds them right now. */
export async function currentClassResultsFingerprint(classId: string): Promise<string> {
  return (await classResultsSnapshot(classId)).fingerprint;
}

export async function recordResultsVerified(input: {
  classId: string;
  /** Auth uid of the secretary recording it (the server stamps its own from the JWT). */
  recordedBy: string | null;
  at?: string;
}): Promise<void> {
  const fingerprint = await currentClassResultsFingerprint(input.classId);
  await replicatedClassesTable.setResultsVerified(input.classId, {
    at: input.at ?? new Date().toISOString(),
    by: input.recordedBy,
    fingerprint,
  });
}

export async function clearResultsVerified(classId: string): Promise<void> {
  await replicatedClassesTable.setResultsVerified(classId, null);
}
