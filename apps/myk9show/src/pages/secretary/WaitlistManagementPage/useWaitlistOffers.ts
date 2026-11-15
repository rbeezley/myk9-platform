/**
 * The Waitlist tab's Offered group (MYK9-1001): every open offer in the tab's
 * scope, read from the same replica rows as the queue and keyed by the same
 * class set, so it refreshes on the tab's one `reload` path. The same read carries the offers that
 * ran out and whose spot nobody has been offered since (MYK9-1988).
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
    queryFn: async (): Promise<{ open: WaitlistOffer[]; runOut: WaitlistOffer[] }> => {
      const results = await Promise.all(classIds.map(id => getWaitlistOffersByClass(id)));
      const failed = results.find(r => r.error);
      if (failed) {
        logger.error('Error loading waitlist offers:', 'secretary', {}, failed.error as Error);
        throw failed.error;
      }
      const byOfferMade = (a: WaitlistOffer, b: WaitlistOffer) =>
        (a.offered_at ?? '').localeCompare(b.offered_at ?? '');
      return {
        open: results.flatMap(r => r.data ?? []).sort(byOfferMade),
        runOut: results.flatMap(r => r.runOut ?? []).sort(byOfferMade),
      };
    },
    enabled: enabled && classIds.length > 0,
    ...readOptions,
  });

  const { offers, runOutOffers } = useMemo(() => {
    const search = searchTerm.toLowerCase();
    const matches = (offer: WaitlistOffer) =>
      !search ||
      [offer.dog?.call_name, offer.dog?.name].some(name => name?.toLowerCase().includes(search));
    return {
      offers: (offersQuery.data?.open ?? []).filter(matches),
      runOutOffers: (offersQuery.data?.runOut ?? []).filter(matches),
    };
  }, [offersQuery.data, searchTerm]);

  return {
    offers,
    runOutOffers,
    isPending: enabled && classIds.length > 0 && offersQuery.isPending,
    error: offersQuery.error,
  };
}
