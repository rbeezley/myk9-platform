/**
 * The trials a batch of class rows belongs to, read once for the four class enrichments
 * (visibility, hide counts, time-limit rules, judge names) instead of once per enrichment
 * (MYK9-1345). Each resolver takes the result as an optional trailing parameter and reads
 * `trials` itself when it is absent, so a direct caller is unchanged.
 */
import { supabase } from '@/services/database/supabaseClient';

/** The columns any of the four enrichments reads off a trial. */
export interface ClassTrialRow {
  id: string;
  show_id: string | null;
  registry_id: string | null;
}

export const CLASS_TRIAL_COLUMNS = 'id, show_id, registry_id';

/** The distinct, non-empty `trial_id`s of these rows. */
export function distinctTrialIds(rows: ReadonlyArray<{ trial_id?: string | null }>): string[] {
  return [...new Set(rows.map(row => row.trial_id).filter((id): id is string => !!id))];
}

/**
 * One `trials` read for these rows, or `undefined` when it failed, whether the response
 * carried an error or the call threw. The caller passes `undefined` straight on, so every
 * resolver falls back to its own read and its own failure handling, exactly as before the
 * shared read existed (enrichment must never fail on this read).
 */
export async function readClassTrials(
  rows: ReadonlyArray<{ trial_id?: string | null }>
): Promise<ClassTrialRow[] | undefined> {
  const trialIds = distinctTrialIds(rows);
  if (trialIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('trials')
      .select(CLASS_TRIAL_COLUMNS)
      .in('id', trialIds);
    return error ? undefined : ((data ?? []) as ClassTrialRow[]);
  } catch {
    return undefined;
  }
}
