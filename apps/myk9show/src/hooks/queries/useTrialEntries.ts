import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { getEntriesByTrial, type PublicEntryRow } from '@/services/database/entries';
import {
  getHandlerPeopleHydrationRevision,
  subscribeHandlerPeopleHydration,
} from '@/services/database/entries/handlerHydration';
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
}

/**
 * Adapt a cascade-gated public view row into the TrialEntryRow shape. Owner,
 * class_number and entry_fee are unavailable to anon (they are not
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
  };
}

/**
 * Shared hook for fetching entries by trial via class join.
 * Used by TrialDetailsPage, TrialEntriesTable, and FinancialSummary.
 * React Query deduplicates calls with the same trialId.
 *
 * Anonymous visitors do not read entry rows here. Released public results use
 * their dedicated result surface; this hook is reserved for authenticated
 * entry management and the authenticated trial entries tab.
 */
export const useTrialEntries = (trialId: string) => {
  const { user, loading } = useAuthContext();
  const isAnon = !user || user.is_anonymous === true;
  // Owner names arrive from a people hydration that can finish after the first read; re-read when
  // one lands so a cold device shows owners instead of blanks (MYK9-1320).
  const peopleRevision = useSyncExternalStore(
    subscribeHandlerPeopleHydration,
    getHandlerPeopleHydrationRevision,
    getHandlerPeopleHydrationRevision
  );

  return useQuery<TrialEntryRow[]>({
    queryKey: [...queryKeys.trialEntries(trialId), isAnon ? 'public' : 'auth', peopleRevision],
    queryFn: async () => {
      const { data, error } = await getEntriesByTrial(trialId);
      if (error) throw error;
      return data as unknown as TrialEntryRow[];
    },
    enabled: !!trialId && !loading && !isAnon,
    ...cacheStrategies.dynamic,
  });
};
