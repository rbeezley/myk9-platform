import type { StatsEntry } from '@/components/analytics/analytics-utils';

/**
 * Maps a raw Supabase row from `view_entry_with_results` to a StatsEntry.
 * Shared across useShowStats, useJudgeShowStats, and useMyShowStats.
 */
export function mapRowToStatsEntry(
  row: Record<string, unknown>,
  trialMeta?: { trialDate: string; trialNumber: string }
): StatsEntry {
  return {
    id: row.id as string,
    dogId: row.dog_id as string,
    dogCallName: (row.dog_call_name as string) || '',
    showId: row.show_id as string,
    showName: '',
    showDate: '',
    classId: row.class_id as string,
    className: (row.class_name as string) || 'Unknown Class',
    classElement: row.class_element as string | null,
    classLevel: row.class_level as string | null,
    resultText: (row.result_text as StatsEntry['resultText']) || 'pending',
    searchTimeSeconds: row.search_time_seconds as number | null,
    totalFaults: row.total_faults as number | null,
    finalPlacement: row.final_placement as number | null,
    trialDate: trialMeta?.trialDate || '',
    trialNumber: trialMeta?.trialNumber || '',
  };
}

/** The select fragment used when querying view_entry_with_results for stats. */
export const STATS_ENTRY_SELECT = `
  id,
  dog_id,
  dog_call_name,
  show_id,
  class_id,
  class_name,
  class_element,
  class_level,
  result_text,
  search_time_seconds,
  total_faults,
  final_placement
`;
