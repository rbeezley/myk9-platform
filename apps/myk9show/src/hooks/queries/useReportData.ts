import { useQuery } from '@tanstack/react-query';
import { getShowById } from '@/services/database/queries/showQueries';
import { getTrialsByShow } from '@/services/database/queries/trialQueries';
import { getClassesByTrialId } from '@/services/database/queries/classQueries';
import { getEntriesByClass, getEntriesByShow } from '@/services/database/queries/entryQueries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

export interface UseReportDataOptions {
  showId: string;
  trialId: string | 'all';
  classId: string | 'all';
  reportType: string;
}

/**
 * Aggregates all data needed for report generation.
 * Fetches show, trials, classes, and entries based on the provided filters.
 * Classes are fetched for all trials when trialId === 'all'.
 * Entries are fetched by class when classId is specific, or by show when classId === 'all'.
 */
export function useReportData({ showId, trialId, classId }: UseReportDataOptions) {
  const showQuery = useQuery({
    queryKey: queryKeys.show(showId),
    queryFn: async () => {
      const { data, error } = await getShowById(showId);
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });

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
        const trials = trialsQuery.data ?? [];
        const results = await Promise.all(
          trials.map((trial: { id: string }) => getClassesByTrialId(trial.id))
        );
        const classes = results.flatMap(({ data }) => data ?? []);
        return classes;
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

  const isLoading =
    showQuery.isLoading ||
    trialsQuery.isLoading ||
    classesQuery.isLoading ||
    entriesQuery.isLoading;

  const isError =
    showQuery.isError || trialsQuery.isError || classesQuery.isError || entriesQuery.isError;

  const refetch = () => {
    void showQuery.refetch();
    void trialsQuery.refetch();
    void classesQuery.refetch();
    void entriesQuery.refetch();
  };

  return {
    show: showQuery.data,
    trials: trialsQuery.data,
    classes: classesQuery.data,
    entries: entriesQuery.data,
    isLoading,
    isError,
    refetch,
  };
}
