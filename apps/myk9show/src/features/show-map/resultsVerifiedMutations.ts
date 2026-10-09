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
 * The fingerprint is hashed from the canonical results text the Results tab built from the rows it
 * DISPLAYED (`ResultsClassRow.resultsCanonical`) and that the secretary ticked: nothing is re-read
 * at click time, so a correction that downloaded after the ticks makes the server refuse the check
 * (MK015) instead of the app attesting to scores nobody looked at.
 *
 * No React here, so the Results tab and its tests share it.
 */
import { replicatedClassesTable } from '@/services/replication';
import { supabase } from '@/services/database/supabaseClient';
import { hashClassResultsText } from './classResultsFingerprint';

/** The server refused the check because the class's results changed since they were ticked. */
export function isStaleResultsError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'MK015'
  );
}

export async function recordResultsVerified(input: {
  classId: string;
  /** The canonical results text of the rows the secretary ticked. */
  canonical: string;
  /** Auth uid of the secretary recording it (the server stamps its own from the JWT). */
  recordedBy: string | null;
  at?: string;
}): Promise<void> {
  const at = input.at ?? new Date().toISOString();
  const { data, error } = await supabase.rpc('mark_class_results_verified', {
    p_class_id: input.classId,
    p_results_fingerprint: await hashClassResultsText(input.canonical),
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
