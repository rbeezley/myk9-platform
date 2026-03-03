/**
 * Composition hook: merges platform results + manual results for a specific dog,
 * then computes performance statistics.
 */
import { useMemo } from 'react';
import { useExhibitorResults } from '@/hooks/queries/useExhibitorResults';
import { useManualResultsQuery } from '@/hooks/queries/useManualResultsDatabase';
import { computePerformanceStats, type PerformanceStats } from '@/services/performanceStatsEngine';

export function usePerformanceStatistics(dogId: string) {
  const { data: allExhibitorResults = [], isLoading: loadingResults } = useExhibitorResults();
  const { data: manualResults = [], isLoading: loadingManual } = useManualResultsQuery(dogId);

  const isLoading = loadingResults || loadingManual;

  const stats = useMemo<PerformanceStats | null>(() => {
    if (isLoading) return null;

    // Filter platform results to this specific dog
    const dogPlatformResults = allExhibitorResults.filter(r => r.dogId === dogId);

    return computePerformanceStats(dogPlatformResults, manualResults);
  }, [isLoading, allExhibitorResults, manualResults, dogId]);

  return { stats, isLoading };
}
