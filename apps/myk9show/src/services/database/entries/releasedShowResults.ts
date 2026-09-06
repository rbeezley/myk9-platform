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
  const unavailable = { entries: safeEntries, resultsReadComplete: false };
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
    let sawAnyRows = false;
    for (let offset = 0; offset < scoredIds.length; offset += RESULT_BATCH_SIZE) {
      if (controller.signal.aborted) return buildResult(false);
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
      if (error || !data) return buildResult(false);
      sawAnyRows ||= data.length > 0;
      for (const row of data) {
        if (typeof row.id === 'string') results.set(row.id, row);
      }
    }

    // A successful empty projection is the complete no-access case: the view
    // omits rows when no access arm matches. A partial non-empty projection is
    // still incomplete and remains masked for the missing rows.
    return buildResult(!sawAnyRows || scoredIds.every(id => results.has(id)));
  }

  try {
    // One budget for ALL batches. Promise.race also bounds transports that do
    // not settle on abort; no partial release result may escape after timeout.
    return await Promise.race([
      loadResults(),
      new Promise<typeof unavailable>(resolve => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(buildResult(false));
        }, RESULTS_WAIT_MS);
      }),
    ]);
  } catch {
    return unavailable;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
