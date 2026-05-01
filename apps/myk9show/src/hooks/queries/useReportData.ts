import { useQuery } from '@tanstack/react-query';
import { getTrialsByShow } from '@/services/database/trials';
import { getClassesByTrialId } from '@/services/database/classes';
import { getEntriesByClass, getEntriesByShow } from '@/services/database/entries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { Show } from '@/types/show-types';

export interface UseReportDataOptions {
  show: Show | null;
  trialId: string | 'all';
  classId: string | 'all';
}

/**
 * Fetches trials, classes, and entries for report generation.
 * Show data comes from the store (already loaded via replication).
 */
export function useReportData({ show, trialId, classId }: UseReportDataOptions) {
  const showId = show?.id ?? '';

  const trialsQuery = useQuery({
    queryKey: queryKeys.showTrials(showId),
    queryFn: async () => {
      const { data, error } = await getTrialsByShow(showId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });

  const classesQuery = useQuery({
    queryKey: [...queryKeys.showClasses(showId), trialId],
    queryFn: async () => {
      if (trialId === 'all') {
        const trials = (trialsQuery.data ?? []) as Array<{ id: string }>;
        const results = await Promise.all(trials.map(trial => getClassesByTrialId(trial.id)));
        return results.flatMap(({ data }) => data ?? []);
      }
      const { data, error } = await getClassesByTrialId(trialId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: trialsQuery.isSuccess,
    ...cacheStrategies.moderate,
  });

  const entriesQuery = useQuery({
    queryKey: queryKeys.reportData(showId, trialId, classId),
    queryFn: async () => {
      if (classId !== 'all') {
        const { data, error } = await getEntriesByClass(classId);
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await getEntriesByShow(showId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: classesQuery.isSuccess,
    ...cacheStrategies.moderate,
  });

  const isLoading = trialsQuery.isLoading || classesQuery.isLoading || entriesQuery.isLoading;
  const isError = trialsQuery.isError || classesQuery.isError || entriesQuery.isError;

  const refetch = () => {
    void trialsQuery.refetch();
    void classesQuery.refetch();
    void entriesQuery.refetch();
  };

  return {
    show,
    trials: trialsQuery.data,
    classes: classesQuery.data,
    entries: entriesQuery.data,
    isLoading,
    isError,
    refetch,
  };
}
