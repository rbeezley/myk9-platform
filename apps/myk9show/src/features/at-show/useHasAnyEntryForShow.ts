/**
 * exhibitor-show-day-access: does the signed-in exhibitor have ANY entry in
 * this show, at any point in time — not just today.
 *
 * `useAccountTodayAutoFavorites`'s `hasAccountEntryForShow` is deliberately
 * scoped to TODAY (it drives ringside auto-favoriting for a live show), so an
 * exhibitor entered in a show running weeks from now correctly gets no
 * ringside access — that gating is right. But the at-show no-access gate then
 * has no signal to tell "an entered exhibitor visiting early" apart from "a
 * stranger with no relationship to this show," so it always spoke in
 * worker-passcode language. This hook supplies that missing signal from the
 * same account-level entry source already used by My Shows. Since MYK9-536
 * that source is NETWORK-FIRST (authoritative view, per-show replica as the
 * failure/timeout fallback), so this query sets `networkMode: 'always'`.
 */
import { useQuery } from '@tanstack/react-query';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getUserEntries } from '@/services/database/entries';
import type { PersonIdentityState } from '@/context/authContextTypes';

export interface HasAnyEntryForShow {
  hasAnyEntryForShow: boolean;
  isLoading: boolean;
  /**
   * The read failed and the replica could not answer either. `false` from this
   * hook then means "we could not find out", NOT "you are a stranger to this
   * show" — the gate must say so rather than showing the worker-passcode copy
   * to an entered exhibitor whose network dropped (MYK9-629 restructure 3).
   */
  isError: boolean;
  identityState: PersonIdentityState;
  hasUsablePersonId: boolean;
}

export function useHasAnyEntryForShow(showId: string | undefined): HasAnyEntryForShow {
  // The one resolver, shared with My Shows and My Payments, so the
  // `getUserEntries` cache is one key per account (MYK9-629 restructure 4).
  const personId = useEntriesPersonId();
  const {
    user,
    personIdentityState: authIdentityState,
    hasUsablePersonId: authHasUsablePersonId,
  } = useAuthContext();
  const identityState: PersonIdentityState =
    authIdentityState ?? (personId ? 'resolved' : 'unresolved');
  const hasUsablePersonId = authHasUsablePersonId ?? Boolean(personId);
  const hasAccountIdentity = Boolean(
    user?.id && user.is_anonymous !== true && personId && hasUsablePersonId
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['at-show', 'has-any-entry', personId, showId],
    queryFn: async () => {
      if (!personId) return { entered: false, confirmed: false };
      // Do NOT swallow this. `getUserEntries` returns `{ data: [], error }`
      // when the view failed AND the replica had nothing, and reading that as
      // an empty row set answered "no entry for this show" as if it were a
      // fact — the stranger copy, shown to an entered exhibitor.
      const { data, error, source } = await getUserEntries(personId);
      if (error) throw error;
      const entered = (data ?? []).some(row => (row as { show_id?: string }).show_id === showId);
      // A row FOUND in the replica is still good evidence — ringside access is
      // not money, and refusing an entered exhibitor for being offline is the
      // worse failure. A row NOT found in an unconfirmed replica proves
      // nothing: the per-show snapshot is incomplete by construction on this
      // account-level query, so "no row here" is an absence of knowledge, and
      // the gate must not spend it as "you are a stranger to this show"
      // (MYK9-629 round 1).
      return {
        entered,
        confirmed:
          entered || source === 'confirmed' || source === 'confirmed-move-up-link-unavailable',
      };
    },
    // One retry, not the global default of two: each attempt pays the full
    // `getUserEntries` view deadline, so the default turns a dead network into
    // a ~46s spinner at the ringside front door.
    retry: 1,
    // This query is scoped to the current person. Never carry a prior
    // exhibitor's positive entry result into a new account or signed-out view.
    placeholderData: () => undefined,
    enabled: hasAccountIdentity && !!showId,
    // `getUserEntries` carries its own offline fallback (the replicated
    // snapshot), but React Query's default `networkMode: 'online'` parks
    // this query at `fetchStatus: 'paused'` while offline and never calls
    // it, so the fallback is unreachable exactly when it matters. Same
    // reason as `useAtShowClassList` / `RingsideShowBoundary`.
    networkMode: 'always' as const,
  });

  return {
    hasAnyEntryForShow: hasAccountIdentity && (data?.entered ?? false),
    isLoading: hasAccountIdentity && isLoading,
    // Two ways to fail to find out: the read threw, or it answered "no" from
    // rows the server never confirmed. Both are "could not confirm", and the
    // gate renders the same copy for each.
    isError: hasAccountIdentity && (isError || (data ? !data.confirmed : false)),
    identityState,
    hasUsablePersonId,
  };
}
