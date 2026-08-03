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
  /** Re-run the read — lets an error state offer retry without a page reload. */
  refetch: () => void;
}

/**
 * The one dog-scoped entry query every dog surface should compose.
 *
 * `useEntriesByDogQuery` -> `getEntriesByDog` is replication-backed and
 * verifies online when the local replica comes back empty, so a dog whose
 * entries have not synced does not read as a dog with no entries.
 */
export function useDogActivity(dogId: string): UseDogActivityResult {
  const { data, isLoading, isError, refetch } = useEntriesByDogQuery(dogId);

  // Deliberately not memoised: `deriveDogActivity` defaults `today` to the
  // current date, so caching it across renders would freeze the
  // upcoming/past boundary at whenever the entry list last changed.
  const entries = (data ?? []).map(row => row as unknown as DogActivityEntry);
  const { upcoming, recentResults } = deriveDogActivity(entries);

  return { upcoming, recentResults, isLoading, isError, refetch };
}
