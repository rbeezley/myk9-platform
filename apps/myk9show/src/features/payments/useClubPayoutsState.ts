import { deriveClubPayoutsState } from './clubPayoutsState';
import { useClubIsDemo } from './useClubIsDemo';
import { useClubStripeAccount } from './useClubStripeAccount';

/** The club's payouts state, from the same account read the Payments tab uses. */
export function useClubPayoutsState(clubId: string | undefined) {
  const accountQuery = useClubStripeAccount(clubId);
  const demoQuery = useClubIsDemo(clubId);
  const state = clubId
    ? deriveClubPayoutsState({
        // The read returns null for "no account", so undefined means pending or failed.
        accountResolved: accountQuery.data !== undefined,
        account: accountQuery.data,
        isDemo: demoQuery.data,
      })
    : 'unknown';
  return {
    state,
    // A club whose payouts are on needs no demo answer, so that read never holds Publish up.
    isLoading:
      accountQuery.isLoading ||
      (demoQuery.isLoading && accountQuery.data?.payouts_enabled !== true),
    /** The account read failed (not the demo flag: that one only leaves the state unknown). */
    isAccountError: accountQuery.isError,
    refetch: () => void accountQuery.refetch(),
  };
}
