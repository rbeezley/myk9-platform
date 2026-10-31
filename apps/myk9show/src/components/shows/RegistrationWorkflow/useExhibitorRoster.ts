import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
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
export function useExhibitorRoster(
  exhibitorId: string | null,
  /** The wizard's own dog list, which owner resolution reads (it caches for minutes). */
  wizardDogs: readonly Dog[]
): ExhibitorRoster {
  const queryClient = useQueryClient();
  const query = useDogsByOwnerQuery(exhibitorId ?? '', Boolean(exhibitorId));
  const wizardIds = useMemo(() => new Set(wizardDogs.map(dog => dog.id)), [wizardDogs]);
  const fresh = useMemo(
    () =>
      exhibitorId && !query.isError
        ? filterAccessibleDogs(mapDatabaseDogsArray(query.data ?? []))
        : [],
    [exhibitorId, query.data, query.isError]
  );
  // A dog the owner query has but the wizard's list lacks (added minutes ago by another official)
  // would be pickable yet unresolvable: Next stays disabled. Refetch the wizard's list once per
  // such set, and offer only dogs the wizard can resolve in the meantime.
  const missingKey = fresh
    .filter(dog => !wizardIds.has(dog.id))
    .map(dog => dog.id)
    .join(',');
  const refetchedFor = useRef('');
  useEffect(() => {
    if (!missingKey || refetchedFor.current === missingKey) return;
    refetchedFor.current = missingKey;
    void queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
  }, [missingKey, queryClient]);
  return useMemo(() => {
    if (!exhibitorId || query.isError) return { dogs: undefined, ownerName: null };
    const dogs = fresh.filter(dog => wizardIds.has(dog.id));
    const first = fresh[0];
    return { dogs, ownerName: first?.ownerName || first?.owner?.name || null };
  }, [exhibitorId, query.isError, fresh, wizardIds]);
}
