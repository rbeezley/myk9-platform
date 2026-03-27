import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';

/** Row shape returned by getEntriesByTrial (snake_case DB columns). */
export interface TrialEntryRow {
  id: string;
  class_id: string;
  entry_status: string | null;
  check_in_status?: string | null;
  handler: string | null;
  armband: string | null;
  created_at: string | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
    breed: string | null;
    owner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  } | null;
  class: {
    id: string;
    name: string | null;
    class_number: string | null;
    entry_fee: number | null;
    trial_id: string;
  };
  promo_code: {
    id: string;
    code: string;
    discount_type: string | null;
    discount_value: number | null;
  } | null;
}

/**
 * Shared hook for fetching entries by trial via class join.
 * Used by TrialDetailsPage, TrialEntriesTable, and FinancialSummary.
 * React Query deduplicates calls with the same trialId.
 */
export const useTrialEntries = (trialId: string) => {
  return useQuery<TrialEntryRow[]>({
    queryKey: queryKeys.trialEntries(trialId),
    queryFn: async () => {
      const { data, error } = await getEntriesByTrial(trialId);
      if (error) throw error;
      return data as unknown as TrialEntryRow[];
    },
    enabled: !!trialId,
    ...cacheStrategies.dynamic,
  });
};
