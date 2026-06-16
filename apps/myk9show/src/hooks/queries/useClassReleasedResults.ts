/**
 * useClassReleasedResults — direct PostgREST read of released class results.
 *
 * WHY this exists (and bypasses the replication layer): the public class
 * results page (`/shows/:showId/trials/:trialId/classes/:classId`) is reached
 * by exhibitors and anonymous guests whose replication store is cold or stale.
 * Entries/classes only sync per-show when `/at-show/:showId` is entered, so a
 * post-show exhibitor or a guest reads empty/stale scoring from the Zustand
 * stores and sees "0 completed / N pending" with every row "Pending / 0th".
 *
 * `readWithReplicationFallback` does NOT save us here: it only falls back to
 * PostgREST on a *throw*, and a cold store resolves to `[]` (a false-empty
 * success), so the fallback never fires. This mirrors the TV display (#753)
 * and styled-landings (#768) fixes: when results are released, read them with
 * a DIRECT PostgREST query of `view_entry_with_results`.
 *
 * Scope: this is the read path for the read-only exhibitor/guest display only.
 * Secretary / at-show scoring legitimately uses the live replication store and
 * is untouched — callers gate this hook behind `resultsReleasedAt`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';
import { mapResultStatusToQualification, dbSecondsToInputFormat } from '@/utils/scoringMappings';
import type { RawEntryRow } from './useClassEntriesRaw';
import type { ClassEntryDisplay } from '@/pages/ClassDetailsPage/types';

/** Columns selected from `view_entry_with_results` (a superset of `entries`). */
const RELEASED_RESULTS_SELECT = `
  id,
  class_id,
  show_id,
  dog_id,
  handler_id,
  armband,
  handler,
  result_status,
  is_scored,
  search_time_seconds,
  total_faults,
  final_placement,
  judge_notes,
  disqualification_reason,
  scoring_completed_at,
  check_in_status,
  run_order,
  created_at,
  updated_at,
  dog_name,
  dog_call_name,
  dog_breed
` as const;

export interface ClassReleasedResults {
  /** Raw rows shaped for the scoring table overlay (drop-in for `rawEntries`). */
  rawEntries: RawEntryRow[];
  /** Display rows with populated status/time/placement (drop-in for `classEntries`). */
  entryData: ClassEntryDisplay[];
}

/**
 * Map one `view_entry_with_results` row into both shapes the page consumes.
 * Pure — exported for unit testing without a Supabase mock.
 */
export function mapReleasedResultRow(row: Record<string, unknown>): {
  raw: RawEntryRow;
  entry: ClassEntryDisplay;
} {
  const dogName = (row.dog_call_name as string) || (row.dog_name as string) || 'Unknown Dog';
  const status = mapResultStatusToQualification(row.result_status as string | null | undefined);
  const time = dbSecondsToInputFormat(row.search_time_seconds as number | null | undefined);
  const placement = row.final_placement != null ? String(row.final_placement) : '';

  const raw: RawEntryRow = {
    id: row.id as string,
    class_id: row.class_id as string,
    show_id: row.show_id as string,
    dog_id: row.dog_id as string,
    handler_id: (row.handler_id as string | null) ?? null,
    armband: (row.armband as string | null) ?? null,
    handler: (row.handler as string | null) ?? null,
    result_status: (row.result_status as string | null) ?? null,
    is_scored: (row.is_scored as boolean | null) ?? null,
    search_time_seconds: (row.search_time_seconds as number | null) ?? null,
    total_faults: (row.total_faults as number | null) ?? null,
    final_placement: (row.final_placement as number | null) ?? null,
    judge_notes: (row.judge_notes as string | null) ?? null,
    disqualification_reason: (row.disqualification_reason as string | null) ?? null,
    scoring_completed_at: (row.scoring_completed_at as string | null) ?? null,
    check_in_status: (row.check_in_status as string | null) ?? null,
    run_order: (row.run_order as number | null) ?? null,
    dog: {
      id: row.dog_id as string,
      name: (row.dog_name as string) || dogName,
      call_name: (row.dog_call_name as string | null) ?? null,
      breed: (row.dog_breed as string | null) ?? null,
      // The view does not join owner/registrations; the read-only display
      // does not need them (no edit/permission decisions are made here).
      registrations: null,
      owner: null,
    },
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };

  const entry: ClassEntryDisplay = {
    id: row.id as string,
    armband: (row.armband as string) || '',
    handler: (row.handler as string) || '',
    dog: dogName,
    // `status` may be '' for non-scored rows, but the query filters to
    // is_scored=true so released rows always carry a qualification.
    status: status as ClassEntryDisplay['status'],
    ...(row.disqualification_reason
      ? { qualificationReason: row.disqualification_reason as string }
      : {}),
    score: '',
    time,
    placement,
    classId: row.class_id as string,
  };

  return { raw, entry };
}

async function fetchClassReleasedResults(classId: string): Promise<ClassReleasedResults> {
  const { data, error } = await supabase
    .from('view_entry_with_results')
    .select(RELEASED_RESULTS_SELECT)
    .eq('class_id', classId)
    .eq('is_scored', true)
    .order('final_placement', { ascending: true, nullsFirst: false })
    .order('run_order', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const mapped = rows.map(mapReleasedResultRow);

  return {
    rawEntries: mapped.map(m => m.raw),
    entryData: mapped.map(m => m.entry),
  };
}

const EMPTY_RESULTS: ClassReleasedResults = { rawEntries: [], entryData: [] };

/**
 * Fetch released, scored results for a class via a direct PostgREST read.
 *
 * Gated on `resultsReleasedAt`: the query runs only once results are released,
 * so the pre-release exhibitor experience (and all staff flows) keep their
 * existing replication-backed behavior.
 */
export function useClassReleasedResults(
  classId: string | undefined,
  resultsReleasedAt: string | null | undefined
) {
  const isReleased = !!resultsReleasedAt;

  const query = useQuery({
    queryKey: ['classes', classId, 'released-results'],
    queryFn: () => fetchClassReleasedResults(classId!),
    enabled: !!classId && isReleased,
    ...cacheStrategies.moderate,
  });

  return {
    rawEntries: query.data?.rawEntries ?? EMPTY_RESULTS.rawEntries,
    entryData: query.data?.entryData ?? EMPTY_RESULTS.entryData,
    isReleased,
    isLoading: query.isLoading,
  };
}
