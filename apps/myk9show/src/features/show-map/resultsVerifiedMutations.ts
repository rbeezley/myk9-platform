/**
 * MYK9-1031: record and undo "scores match the paper" for one class. ONLINE ONLY.
 *
 * The check is a claim about the results as the SERVER holds them: the mark carries their
 * fingerprint and the server refuses it (MK015) when they have moved. A queued, replayed mark can
 * never be told apart from a stale one once corrections are queued around it, so it is not queued:
 * the RPC (`mark_class_results_verified` / `clear_class_results_verified`, show managers only) is
 * called directly. Nothing is written to the local class row from the answer: the replica learns
 * the stamp, and any version that comes with it, through the ordinary class sync the caller
 * triggers afterwards. Ticking the dogs is local and works offline; only saving the check needs a
 * connection.
 *
 * The fingerprint is hashed from the canonical results text the Results tab built from the rows it
 * DISPLAYED (`ResultsClassRow.resultsCanonical`) and that the secretary ticked: nothing is re-read at
 * click time, so a correction that downloaded after the ticks makes the server refuse the check
 * (MK015) instead of the app attesting to scores nobody looked at.
 *
 * No React here, so the Results tab and its tests share it.
 */
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
  at?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('mark_class_results_verified', {
    p_class_id: input.classId,
    p_results_fingerprint: await hashClassResultsText(input.canonical),
    p_verified_at: input.at ?? new Date().toISOString(),
  });
  if (error) throw error;
}

export async function clearResultsVerified(classId: string): Promise<void> {
  const { error } = await supabase.rpc('clear_class_results_verified', { p_class_id: classId });
  if (error) throw error;
}

/**
 * What the SERVER says about a class's paper check right now (a fresh read, named columns). The
 * replica's copy is only a hint for the Release button; this decides.
 */
export async function readServerResultsVerifiedAt(classId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, results_verified_at')
    .eq('id', classId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Class not found');
  return data.results_verified_at ?? null;
}
