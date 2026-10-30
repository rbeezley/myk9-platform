import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

/**
 * One class's server-kept scoring state (MYK9-1512). `scored_count` and `results_released_at`
 * are maintained by `refresh_class_scoring_state` and the release flow, which apply the real
 * eligibility rules, so the Pending classes list reads them instead of counting entry rows.
 * (`total_entries_count` has no maintainer, MYK9-65, so no total is offered.)
 */
export interface ShowClassProgress {
  classId: string;
  className: string;
  trialId: string;
  element: string;
  level: string;
  scoredCount: number;
  resultsReleasedAt: string | null;
  /** The class's trial, so filters can name it without the (staff-only) entries view. */
  trialName: string;
  trialNumber: string;
  trialDate: string;
}

async function fetchShowClassProgress(showId: string): Promise<ShowClassProgress[]> {
  const { data, error } = await supabase
    .from('classes')
    .select(
      'id, trial_id, name, element, level, scored_count, results_released_at, trials!inner(show_id, trial_date:date, trial_number, name)'
    )
    .eq('trials.show_id', showId)
    .is('deleted_at', null);

  if (error) throw error;

  return (data ?? []).map(row => {
    const trial = (row.trials ?? {}) as unknown as Record<string, string | null>;
    return {
      classId: row.id as string,
      className: (row.name as string | null) || 'Unknown Class',
      trialId: (row.trial_id as string | null) ?? '',
      element: (row.element as string | null) ?? '',
      level: (row.level as string | null) ?? '',
      scoredCount: (row.scored_count as number | null) ?? 0,
      resultsReleasedAt: (row.results_released_at as string | null) ?? null,
      trialName: trial.name ?? '',
      trialNumber: trial.trial_number ?? '',
      trialDate: trial.trial_date ?? '',
    };
  });
}

/** `refetchInterval` is the caller's: the Results tab owns the one clock for Pending and podium. */
export function useShowClassProgress(
  showId: string | undefined,
  options: { refetchInterval?: number } = {}
) {
  return useQuery({
    queryKey: queryKeys.showClassProgress(showId || ''),
    queryFn: () => fetchShowClassProgress(showId!),
    enabled: !!showId,
    ...cacheStrategies.realtime,
    refetchInterval: options.refetchInterval ?? false,
  });
}
