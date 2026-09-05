import { supabase } from '../supabaseClient';
import { WITHHELD_SCORED_COLUMNS, withholdScoredResultColumns } from './resultVisibility';

const RESULT_BATCH_SIZE = 100;

/**
 * Replicated entries keep show identity/schedule available offline, but their
 * raw scores cannot resolve the release cascade. As with getUserEntries, only
 * the authenticated result view may supply the released values online.
 */
export async function withReleasedShowResults<T extends Record<string, unknown>>(
  showId: string,
  entries: T[]
): Promise<T[]> {
  const scoredIds = entries
    .filter(entry => entry.is_scored === true && typeof entry.id === 'string')
    .map(entry => String(entry.id));
  if (scoredIds.length === 0) return entries;

  const safeEntries = entries.map(entry => {
    const row = { ...entry };
    withholdScoredResultColumns(row);
    return row;
  });
  const results = new Map<string, Record<string, unknown>>();
  try {
    for (let offset = 0; offset < scoredIds.length; offset += RESULT_BATCH_SIZE) {
      const ids = scoredIds.slice(offset, offset + RESULT_BATCH_SIZE);
      const { data, error } = await supabase
        .from('view_authenticated_entry_results')
        .select(
          'id,final_placement,result_status,search_time_seconds,total_faults,total_score,result_text'
        )
        .eq('show_id', showId)
        .in('id', ids)
        .range(0, ids.length - 1);
      if (error) return safeEntries;
      for (const row of data ?? []) {
        if (typeof row.id === 'string') results.set(row.id, row);
      }
    }
  } catch {
    // Offline or unavailable: retain the entry list, never unfiltered scores.
    return safeEntries;
  }

  return safeEntries.map(entry => {
    const result = results.get(String(entry.id));
    if (!result) return entry;
    // Do not overwrite identity, lifecycle, pending edits or joined details.
    // Nulls explicitly clear withheld values; never fall back to raw scores.
    const releasedFields = Object.fromEntries(
      WITHHELD_SCORED_COLUMNS.map(column => [column, result[column] ?? null])
    );
    return { ...entry, ...releasedFields };
  });
}
