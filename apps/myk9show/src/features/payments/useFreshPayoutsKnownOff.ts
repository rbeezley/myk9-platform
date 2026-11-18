import { useEffect, useRef, useState } from 'react';
import { useQueryOnlineStatus } from '@/hooks/guestServerRead';
import { payoutsKnownOff } from './cardPausedCopy';
import { useClubStripePaymentReadiness, useStripeLivemode } from './useClubStripeAccount';

/**
 * MYK9-2166: true only when the club's payouts are known to be off AS OF THIS OPEN. The readiness
 * query is cached for minutes, so a surface that mounts would otherwise show a stale answer as
 * current (a notice after payouts came back, or silence after they went off). Each mount forces
 * one refetch per query key and trusts the answer only after that refetch settled successfully.
 * Until then, offline, or if the refetch fails, the answer is unknown and nothing is shown.
 */
export function useFreshPayoutsKnownOff(clubId: string | undefined): boolean {
  const query = useClubStripePaymentReadiness(clubId);
  const livemode = useStripeLivemode().data;
  const isOnline = useQueryOnlineStatus();
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const requestedKey = useRef<string | null>(null);
  // The readiness key folds the livemode in, so a change of it is a different query to recheck.
  const key = clubId ? `${clubId}:${String(livemode)}` : null;
  const refetch = query.refetch;

  useEffect(() => {
    if (!key || !isOnline || requestedKey.current === key) return;
    requestedKey.current = key;
    let active = true;
    void Promise.resolve(refetch())
      .then(result => {
        if (active && result && !result.isError) setFreshKey(key);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      // A strict-mode style remount re-runs the effect and must be allowed to request again.
      if (requestedKey.current === key) requestedKey.current = null;
    };
  }, [key, isOnline, refetch]);

  return freshKey !== null && freshKey === key && payoutsKnownOff(query, isOnline);
}
