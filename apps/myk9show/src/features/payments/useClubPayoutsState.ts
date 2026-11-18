import { deriveClubPayoutsState } from './clubPayoutsState';
import { useClubIsDemo } from './useClubIsDemo';
import { useClubStripeAccount } from './useClubStripeAccount';

/**
 * Only a read that is neither failed nor paused counts. React Query keeps the last good `data`
 * through a failed background refresh and while offline (paused), and that copy may be days
 * old: it must read as "can't check", never as the club's current state.
 */
function current<T>(query: {
  data: T | undefined;
  isError: boolean;
  fetchStatus?: string;
}): T | undefined {
  return query.isError || query.fetchStatus === 'paused' ? undefined : query.data;
}

/** The club's payouts state, from the same account read the Payments tab uses. */
export function useClubPayoutsState(clubId: string | undefined) {
  const accountQuery = useClubStripeAccount(clubId);
  const demoQuery = useClubIsDemo(clubId);
  const account = current(accountQuery);
  const state = clubId
    ? deriveClubPayoutsState({
        // The read returns null for "no account", so undefined means pending, failed or paused.
        accountResolved: account !== undefined,
        account,
        isDemo: current(demoQuery),
      })
    : 'unknown';
  return {
    state,
    // A club whose payouts are on needs no demo answer, so that read never holds Publish up.
    isLoading: accountQuery.isLoading || (demoQuery.isLoading && account?.payouts_enabled !== true),
    /** The account read failed (not the demo flag: that one only leaves the state unknown). */
    isAccountError: accountQuery.isError,
    refetch: () => void accountQuery.refetch(),
  };
}
