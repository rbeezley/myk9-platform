import { useQuery } from '@tanstack/react-query';
import { cacheStrategies } from '@/lib/queryClient';
import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';

/**
 * Shared hook for fetching entries by trial via class join.
 * Used by TrialDetailsPage, TrialEntriesTable, and FinancialSummary.
 * React Query deduplicates calls with the same trialId.
 */
export const useTrialEntries = (trialId: string) => {
  return useQuery({
    queryKey: ['trials', trialId, 'entries'],
    queryFn: async () => {
      const { data, error } = await getEntriesByTrial(trialId);
      if (error) throw error;
      return data;
    },
    enabled: !!trialId,
    ...cacheStrategies.dynamic,
  });
};
