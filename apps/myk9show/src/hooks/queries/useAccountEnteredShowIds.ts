import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getUserEntries } from '@/services/database/entries';
import { isActiveSubmittedEntryStatus } from '@/services/entryDisplay/entryDisplaySelectors';
import type { PersonIdentityState } from '@/context/authContextTypes';
import {
  deriveAccountEntryReadState,
  type AccountEntryReadState,
} from '@/features/account-entry-read/accountEntryReadState';

/**
 * exhibitor-count-integrity (Shows page "Entered as exhibitor" tab).
 *
 * BrowseShowsPage decides "entered" membership from the legacy per-show
 * `entryStore`, which is empty until the exhibitor has opened that specific
 * show, so on a fresh session the tab count reads 0 while My Shows correctly
 * shows every entry. This hook supplies the authoritative set of entered
 * show ids from the SAME account-level source My Shows uses.
 *
 * That source is network-first since MYK9-536 — the authoritative view, with the
 * per-show replica as the failure/timeout fallback — which is why this query
 * sets `networkMode: 'always'`
 * (`getUserEntries`, the `account-entry-sync` capability), so the tab can be
 * corrected without swapping the shared `entryStore` that many other surfaces
 * depend on.
 *
 * Returns show ids plus the explicit identity/read state; the caller stamps
 * them with its own user id so the existing membership filters (which key on
 * `registrationData.handlerId`) match without re-resolving account identity.
 */
export interface AccountEnteredShowIds {
  all: string[];
  active: string[];
  isLoading: boolean;
  isError: boolean;
  identityState: PersonIdentityState;
  hasUsablePersonId: boolean;
  readState: AccountEntryReadState;
  refetch: () => Promise<unknown>;
}

const EMPTY_ACCOUNT_ENTERED_SHOW_IDS: AccountEnteredShowIds = {
  all: [],
  active: [],
  isLoading: false,
  isError: false,
  identityState: 'unresolved',
  hasUsablePersonId: false,
  readState: 'identity-unresolved',
  refetch: async () => undefined,
};

export function useAccountEnteredShowIds(): AccountEnteredShowIds {
  const {
    user,
    personId,
    personIdentityState: authIdentityState,
    hasUsablePersonId: authHasUsablePersonId,
  } = useAuthContext();
  const identityState = authIdentityState ?? (personId ? 'resolved' : 'unresolved');
  const hasUsablePersonId = authHasUsablePersonId ?? Boolean(personId);
  const {
    data,
    isLoading,
    isPending,
    isError,
    refetch = EMPTY_ACCOUNT_ENTERED_SHOW_IDS.refetch,
  } = useQuery({
    queryKey: ['browse-shows', 'account-entered-show-ids', personId],
    queryFn: async () => {
      if (!personId) return { all: [], active: [], source: 'replica-after-error' as const };
      const { data: rows, error, source } = await getUserEntries(personId);
      if (error) throw error;

      const all = new Set<string>();
      const active = new Set<string>();
      for (const row of rows ?? []) {
        const entry = row as {
          show_id?: string;
          entry_status?: string | null;
          check_in_status?: string | null;
          deleted_at?: string | null;
        };
        const showId = entry.show_id;
        if (!showId || entry.deleted_at) continue;
        all.add(showId);
        if (isActiveSubmittedEntryStatus(entry.entry_status, entry.check_in_status)) {
          active.add(showId);
        }
      }
      return { all: [...all], active: [...active], source };
    },
    enabled: !!personId,
    staleTime: 60_000,
    // One retry, not the global default of two: each attempt pays the full
    // `getUserEntries` view deadline, so the default turns a dead network into
    // a ~46s spinner before the replica fallback is ever shown.
    retry: 1,
    // `getUserEntries` carries its own offline fallback (the replicated
    // snapshot), but React Query's default `networkMode: 'online'` parks
    // this query at `fetchStatus: 'paused'` while offline and never calls
    // it, so the fallback is unreachable exactly when it matters. Same
    // reason as `useAtShowClassList` / `RingsideShowBoundary`.
    networkMode: 'always' as const,
  });

  const readState = deriveAccountEntryReadState({
    hasUser: Boolean(user?.id),
    personId: personId ?? null,
    personIdentityState: identityState,
    isPending: isPending ?? isLoading,
    isError,
    source: data?.source,
  });

  return {
    all: data?.all ?? EMPTY_ACCOUNT_ENTERED_SHOW_IDS.all,
    active: data?.active ?? EMPTY_ACCOUNT_ENTERED_SHOW_IDS.active,
    // A disabled query for an anonymous visitor must not keep Browse Shows in
    // a loading state. Authenticated exhibitors wait for this authoritative
    // account-level read instead of seeing a false zero-entry state.
    isLoading: !!personId && isLoading,
    isError: !!personId && isError,
    identityState,
    hasUsablePersonId,
    readState,
    refetch,
  };
}
