import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';
import { ACTIVE_JUDGE_ASSIGNMENT_STATUSES } from '@/services/database/judges/assignmentStatus';
import { attributeClassJudges, type ClassJudgeAssignmentRow } from './attributeClassJudges';
import { mapRowToStatsEntry, STATS_ENTRY_SELECT, type StatsTrialMeta } from './statsEntryMapper';

interface ShowStatsData {
  entries: StatsEntry[];
  judgeLookupFailed: boolean;
}

async function fetchShowEntries(showId: string): Promise<ShowStatsData> {
  const { data: entryData, error: entryError } = await supabase
    .from('view_authenticated_entry_results')
    .select(STATS_ENTRY_SELECT)
    .eq('show_id', showId);

  if (entryError) throw entryError;
  if (!entryData || entryData.length === 0) return { entries: [], judgeLookupFailed: false };

  // Fetch trial metadata from classes table (can't join through views)
  const classIds = [...new Set(entryData.map(r => r.class_id as string))];
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select('id, trial_id, trials!inner(trial_date:date, trial_number, name)')
    .in('id', classIds);

  if (classError) throw classError;

  // Which person judges each class, for the Judge filter. A failed lookup must not discard
  // the stats: return them with no attribution and let the filter say it is unavailable.
  let classJudges = new Map<string, string>();
  let judgeLookupFailed = false;
  const { data: assignmentData, error: assignmentError } = await supabase
    .from('judge_assignments')
    .select('class_id, person_id, status')
    .eq('show_id', showId)
    .in('status', [...ACTIVE_JUDGE_ASSIGNMENT_STATUSES]);
  if (assignmentError) {
    judgeLookupFailed = true;
  } else {
    classJudges = attributeClassJudges((assignmentData ?? []) as ClassJudgeAssignmentRow[]);
  }

  const classTrialMap = new Map<string, StatsTrialMeta>();
  for (const cls of classData || []) {
    const trial = cls.trials as unknown as Record<string, unknown>;
    classTrialMap.set(cls.id as string, {
      trialDate: (trial?.trial_date as string) || '',
      trialName: (trial?.name as string) || '',
      trialNumber: (trial?.trial_number as string) || '',
      judgeIds: classJudges.has(cls.id as string) ? [classJudges.get(cls.id as string)!] : [],
    });
  }

  return {
    entries: entryData.map((row: Record<string, unknown>) =>
      mapRowToStatsEntry(row, classTrialMap.get(row.class_id as string))
    ),
    judgeLookupFailed,
  };
}

export function useShowStats(showId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.showStats(showId || ''),
    queryFn: () => fetchShowEntries(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
  return {
    ...query,
    data: query.data?.entries,
    /** True when judge assignments could not be read; entries then carry no judge. */
    judgeLookupFailed: query.data?.judgeLookupFailed ?? false,
  };
}
