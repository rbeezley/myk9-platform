import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';
import { mapRowToStatsEntry, STATS_ENTRY_SELECT, type StatsTrialMeta } from './statsEntryMapper';

async function fetchJudgeShowEntries(judgeId: string, showId: string): Promise<StatsEntry[]> {
  // Use direct show_id on judge_assignments (no deep path filter needed)
  const { data: assignments, error: assignError } = await supabase
    .from('judge_assignments')
    .select(
      `
      class_id,
      classes!inner(
        trial_id,
        trials!inner(trial_date:date, trial_number, name)
      )
    `
    )
    .eq('person_id', judgeId)
    .eq('show_id', showId);

  if (assignError) throw assignError;
  if (!assignments || assignments.length === 0) return [];

  const classTrialMap = new Map<string, StatsTrialMeta>();
  const classIds: string[] = [];
  for (const a of assignments) {
    const classId = a.class_id as string;
    classIds.push(classId);
    const cls = a.classes as Record<string, unknown>;
    const trial = cls.trials as Record<string, unknown>;
    classTrialMap.set(classId, {
      trialDate: (trial.trial_date as string) || '',
      trialName: (trial.name as string) || '',
      trialNumber: (trial.trial_number as string) || '',
    });
  }

  const { data, error } = await supabase
    .from('view_authenticated_entry_results')
    .select(STATS_ENTRY_SELECT)
    .eq('show_id', showId)
    .in('class_id', classIds);

  if (error) throw error;

  return (data || []).map((row: Record<string, unknown>) =>
    mapRowToStatsEntry(row, classTrialMap.get(row.class_id as string))
  );
}

export function useJudgeShowStats(judgeId: string | undefined, showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.judgeShowStats(judgeId || '', showId || ''),
    queryFn: () => fetchJudgeShowEntries(judgeId!, showId!),
    enabled: !!judgeId && !!showId,
    ...cacheStrategies.moderate,
  });
}
