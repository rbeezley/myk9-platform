/**
 * The Waitlist tab's Offered group (MYK9-1001): every open offer in the tab's
 * scope, read from the same replica rows as the queue and keyed by the same
 * class set, so it refreshes on the tab's one `reload` path.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';
import { getWaitlistOffersByClass } from '@/services/database/waitlists';
import type { WaitlistOffer } from './types';

export function useWaitlistOffers(
  queryKeyPrefix: readonly unknown[],
  classIds: readonly string[],
  searchTerm: string,
  enabled: boolean,
  readOptions: Record<string, unknown>
) {
  const offersQuery = useQuery({
    queryKey: [...queryKeyPrefix, 'offers', classIds],
    queryFn: async (): Promise<WaitlistOffer[]> => {
      const results = await Promise.all(classIds.map(id => getWaitlistOffersByClass(id)));
      const failed = results.find(r => r.error);
      if (failed) {
        logger.error('Error loading waitlist offers:', 'secretary', {}, failed.error as Error);
        throw failed.error;
      }
      return results
        .flatMap(r => r.data ?? [])
        .sort((a, b) => (a.offered_at ?? '').localeCompare(b.offered_at ?? ''));
    },
    enabled: enabled && classIds.length > 0,
    ...readOptions,
  });

  const offers = useMemo(() => {
    const all = offersQuery.data ?? [];
    const search = searchTerm.toLowerCase();
    if (!search) return all;
    return all.filter(offer =>
      [offer.dog?.call_name, offer.dog?.name].some(name => name?.toLowerCase().includes(search))
    );
  }, [offersQuery.data, searchTerm]);

  return {
    offers,
    isPending: enabled && classIds.length > 0 && offersQuery.isPending,
    error: offersQuery.error,
  };
}
