/**
 * Hook for fetching the current user's entries in a specific show.
 * Returns StatsEntry[] for use with analytics computation functions.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useDogsQuery } from './useDogsDatabase';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';

async function fetchMyShowEntries(
  showId: string,
  dogIds: string[]
): Promise<StatsEntry[]> {
  if (dogIds.length === 0) return [];

  const { data, error } = await supabase
    .from('view_entry_with_results')
    .select(
      `
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
    `
    )
    .eq('show_id', showId)
    .in('dog_id', dogIds);

  if (error) throw error;

  return (data || []).map(
    (row: Record<string, unknown>): StatsEntry => ({
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
      resultText:
        (row.result_text as StatsEntry['resultText']) || 'pending',
      searchTimeSeconds: row.search_time_seconds as number | null,
      totalFaults: row.total_faults as number | null,
      finalPlacement: row.final_placement as number | null,
    })
  );
}

/**
 * Fetches entries for the current user's dogs in a specific show.
 * Returns StatsEntry[] for analytics computation.
 */
export function useMyShowStats(showId: string | undefined) {
  const { data: dogs = [] } = useDogsQuery();
  const dogIds = dogs.map((d: Record<string, unknown>) => d.id as string);

  return useQuery({
    queryKey: queryKeys.myShowStats(showId || ''),
    queryFn: () => fetchMyShowEntries(showId!, dogIds),
    enabled: !!showId && dogIds.length > 0,
    ...cacheStrategies.moderate,
  });
}
