/**
 * MYK9-1031: record and undo "scores match the paper" for one class. ONLINE ONLY.
 *
 * The check is a claim about the results as the SERVER holds them: the mark carries their
 * fingerprint and the server refuses it (MK015) when they have moved. A queued, replayed mark can
 * never be told apart from a stale one once corrections are queued around it, so it is not queued:
 * the RPC (`mark_class_results_verified` / `clear_class_results_verified`, show managers only) is
 * called directly, and on success the answer is mirrored onto the local class row
 * (`applyResultsVerified`: clean, unqueued) so the Results tab updates at once. Ticking the dogs
 * is local and works offline; only saving the check needs a connection.
 *
 * The fingerprint is computed from the same replica the Results tab renders
 * (`replicatedEntriesTable.getEntriesByClass`), which holds every column the server hashes; the
 * secretary read behind the table does not.
 *
 * No React here, so the Results tab and its tests share it.
 */
import { replicatedEntriesTable, replicatedClassesTable } from '@/services/replication';
import { supabase } from '@/services/database/supabaseClient';
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

/** The server refused the check because the class's results changed since they were ticked. */
export function isStaleResultsError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'MK015'
  );
}

export async function recordResultsVerified(input: {
  classId: string;
  /** Auth uid of the secretary recording it (the server stamps its own from the JWT). */
  recordedBy: string | null;
  at?: string;
}): Promise<void> {
  const { fingerprint, hasUnsyncedEntries } = await classResultsSnapshot(input.classId);
  // Results waiting to sync are results the server has never seen: its fingerprint would differ.
  if (hasUnsyncedEntries) throw new Error('Waiting for score changes to sync.');
  const at = input.at ?? new Date().toISOString();
  const { data, error } = await supabase.rpc('mark_class_results_verified', {
    p_class_id: input.classId,
    p_results_fingerprint: fingerprint,
    p_verified_at: at,
  });
  if (error) throw error;
  // The server keeps the FIRST stamp on a repeat; its `at` is not echoed, so a repeat mirrors ours.
  await replicatedClassesTable.applyResultsVerified(
    input.classId,
    { at, by: input.recordedBy },
    typeof data === 'number' ? data : undefined
  );
}

export async function clearResultsVerified(classId: string): Promise<void> {
  const { data, error } = await supabase.rpc('clear_class_results_verified', {
    p_class_id: classId,
  });
  if (error) throw error;
  await replicatedClassesTable.applyResultsVerified(
    classId,
    null,
    typeof data === 'number' ? data : undefined
  );
}
