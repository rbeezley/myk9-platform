/**
 * Composition hook: merges platform results + manual results for a specific dog,
 * then computes performance statistics.
 */
import { useMemo } from 'react';
import { useExhibitorResults } from '@/hooks/queries/useExhibitorResults';
import { useManualResultsQuery } from '@/hooks/queries/useManualResultsDatabase';
import { computePerformanceStats, type PerformanceStats } from '@/services/performanceStatsEngine';

export function usePerformanceStatistics(dogId: string) {
  const {
    data: allExhibitorResults = [],
    isLoading: loadingResults,
    isError: errorResults,
    refetch: refetchResults,
  } = useExhibitorResults();
  const {
    data: manualResults = [],
    isLoading: loadingManual,
    isError: errorManual,
    refetch: refetchManual,
  } = useManualResultsQuery(dogId);

  const isLoading = loadingResults || loadingManual;
  const isError = errorResults || errorManual;

  const refetch = () => {
    void refetchResults();
    void refetchManual();
  };

  const stats = useMemo<PerformanceStats | null>(() => {
    if (isLoading || isError) return null;

    // Filter platform results to this specific dog
    const dogPlatformResults = allExhibitorResults.filter(r => r.dogId === dogId);

    return computePerformanceStats(dogPlatformResults, manualResults);
  }, [isLoading, isError, allExhibitorResults, manualResults, dogId]);

  return { stats, isLoading, isError, refetch };
}
