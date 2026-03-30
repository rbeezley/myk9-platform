import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';

async function fetchShowEntries(showId: string): Promise<StatsEntry[]> {
  // 1. Fetch entries from the view (no nested joins on views)
  const { data: entryData, error: entryError } = await supabase
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
    .eq('show_id', showId);

  if (entryError) throw entryError;
  if (!entryData || entryData.length === 0) return [];

  // 2. Fetch trial metadata for classes in this show
  const classIds = [...new Set(entryData.map(r => r.class_id as string))];
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select('id, trial_id, trials!inner(trial_date, trial_number)')
    .in('id', classIds);

  if (classError) throw classError;

  // Build classId -> trial metadata map
  const classTrialMap = new Map<string, { trialDate: string; trialNumber: string }>();
  for (const cls of classData || []) {
    const trial = cls.trials as unknown as Record<string, unknown>;
    classTrialMap.set(cls.id as string, {
      trialDate: (trial?.trial_date as string) || '',
      trialNumber: (trial?.trial_number as string) || '',
    });
  }

  // 3. Merge
  return entryData.map((row: Record<string, unknown>): StatsEntry => {
    const classId = row.class_id as string;
    const trialMeta = classTrialMap.get(classId);

    return {
      id: row.id as string,
      dogId: row.dog_id as string,
      dogCallName: (row.dog_call_name as string) || '',
      showId: row.show_id as string,
      showName: '',
      showDate: '',
      classId,
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
  });
}

export function useShowStats(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.showStats(showId || ''),
    queryFn: () => fetchShowEntries(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
