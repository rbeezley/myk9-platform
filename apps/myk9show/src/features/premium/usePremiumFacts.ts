import { useQuery } from '@tanstack/react-query';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { fetchPremiumFacts } from './fetchPremium';

/**
 * MYK9-2244: the show's current facts for the Edit show preview, fetched once per open while
 * online. Costs no narrative call and no generation allowance. Offline (or on failure) the
 * caller keeps its form-built draft.
 */
export function usePremiumFacts(showId: string | undefined, enabled: boolean) {
  const online = useIsOnline();
  return useQuery({
    queryKey: ['shows', showId, 'premium-facts'],
    queryFn: () => fetchPremiumFacts(showId as string),
    enabled: Boolean(showId) && enabled && online,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
