import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useDogsQuery } from './useDogsDatabase';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';
import { mapRowToStatsEntry, STATS_ENTRY_SELECT } from './statsEntryMapper';

async function fetchMyShowEntries(showId: string, dogIds: string[]): Promise<StatsEntry[]> {
  if (dogIds.length === 0) return [];

  const { data, error } = await supabase
    .from('view_entry_with_results')
    .select(STATS_ENTRY_SELECT)
    .eq('show_id', showId)
    .in('dog_id', dogIds);

  if (error) throw error;

  return (data || []).map((row: Record<string, unknown>) => mapRowToStatsEntry(row));
}

export function useMyShowStats(showId: string | undefined) {
  const { data: dogs = [] } = useDogsQuery();
  const dogIds = dogs.map((d: Record<string, unknown>) => d.id as string);
  const sortedIds = dogIds.slice().sort();

  return useQuery({
    queryKey: [...queryKeys.myShowStats(showId || ''), sortedIds],
    queryFn: () => fetchMyShowEntries(showId!, dogIds),
    enabled: !!showId && dogIds.length > 0,
    ...cacheStrategies.moderate,
  });
}
