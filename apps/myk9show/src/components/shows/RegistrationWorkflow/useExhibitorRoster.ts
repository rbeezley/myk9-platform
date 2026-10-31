import { useMemo } from 'react';
import { useDogsByOwnerQuery } from '@/hooks/queries/useDogsDatabase';
import { mapDatabaseDogsArray } from '@/services/mappers/dogMappers';
import type { Dog } from '@/types/dog-types';
import { filterAccessibleDogs } from './DogSelectionStepEnhanced.helpers';

export interface ExhibitorRoster {
  /**
   * The exhibitor's own dogs the dog step offers first. Empty while they load (the picker must
   * not flash the whole roster), and `undefined` when no exhibitor was named or the read failed
   * (the picker then behaves as it always has).
   */
  dogs: Dog[] | undefined;
  /** For the banner; null until a dog carries it. */
  ownerName: string | null;
}

/**
 * "Add entry for <exhibitor>" (MYK9-1594): the dog step opens on that person's dogs. Read through
 * the roster's owner query (replication-backed, offline-capable), then narrowed by the step's own
 * selectable rule.
 */
export function useExhibitorRoster(exhibitorId: string | null): ExhibitorRoster {
  const query = useDogsByOwnerQuery(exhibitorId ?? '', Boolean(exhibitorId));
  return useMemo(() => {
    if (!exhibitorId || query.isError) return { dogs: undefined, ownerName: null };
    const dogs = filterAccessibleDogs(mapDatabaseDogsArray(query.data ?? []));
    const first = dogs[0];
    return { dogs, ownerName: first?.ownerName || first?.owner?.name || null };
  }, [exhibitorId, query.data, query.isError]);
}
