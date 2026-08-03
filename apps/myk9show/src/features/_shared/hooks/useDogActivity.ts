import { useEntriesByDogQuery } from '@/hooks/queries/useEntriesDatabase';

import { deriveDogActivity, type DogActivityEntry } from '@/features/_shared/dogActivity';

export interface UseDogActivityResult {
  /** Entries whose show has not finished and that are still live for this dog. */
  upcoming: DogActivityEntry[];
  /** Scored, non-removed entries whose show has already happened, newest first. */
  recentResults: DogActivityEntry[];
  /**
   * True while the dog's entries are still being read. Surfaces MUST branch on
   * this before rendering an empty state: an unresolved query and a dog with no
   * entries both leave `upcoming` empty, and only one of them means "nothing
   * booked". Rendering the empty copy for the other is the confident false
   * empty state MYK9-121 reported.
   */
  isLoading: boolean;
  /**
   * True when the read failed outright. Same rule as `isLoading` — a failed
   * read is not evidence of an empty calendar, so it must not be drawn as one.
   */
  isError: boolean;
  /**
   * Whether an empty result may be presented as "nothing booked".
   *
   * This is the read's own provenance, not a guess: `getEntriesByDog` is
   * online-first and reports `verified`, which is true only when the rows came
   * from the authoritative online read. Entries replicate per-show, so a dog's
   * entries span many scopes and an offline result is only ever a lower bound —
   * it cannot distinguish "no entries" from "that show never synced". Surfaces
   * must render an unknown state rather than the empty copy when this is false.
   *
   * Lives on the hook rather than in each surface so Overview and Career cannot
   * apply the rule differently.
   */
  canTrustEmpty: boolean;
  /** Re-run the read — lets an error state offer retry without a page reload. */
  refetch: () => void;
}

/**
 * The one dog-scoped entry query every dog surface should compose.
 *
 * `useEntriesByDogQuery` -> `getEntriesByDog` is online-first with the local
 * replica as its offline fallback, and reports which one it used. A dog's
 * entries span many per-show replication scopes, so only the online read can
 * establish that a dog has nothing coming up.
 */
export function useDogActivity(dogId: string): UseDogActivityResult {
  const { data, isLoading, isError, refetch } = useEntriesByDogQuery(dogId);

  // Deliberately not memoised: `deriveDogActivity` defaults `today` to the
  // current date, so caching it across renders would freeze the
  // upcoming/past boundary at whenever the entry list last changed.
  const entries = (data?.rows ?? []).map(row => row as unknown as DogActivityEntry);
  const { upcoming, recentResults } = deriveDogActivity(entries);

  return {
    upcoming,
    recentResults,
    isLoading,
    isError,
    // An unresolved query has no provenance yet, so it cannot vouch for an
    // empty list either. Surfaces branch on `isLoading` first regardless.
    canTrustEmpty: data?.verified ?? false,
    refetch,
  };
}
