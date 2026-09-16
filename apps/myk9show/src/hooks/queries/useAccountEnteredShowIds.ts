import { useAccountEntries, type AccountEntriesRead } from './useAccountEntries';
import { isActiveSubmittedEntryStatus } from '@/services/entryDisplay/entryDisplaySelectors';

/**
 * exhibitor-count-integrity (Shows page "Entered as exhibitor" tab).
 *
 * BrowseShowsPage decides "entered" membership from the legacy per-show
 * `entryStore`, which is empty until the exhibitor has opened that specific
 * show, so on a fresh session the tab count reads 0 while My Shows correctly
 * shows every entry. This hook supplies the authoritative set of entered
 * show ids from the SAME account-level source My Shows uses, through the
 * shared `useAccountEntries` read (MYK9-563 item 3), so the tab can be
 * corrected without swapping the shared `entryStore` that many other surfaces
 * depend on.
 *
 * Returns show ids only; the caller stamps them with its own user id so the
 * existing membership filters (which key on `registrationData.handlerId`)
 * match regardless of which user-identity notion the page uses.
 */
export interface AccountEnteredShowIds {
  all: string[];
  active: string[];
  isLoading: boolean;
  isError: boolean;
  /** Rows the authoritative view never confirmed — see `AccountEntriesRead`. */
  degraded: boolean;
}

const EMPTY_ACCOUNT_ENTERED_SHOW_IDS: AccountEnteredShowIds = {
  all: [],
  active: [],
  isLoading: false,
  isError: false,
  degraded: false,
};

/** Module-level so React Query does not re-run it on every render. */
function selectEnteredShowIds(read: AccountEntriesRead) {
  const all = new Set<string>();
  const active = new Set<string>();
  for (const row of read.rows) {
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
  return { all: [...all], active: [...active], degraded: read.degraded };
}

export function useAccountEnteredShowIds(
  personId: string | null | undefined
): AccountEnteredShowIds {
  const { data, isLoading, isError } = useAccountEntries(personId, selectEnteredShowIds);

  return {
    all: data?.all ?? EMPTY_ACCOUNT_ENTERED_SHOW_IDS.all,
    active: data?.active ?? EMPTY_ACCOUNT_ENTERED_SHOW_IDS.active,
    degraded: data?.degraded ?? false,
    // A disabled query for an anonymous visitor must not keep Browse Shows in
    // a loading state. Authenticated exhibitors wait for this authoritative
    // account-level read instead of seeing a false zero-entry state.
    isLoading: !!personId && isLoading,
    isError: !!personId && isError,
  };
}
