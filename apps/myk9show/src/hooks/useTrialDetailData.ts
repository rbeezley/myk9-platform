import { useTrialStore } from '@/store/trialStore';
import { useShowStore } from '@/store/showStore';
import { useTrialQuery } from '@/hooks/queries/useTrialsDatabase';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import type { Trial, TrialClass } from '@/components/trials/types/trial.types';
import type { Show } from '@/types/show-types';

export type TrialWithClasses = Trial & { classes?: TrialClass[] };

export interface TrialDetailData {
  /** The resolved trial: the store row when warm, the anon by-id fallback when cold. */
  currentTrial: TrialWithClasses | undefined;
  /** The trial's parent show: store row when warm, anon by-id fallback when cold. */
  parentShow: Show | undefined;
  /** True once the anon trial fallback resolved successfully (distinguishes not-found from error). */
  fallbackTrialResolved: boolean;
  /** True when the anon trial fallback fetch failed (network / RLS / PostgREST). */
  fallbackTrialError: boolean;
  refetchFallbackTrial: () => void;
}

/**
 * Anon / cold-store fallback data layer for the trial detail surface.
 *
 * Lane 3.7: the trial + show stores are replication-fed and never sync for a
 * logged-out guest, so a cold anon visitor finds nothing in them. `useTrialQuery`
 * / `useShowQuery` self-fall-through to anon-safe by-id PostgREST reads, enabled
 * only when the store is cold, so the public trial page renders instead of being
 * stuck on "Loading trial...". Warm sessions keep using the store rows unchanged.
 *
 * Mirrors useShowLandingData for the show surface — the page consumes this and
 * keeps the warm-vs-cold selection trivial (store row preferred, fallback next).
 */
export function useTrialDetailData(trialId: string | undefined): TrialDetailData {
  const { trials, selectedTrialId } = useTrialStore();
  const { shows } = useShowStore();

  const storeTrial = trials.find(trial => trial.id === selectedTrialId);
  const {
    data: fallbackTrial,
    isSuccess: fallbackTrialResolved,
    isError: fallbackTrialError,
    refetch: refetchFallbackTrial,
  } = useTrialQuery(storeTrial ? undefined : trialId);
  const currentTrial = (storeTrial ?? fallbackTrial ?? undefined) as TrialWithClasses | undefined;

  const storeShow = currentTrial
    ? shows.find(show => show.id === currentTrial.showId)
    : undefined;
  // Same cold-store gap for the parent show — getShowById is already anon-safe.
  const { data: fallbackShow } = useShowQuery(
    !storeShow && currentTrial?.showId ? currentTrial.showId : ''
  );
  const parentShow = (storeShow ?? fallbackShow ?? undefined) as Show | undefined;

  return {
    currentTrial,
    parentShow,
    fallbackTrialResolved,
    fallbackTrialError,
    refetchFallbackTrial: () => {
      void refetchFallbackTrial();
    },
  };
}
