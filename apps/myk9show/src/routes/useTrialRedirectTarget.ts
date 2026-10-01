/**
 * Resolves a trial id to its show for legacy `/trials/:trialId/...` redirects (MYK9-907).
 *
 * A cold browser's trial store is read from IndexedDB only and can finish empty before
 * replication lands, so an empty store proves nothing. Prefer the warm store trial; otherwise
 * ask the by-id query (the one TrialDetailsPage uses) and report `absent` only once that query
 * has CONFIRMED the trial does not exist. A failed read is `error`, never `absent`.
 */
import { useTrialQuery } from '@/hooks/queries/useTrialsDatabase';
import { useTrialStore } from '@/store/trialStore';

export type TrialRedirectTarget =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'absent' }
  | { status: 'found'; showId: string };

export function useTrialRedirectTarget(trialId: string): TrialRedirectTarget {
  const storeTrial = useTrialStore(state => state.getTrialById(trialId));
  const {
    data: fetchedTrial,
    isSuccess,
    isError,
    refetch,
  } = useTrialQuery(storeTrial ? undefined : trialId);
  const trial = storeTrial ?? fetchedTrial;

  if (trial?.showId) return { status: 'found', showId: trial.showId };
  if (isError) return { status: 'error', retry: () => void refetch() };
  if (isSuccess) return { status: 'absent' };
  return { status: 'loading' };
}
