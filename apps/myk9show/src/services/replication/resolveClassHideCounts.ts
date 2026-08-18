import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/utils/logger';

/**
 * Judge-set hide counts, fetched separately from the class row.
 *
 * `classes.num_hides` is not readable by `authenticated` (migration
 * 20260731160000, MYK9-127) — a competitor who learns the count before running
 * has a decisive advantage in a class whose count the judge chose not to
 * disclose. Officials get it from `get_show_class_hide_counts(show_id)`, which
 * authorizes once per show and returns nothing to anyone else.
 *
 * Sync merges the result back onto the replicated class so an official's ringside
 * device still has the count with no network, while an exhibitor's IndexedDB
 * simply never receives it. That is the same denormalize-at-sync shape as
 * `resolveVisibilityForClassRows`.
 *
 * Deliberately best-effort: a caller who is not an official gets an empty map,
 * which is indistinguishable from "no counts set". Sync must not break either
 * way — hide counts are enrichment, not the class record.
 */
export async function resolveHideCountsForClassRows(
  rows: ReadonlyArray<{ id: string; trial_id: string | null }>
): Promise<Map<string, number>> {
  const byClassId = new Map<string, number>();

  const trialIds = [...new Set(rows.map(row => row.trial_id).filter((id): id is string => !!id))];
  if (trialIds.length === 0) return byClassId;

  // classes carry trial_id, not show_id, and the RPC authorizes per show.
  const { data: trials, error: trialsError } = await supabase
    .from('trials')
    .select('id, show_id')
    .in('id', trialIds);

  if (trialsError) {
    logger.warn(
      `[resolveClassHideCounts] Trial lookup failed; hide counts unavailable this sync: ${trialsError.message}`,
      'replication'
    );
    return byClassId;
  }

  const showIds = [
    ...new Set((trials ?? []).map(trial => trial.show_id).filter((id): id is string => !!id)),
  ];

  await Promise.all(
    showIds.map(async showId => {
      const { data, error } = await supabase.rpc('get_show_class_hide_counts', {
        p_show_id: showId,
      });

      if (error) {
        logger.warn(
          `[resolveClassHideCounts] Hide counts unavailable for show ${showId}: ${error.message}`,
          'replication'
        );
        return;
      }

      for (const row of data ?? []) {
        if (row.class_id && typeof row.num_hides === 'number') {
          byClassId.set(row.class_id, row.num_hides);
        }
      }
    })
  );

  return byClassId;
}
