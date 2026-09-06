import { supabase } from '../supabaseClient';
import { WITHHELD_SCORED_COLUMNS, withholdScoredResultColumns } from './resultVisibility';

const RESULT_BATCH_SIZE = 100;
const RESULTS_WAIT_MS = 3000;

/**
 * Replicated entries keep show identity/schedule available offline, but their
 * raw scores cannot resolve the release cascade. As with getUserEntries, only
 * the authenticated result view may supply the released values online.
 */
export async function withReleasedShowResults<T extends Record<string, unknown>>(
  showId: string,
  entries: T[]
): Promise<{ entries: T[]; resultsReadComplete: boolean }> {
  const scoredIds = entries
    .filter(entry => entry.is_scored === true && typeof entry.id === 'string')
    .map(entry => String(entry.id));
  if (scoredIds.length === 0) return { entries, resultsReadComplete: true };

  const safeEntries = entries.map(entry => {
    const row = { ...entry };
    withholdScoredResultColumns(row);
    return row;
  });
  const unavailable = { entries: safeEntries, resultsReadComplete: false };
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  async function loadResults() {
    const results = new Map<string, Record<string, unknown>>();
    for (let offset = 0; offset < scoredIds.length; offset += RESULT_BATCH_SIZE) {
      if (controller.signal.aborted) return unavailable;
      const ids = scoredIds.slice(offset, offset + RESULT_BATCH_SIZE);
      const { data, error } = await supabase
        .from('view_authenticated_entry_results')
        .select(
          'id,final_placement,result_status,search_time_seconds,total_faults,total_score,result_text'
        )
        .eq('show_id', showId)
        .in('id', ids)
        .abortSignal(controller.signal)
        .range(0, ids.length - 1);
      if (error || !data) return unavailable;
      for (const row of data) {
        if (typeof row.id === 'string') results.set(row.id, row);
      }
    }

    return {
      // An absent row cannot distinguish withheld access from an incomplete
      // response. Preserve masking and expose that uncertainty to consumers.
      resultsReadComplete: scoredIds.every(id => results.has(id)),
      entries: safeEntries.map(entry => {
        const result = results.get(String(entry.id));
        if (!result) return entry;
        // Nulls explicitly clear withheld values; never fall back to raw scores.
        const releasedFields = Object.fromEntries(
          WITHHELD_SCORED_COLUMNS.map(column => [column, result[column] ?? null])
        );
        return { ...entry, ...releasedFields };
      }),
    };
  }

  try {
    // One budget for ALL batches. Promise.race also bounds transports that do
    // not settle on abort; no partial release result may escape after timeout.
    return await Promise.race([
      loadResults(),
      new Promise<typeof unavailable>(resolve => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(unavailable);
        }, RESULTS_WAIT_MS);
      }),
    ]);
  } catch {
    return unavailable;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
