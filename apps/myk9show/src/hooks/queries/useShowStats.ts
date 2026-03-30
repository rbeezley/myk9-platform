import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';
import { mapRowToStatsEntry, STATS_ENTRY_SELECT } from './statsEntryMapper';

async function fetchShowEntries(showId: string): Promise<StatsEntry[]> {
  const { data: entryData, error: entryError } = await supabase
    .from('view_entry_with_results')
    .select(STATS_ENTRY_SELECT)
    .eq('show_id', showId);

  if (entryError) throw entryError;
  if (!entryData || entryData.length === 0) return [];

  // Fetch trial metadata from classes table (can't join through views)
  const classIds = [...new Set(entryData.map(r => r.class_id as string))];
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select('id, trial_id, trials!inner(trial_date, trial_number)')
    .in('id', classIds);

  if (classError) throw classError;

  const classTrialMap = new Map<string, { trialDate: string; trialNumber: string }>();
  for (const cls of classData || []) {
    const trial = cls.trials as unknown as Record<string, unknown>;
    classTrialMap.set(cls.id as string, {
      trialDate: (trial?.trial_date as string) || '',
      trialNumber: (trial?.trial_number as string) || '',
    });
  }

  return entryData.map((row: Record<string, unknown>) =>
    mapRowToStatsEntry(row, classTrialMap.get(row.class_id as string))
  );
}

export function useShowStats(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.showStats(showId || ''),
    queryFn: () => fetchShowEntries(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
