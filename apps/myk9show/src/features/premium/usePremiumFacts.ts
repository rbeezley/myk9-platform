import { useState } from 'react';
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
  // Each visit to the tab asks again under a fresh key: the tab stays mounted, and a cached result
  // from an earlier visit (before a Venue-tab policy change, say) must not seed the editor.
  const [visit, setVisit] = useState(0);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    if (enabled) setVisit(count => count + 1);
  }
  return useQuery({
    queryKey: ['shows', showId, 'premium-facts', visit],
    queryFn: () => fetchPremiumFacts(showId as string),
    enabled: Boolean(showId) && enabled && online,
    // The app default keeps the previous key's data while a query re-keys within the same entity
    // scope, and the new visit's key still names this show: opt out (MYK9-2307), or the editor
    // seeds from the last visit's facts as if they were fresh and ignores the real read.
    placeholderData: () => undefined,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
