// React Query hooks for Trial database operations.
//
// Lane 3.7: the trial *store* (useTrialStore) is fed only by the replication
// layer, which never syncs for a logged-out guest — so a cold anon visitor has
// an empty store and pages that read `trials.find(...)` get `undefined`. These
// by-id hooks read through the service layer's anon-safe `getTrialById` (which
// self-falls-through to a direct PostgREST read on a cold store), mapping the
// DB row back into the store's `Trial` shape so pages can use it as a fallback.
import { useQuery } from '@tanstack/react-query';
import { getTrialById } from '@/services/database/trials';
import { mapDatabaseToTrial, type DbTrialWithShow } from '@/services/mappers/trialMappers';
import type { Trial } from '@/components/trials/types/trial.types';

export const trialQueryKeys = {
  all: ['trials'] as const,
  details: () => [...trialQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...trialQueryKeys.details(), id] as const,
};

/**
 * Resolve a single trial by id through the anon-safe service read, mapped into
 * the store `Trial` shape. Pass `undefined`/empty to disable (e.g. when the
 * store already has the trial for an authenticated/warm session).
 */
export const useTrialQuery = (id: string | undefined) => {
  return useQuery<Trial | null>({
    queryKey: trialQueryKeys.detail(id ?? ''),
    queryFn: async () => {
      const { data, error } = await getTrialById(id as string);
      if (error) throw error;
      return data ? mapDatabaseToTrial(data as unknown as DbTrialWithShow) : null;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
};
