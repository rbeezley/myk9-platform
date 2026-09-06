import { supabase } from '../supabaseClient';
import { WITHHELD_SCORED_COLUMNS, withholdScoredResultColumns } from './resultVisibility';

const RESULT_BATCH_SIZE = 100;
const RESULTS_WAIT_MS = 3000;

/**
 * The authenticated result view supplies the release state for exhibitor
 * reads. Replication already carries the cascade-aware result projection, so
 * rows returned by the view may be merged into the cached entry shape.
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
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const results = new Map<string, Record<string, unknown>>();

  const buildResult = (complete: boolean) => ({
    resultsReadComplete: complete,
    entries: safeEntries.map(entry => {
      const result = results.get(String(entry.id));
      if (!result) return entry;
      const releasedFields = Object.fromEntries(
        WITHHELD_SCORED_COLUMNS.map(column => [column, result[column] ?? null])
      );
      return { ...entry, ...releasedFields };
    }),
  });

  async function loadResults() {
    const batches = Array.from(
      { length: Math.ceil(scoredIds.length / RESULT_BATCH_SIZE) },
      (_, index) => scoredIds.slice(index * RESULT_BATCH_SIZE, (index + 1) * RESULT_BATCH_SIZE)
    );
    const responses = await Promise.all(
      batches.map(async ids => {
        const response = await supabase
          .from('view_authenticated_entry_results')
          .select(
            'id,final_placement,result_status,search_time_seconds,total_faults,total_score,result_text'
          )
          .eq('show_id', showId)
          .in('id', ids)
          .abortSignal(controller.signal)
          .range(0, ids.length - 1);
        for (const row of response.data ?? []) {
          if (typeof row.id === 'string') results.set(row.id, row);
        }
        return response;
      })
    );
    if (responses.some(response => response.error || !response.data)) return buildResult(false);

    // A successful empty projection is the complete no-access case: the view
    // omits rows when no access arm matches. A partial non-empty projection is
    // still incomplete and remains masked for the missing rows.
    return buildResult(results.size === 0 || scoredIds.every(id => results.has(id)));
  }

  try {
    // One budget covers concurrent batches. Promise.race also bounds transports
    // that do not settle on abort; completed batches remain visible after
    // timeout and rows still in flight remain masked.
    return await Promise.race([
      loadResults(),
      new Promise<{ entries: T[]; resultsReadComplete: boolean }>(resolve => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(buildResult(false));
        }, RESULTS_WAIT_MS);
      }),
    ]);
  } catch {
    return buildResult(false);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
