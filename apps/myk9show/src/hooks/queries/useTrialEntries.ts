import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import {
  getEntriesByTrial,
  getPublicEntriesByTrial,
  type PublicEntryRow,
} from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';

/** Row shape returned by getEntriesByTrial (snake_case DB columns). */
export interface TrialEntryRow {
  id: string;
  class_id: string;
  entry_status: string | null;
  check_in_status?: string | null;
  is_scored?: boolean | null;
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
 * Adapt a cascade-gated public view row into the TrialEntryRow shape. Owner,
 * class_number, entry_fee and promo_code are unavailable to anon (they are not
 * exposed by the public view) and map to null.
 */
export function publicRowToTrialEntryRow(row: PublicEntryRow): TrialEntryRow {
  return {
    id: row.id,
    class_id: row.class_id ?? '',
    entry_status: row.entry_status,
    check_in_status: row.check_in_status,
    is_scored: row.is_scored,
    handler: row.handler,
    armband: row.armband,
    created_at: row.created_at,
    dog: row.dog_id
      ? {
          id: row.dog_id,
          name: row.dog_name ?? '',
          call_name: row.dog_call_name,
          breed: row.dog_breed,
          owner: null,
        }
      : null,
    class: {
      id: row.class_id ?? '',
      name: row.class_name,
      class_number: null,
      entry_fee: null,
      trial_id: row.trial_id ?? '',
    },
    promo_code: null,
  };
}

/**
 * Shared hook for fetching entries by trial via class join.
 * Used by TrialDetailsPage, TrialEntriesTable, and FinancialSummary.
 * React Query deduplicates calls with the same trialId.
 *
 * Anonymous visitors read through the cascade-gated `view_public_entry_results`;
 * authenticated callers use the full table read (still governed by RLS).
 */
export const useTrialEntries = (trialId: string) => {
  const { user, loading } = useAuthContext();
  const isAnon = !user;

  return useQuery<TrialEntryRow[]>({
    queryKey: [...queryKeys.trialEntries(trialId), isAnon ? 'public' : 'auth'],
    queryFn: async () => {
      if (isAnon) {
        const { data } = await getPublicEntriesByTrial(trialId);
        return data.map(publicRowToTrialEntryRow);
      }
      const { data, error } = await getEntriesByTrial(trialId);
      if (error) throw error;
      return data as unknown as TrialEntryRow[];
    },
    enabled: !!trialId && !loading,
    ...cacheStrategies.dynamic,
  });
};
