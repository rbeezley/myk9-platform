import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';

async function fetchJudgeShowEntries(judgeId: string, showId: string): Promise<StatsEntry[]> {
  const { data: assignments, error: assignError } = await supabase
    .from('judge_assignments')
    .select(
      `
      class_id,
      classes!inner(
        trial_id,
        trials!inner(show_id, trial_date, trial_number)
      )
    `
    )
    .eq('person_id', judgeId)
    .eq('classes.trials.show_id', showId);

  if (assignError) throw assignError;
  if (!assignments || assignments.length === 0) return [];

  const classTrialMap = new Map<string, { trialDate: string; trialNumber: string }>();
  const classIds: string[] = [];
  for (const a of assignments) {
    const classId = a.class_id as string;
    classIds.push(classId);
    const cls = a.classes as Record<string, unknown>;
    const trial = cls.trials as Record<string, unknown>;
    classTrialMap.set(classId, {
      trialDate: (trial.trial_date as string) || '',
      trialNumber: (trial.trial_number as string) || '',
    });
  }

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
    .in('class_id', classIds);

  if (error) throw error;

  return (data || []).map((row: Record<string, unknown>): StatsEntry => {
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

export function useJudgeShowStats(judgeId: string | undefined, showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.judgeShowStats(judgeId || '', showId || ''),
    queryFn: () => fetchJudgeShowEntries(judgeId!, showId!),
    enabled: !!judgeId && !!showId,
    ...cacheStrategies.moderate,
  });
}
