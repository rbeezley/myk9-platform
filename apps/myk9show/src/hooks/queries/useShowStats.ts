import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';
import { mapRowToStatsEntry, STATS_ENTRY_SELECT, type StatsTrialMeta } from './statsEntryMapper';

async function fetchShowEntries(showId: string): Promise<StatsEntry[]> {
  const { data: entryData, error: entryError } = await supabase
    .from('view_authenticated_entry_results')
    .select(STATS_ENTRY_SELECT)
    .eq('show_id', showId);

  if (entryError) throw entryError;
  if (!entryData || entryData.length === 0) return [];

  // Fetch trial metadata from classes table (can't join through views)
  const classIds = [...new Set(entryData.map(r => r.class_id as string))];
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select('id, trial_id, trials!inner(trial_date:date, trial_number, name)')
    .in('id', classIds);

  if (classError) throw classError;

  // Which people judge each class, for the Judge filter (same table useJudgeShowStats reads).
  const { data: assignmentData, error: assignmentError } = await supabase
    .from('judge_assignments')
    .select('class_id, person_id')
    .eq('show_id', showId)
    // A declined or cancelled judge did not judge the class.
    .or('status.is.null,status.not.in.(declined,cancelled)');

  if (assignmentError) throw assignmentError;

  const classJudges = new Map<string, string[]>();
  for (const a of assignmentData || []) {
    const classId = a.class_id as string | null;
    if (!classId) continue;
    classJudges.set(classId, [...(classJudges.get(classId) ?? []), a.person_id as string]);
  }

  const classTrialMap = new Map<string, StatsTrialMeta>();
  for (const cls of classData || []) {
    const trial = cls.trials as unknown as Record<string, unknown>;
    classTrialMap.set(cls.id as string, {
      trialDate: (trial?.trial_date as string) || '',
      trialName: (trial?.name as string) || '',
      trialNumber: (trial?.trial_number as string) || '',
      judgeIds: classJudges.get(cls.id as string) ?? [],
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
