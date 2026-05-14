import { useQuery } from '@tanstack/react-query';
import { getEntriesByClass } from '@/services/database/entries';
import { cacheStrategies } from '@/lib/queryClient';

/** Raw DB entry row with all columns intact (no mapper that drops scoring fields). */
export interface RawEntryRow {
  id: string;
  class_id: string;
  show_id: string;
  dog_id: string;
  handler_id: string | null;
  armband: string | null;
  handler: string | null;
  result_status: string | null;
  is_scored: boolean | null;
  search_time_seconds: number | null;
  total_faults: number | null;
  final_placement: number | null;
  judge_notes: string | null;
  disqualification_reason: string | null;
  scoring_completed_at: string | null;
  check_in_status: string | null;
  run_order: number | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
    breed: string | null;
    registrations?:
      | Array<{
          organization: string | null;
          breed: string | null;
        }>
      | null
      | undefined;
    owner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
  } | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Returns raw DB entry rows for a class with all scoring columns intact.
 * Unlike useClassEntriesWithQuery, this does NOT run through mapDatabaseToEntry
 * which drops scoring fields.
 */
export function useClassEntriesRaw(classId: string | undefined) {
  return useQuery({
    queryKey: ['classes', classId, 'entries'],
    queryFn: async () => {
      if (!classId) return [];
      const { data, error } = await getEntriesByClass(classId);
      if (error) throw error;
      return (data ?? []) as unknown as RawEntryRow[];
    },
    enabled: !!classId,
    ...cacheStrategies.dynamic,
  });
}
