/**
 * Hook for fetching scored results for the current user's dogs.
 * Queries view_entry_with_results for entries that have been scored.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useDogsQuery } from './useDogsDatabase';
import { cacheStrategies } from '@/lib/queryClient';
import type { ResultStatus } from '@/components/common/ResultBadge';

export interface ExhibitorResult {
  id: string;
  dogId: string;
  dogName: string;
  dogCallName: string;
  showId: string;
  classId: string;
  className: string;
  classLevel: string | null;
  classElement: string | null;
  resultText: 'Q' | 'NQ' | 'ABS' | 'EX' | 'WD' | 'pending';
  resultStatus: ResultStatus;
  searchTimeSeconds: number | null;
  totalFaults: number | null;
  finalPlacement: number | null;
  scoringCompletedAt: string | null;
  showName: string;
  showDate: string;
}

async function fetchExhibitorResults(dogIds: string[]) {
  if (dogIds.length === 0) return [];

  const { data, error } = await supabase
    .from('view_entry_with_results')
    .select(
      `
      id,
      dog_id,
      dog_name,
      dog_call_name,
      show_id,
      class_id,
      class_name,
      class_level,
      class_element,
      result_text,
      result_status,
      search_time_seconds,
      total_faults,
      final_placement,
      scoring_completed_at,
      show:show_id (
        id,
        name,
        start_date
      )
    `
    )
    .in('dog_id', dogIds)
    .eq('is_scored', true)
    .order('scoring_completed_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(
    (row: Record<string, unknown>): ExhibitorResult => ({
      id: row.id as string,
      dogId: row.dog_id as string,
      dogName: row.dog_name as string,
      dogCallName: (row.dog_call_name as string) || (row.dog_name as string),
      showId: row.show_id as string,
      classId: row.class_id as string,
      className: (row.class_name as string) || 'Unknown Class',
      classLevel: row.class_level as string | null,
      classElement: row.class_element as string | null,
      resultText: row.result_text as ExhibitorResult['resultText'],
      resultStatus: row.result_status as ResultStatus,
      searchTimeSeconds: row.search_time_seconds as number | null,
      totalFaults: row.total_faults as number | null,
      finalPlacement: row.final_placement as number | null,
      scoringCompletedAt: row.scoring_completed_at as string | null,
      showName: ((row.show as Record<string, unknown>)?.name as string) || 'Unknown Show',
      showDate: ((row.show as Record<string, unknown>)?.start_date as string) || '',
    })
  );
}

/**
 * Fetches scored results for all dogs owned by the current user.
 * Returns results ordered by most recent scoring date.
 */
export function useExhibitorResults() {
  const { data: dogs = [] } = useDogsQuery();
  const dogIds = dogs.map((d: Record<string, unknown>) => d.id as string);
  const sortedIds = dogIds.slice().sort();

  return useQuery({
    queryKey: ['exhibitor', 'results', sortedIds],
    queryFn: () => fetchExhibitorResults(dogIds),
    enabled: dogIds.length > 0,
    ...cacheStrategies.moderate,
  });
}
