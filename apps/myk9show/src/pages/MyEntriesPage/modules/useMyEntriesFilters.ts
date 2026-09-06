/**
 * Filters and stats hook for MyEntriesPage
 * Handles tab filtering, sorting, and computed statistics
 * @module MyEntriesPage/hooks
 */

import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { isPendingEntry, isWaitlistEntry } from '@/utils/entryPredicates';
import {
  summarizeEntryBalances,
  type EntryBalanceSummary,
} from '@/features/payments/entryBalanceSummary';
import { computeMyEntriesShowProgressStats, isCompletedEntry } from './myEntriesStats.helpers';
import {
  ENTRY_TAB_DEFS,
  TAB_PREDICATES,
  isEntryStatusFilter,
  isEntryTabFilter,
  legacyTabAsStatusFilter,
} from './entryTabDefs';
import {
  applyEntryScope,
  clearEntryScopeParams,
  parseEntryScope,
  type EntryScopeMatch,
} from './entryScopeFilter';
import { resolveWaitlistSurface, type WaitlistSurface } from './waitlistSurface';
import type { MyEntry, MyEntryStats, EntryStatusFilter, EntryTabFilter } from './my-entries-types';

/**
 * Exhibitor-facing "your dog is in" predicate: a confirmed entry, including one
 * that has since been scored (COMPLETED) or has a pending move-up request.
 * Kept local to My Entries on purpose — the shared `isAcceptedEntry` stays
 * strict (ACCEPTED only) so secretary Entry Management's Accepted/Pending
 * buckets are unchanged.
 */
function isExhibitorInEntry(e: { entryStatus: EntryStatus }): boolean {
  return (
    e.entryStatus === EntryStatus.ACCEPTED ||
    e.entryStatus === EntryStatus.COMPLETED ||
    e.entryStatus === EntryStatus.MOVE_UP_REQUESTED
  );
}

/**
 * Apply the entry-status axis. Kept as one function so the filtered list and
 * the tab counts can never drift apart — they are the same question asked
 * about different sets.
 */
function filterEntriesByStatus(entries: MyEntry[], status: EntryStatusFilter): MyEntry[] {
  switch (status) {
    case 'pending':
      return entries.filter(isPendingEntry);
    case 'accepted':
      return entries.filter(isExhibitorInEntry);
    case 'waitlist':
      return entries.filter(isWaitlistEntry);
    default:
      return [...entries];
  }
}

interface UseMyEntriesFiltersProps {
  entries: MyEntry[];
  /**
   * Amount-due summary computed from the RAW ungrouped rows (see
   * `useMyEntriesData`'s `balanceSummary`) — the same money math My Payments
   * uses. When omitted (e.g. existing unit tests that construct `MyEntry[]`
   * directly with no raw-row source), falls back to summarizing the grouped
   * `entries` passed in, which is accurate as long as every row in an order
   * shares one payment status.
   */
  balanceSummary?: EntryBalanceSummary;
  /**
   * Active rows in `waitlist_entries` for this exhibitor. A SECOND source of
   * waitlist truth that the `entries` table knows nothing about — see
   * `waitlistSurface` for why the chip counted only half of it (MYK9-417).
   */
  waitlistPositionCount?: number;
  /** The positions query is still in flight, so its count proves nothing yet. */
  waitlistPositionsLoading?: boolean;
}

interface UseMyEntriesFiltersReturn {
  filteredEntries: MyEntry[];
  selectedTab: EntryTabFilter;
  setSelectedTab: (tab: EntryTabFilter) => void;
  /** Entry-status filter, composed with the tab rather than replacing it. */
  selectedStatus: EntryStatusFilter;
  setSelectedStatus: (status: EntryStatusFilter) => void;
  entryStats: MyEntryStats;
  tabCounts: Record<EntryTabFilter, number>;
  /** Per-status counts WITHIN the active tab — a chip promises what it shows. */
  statusCounts: Record<EntryStatusFilter, number>;
  /**
   * How the inbound `?showId=/?entryIds=` scope resolved. `kind: 'none'` is the
   * ordinary unscoped visit; anything else means the list below is narrower
   * than the exhibitor's full set and the page owes them a banner saying so.
   */
  scopeMatch: EntryScopeMatch;
  /** Drop the scope params, returning the page to the exhibitor's full list. */
  clearScope: () => void;
  /**
   * The single answer to "what does this page say about wait lists" — the chip
   * count above, whether the positions section renders, and whether an empty
   * list may claim there is nothing waitlisted. Derived here rather than in the
   * page so those three can never be computed from different inputs.
   */
  waitlistSurface: WaitlistSurface;
}

/**
 * Hook for filtering and computing statistics on entries
 */
export function useMyEntriesFilters({
  entries,
  balanceSummary: externalBalanceSummary,
  waitlistPositionCount = 0,
  waitlistPositionsLoading = false,
}: UseMyEntriesFiltersProps): UseMyEntriesFiltersReturn {
  // The active tab lives in the URL, not in local state.
  //
  // It used to be a plain `useState`, and nothing on the page read `?tab` — so
  // `/exhibitor/entries?tab=completed`, which the "Past shows" stat card
  // navigates to, was a no-op that pushed a URL nobody consumed. The card
  // rendered a chevron and an aria-label promising navigation and delivered
  // nothing. `EntriesEmptyState` already speaks the same `?tab=` dialect, so
  // the convention existed; only the reader was missing.
  //
  // Deriving straight from the URL rather than syncing two sources also makes
  // the tab survive refresh, back/forward, and a shared link, and avoids a
  // two-way effect sync (the `set-state-in-effect` trap).
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  // `?tab=pending|accepted|waitlist` addressed real tabs before Phase A. Those
  // links are still in the wild, so they migrate to the status filter instead
  // of falling back to 'all' and silently dropping what the link asked for.
  const legacyStatusTab = legacyTabAsStatusFilter(tabParam);
  const selectedTab: EntryTabFilter =
    !legacyStatusTab && isEntryTabFilter(tabParam) ? tabParam : 'all';

  const statusParam = searchParams.get('status');
  const selectedStatus: EntryStatusFilter =
    legacyStatusTab ?? (isEntryStatusFilter(statusParam) ? statusParam : 'any');

  // Inbound scope from My Payments' per-row Receipt link (`?showId=&entryIds=`).
  // Applied BEFORE the tab filter and the tab counts so the tab strip describes
  // the list it actually controls — a tab reading "Completed 4" above a
  // one-entry scoped list would be the same lie in a new place.
  //
  // `entryStats` deliberately does NOT narrow: the stat row is a page-level
  // summary of everything the exhibitor owes and has entered, and scoping it
  // would make "Amount due" disagree with My Payments for as long as the scope
  // is on — the exact contradiction #1697 closed.
  const scopeMatch = useMemo(
    () => applyEntryScope(entries, parseEntryScope(searchParams)),
    [entries, searchParams]
  );
  const scopedEntries = scopeMatch.entries;

  // React Router's functional `setSearchParams` is NOT an atomic
  // read-modify-write, despite looking exactly like setState's functional form.
  // It calls the updater with the params memoized from the LAST RENDER
  // (react-router 7.18.2, `useSearchParams`: `nextInit(new
  // URLSearchParams(searchParams))`, where `searchParams` is a useMemo on
  // `location.search`). Two updates in the same tick therefore BOTH start from
  // the same stale value, and the second silently discards the first.
  //
  // This page has two filter axes side by side, so that is a real gesture: an
  // exhibitor clicking a status chip and a time chip in quick succession lost
  // the first one, and the URL came back with only the second param. Verified
  // in a real browser, and pinned by "keeps both filters when they are set in
  // the same tick".
  //
  // So updates compose within a tick, each write remembers the committed value
  // it was derived FROM. A second write in the same tick sees that its base is
  // still current and builds on the pending value; once a render commits,
  // `searchParams` changes, the stamp no longer matches, and the pending value
  // is correctly discarded — which is what keeps back/forward honest.
  //
  // Not `window.location.search`, which is invisible to the MemoryRouter these
  // hooks are tested under. The ref is only ever touched inside the callback,
  // never during render.
  const pendingParamsRef = useRef<{ from: string; params: URLSearchParams } | null>(null);

  const updateSearchParams = useCallback(
    (update: (previous: URLSearchParams) => URLSearchParams) => {
      const committed = searchParams.toString();
      const pending = pendingParamsRef.current;
      const base = pending && pending.from === committed ? pending.params : searchParams;
      const next = update(new URLSearchParams(base));
      pendingParamsRef.current = { from: committed, params: next };
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const clearScope = useCallback(() => {
    updateSearchParams(previous => clearEntryScopeParams(previous));
  }, [updateSearchParams]);

  // Each setter writes only its OWN param, so the axes compose: changing the
  // tab keeps the status filter and vice versa. Defaults ('all' / 'any') are
  // deleted rather than written, keeping the canonical URL clean.
  const setSelectedTab = useCallback(
    (tab: EntryTabFilter) => {
      updateSearchParams(previous => {
        const next = new URLSearchParams(previous);
        if (tab === 'all') next.delete('tab');
        else next.set('tab', tab);
        // A legacy `?tab=accepted` link arrives meaning a STATUS. Once the
        // user touches the time filter, persist that status explicitly or it
        // would vanish with the param it rode in on.
        if (legacyStatusTab) next.set('status', legacyStatusTab);
        return next;
      });
    },
    [updateSearchParams, legacyStatusTab]
  );

  const setSelectedStatus = useCallback(
    (status: EntryStatusFilter) => {
      updateSearchParams(previous => {
        const next = new URLSearchParams(previous);
        if (status === 'any') next.delete('status');
        else next.set('status', status);
        // Same migration concern in reverse: drop the legacy status-as-tab so
        // it cannot override the status the user just picked.
        if (legacyStatusTab) next.delete('tab');
        return next;
      });
    },
    [updateSearchParams, legacyStatusTab]
  );
  // Derive filtered and sorted entries from current tab and entries
  const filteredEntries = useMemo(() => {
    // Status first, then time. Order does not change the result — the two are
    // independent — but applying both is the point: before Phase A the strip
    // could express only one at a time.
    // One `now` for the whole derivation. Reading the clock separately per
    // memo let a long-lived session judge "completed" at different instants,
    // so an entry could sit in the list and outside the count that describes it.
    const now = new Date();
    const filtered = filterEntriesByStatus(scopedEntries, selectedStatus).filter(entry =>
      TAB_PREDICATES[selectedTab](entry, now)
    );

    // Sort by show date — still-ahead entries first (nearest date at top). Uses
    // the same rule as the tabs so ordering and tab membership never disagree:
    // a show running today sorts as upcoming, a scored entry sorts as done.
    filtered.sort((a, b) => {
      const aUpcoming = !isCompletedEntry(a, now);
      const bUpcoming = !isCompletedEntry(b, now);
      // Upcoming entries before completed ones
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      // Within upcoming: soonest first; within completed: most recent first
      return aUpcoming
        ? a.showDate.getTime() - b.showDate.getTime()
        : b.showDate.getTime() - a.showDate.getTime();
    });

    return filtered;
  }, [scopedEntries, selectedTab, selectedStatus]);

  const entryStats = useMemo<MyEntryStats>(() => {
    const now = new Date();
    const accepted = entries.filter(isExhibitorInEntry);
    const pending = entries.filter(isPendingEntry);
    // Same axis as the Upcoming tab, deliberately. The "Current Entries" stat
    // card deep-links to `?tab=upcoming` (#1696 made that link live), so a
    // count derived from a different rule would promise entries the tab then
    // refuses to show — the card reading 1 and the tab rendering empty.
    // Fees are NOT derived from this: `resolvedBalanceSummary` below runs its
    // own show-date math, because a scored entry at a show that has not
    // happened yet can still owe an entry fee.
    const currentEntries = entries.filter(entry => !isCompletedEntry(entry, now));
    const currentAcceptedEntries = currentEntries.filter(isExhibitorInEntry);
    const currentPendingEntries = currentEntries.filter(isPendingEntry);
    // Date-aware, distinct-show counts (see myEntriesStats.helpers). A multi-day
    // show running today counts as upcoming, not past, matching the Show Today banner.
    const showProgressStats = computeMyEntriesShowProgressStats(entries, now);
    const paidEntries = entries.filter(e => e.paymentStatus !== PaymentStatus.PENDING);
    const unpaidEntries = entries.filter(e => e.paymentStatus === PaymentStatus.PENDING);
    const acceptedPaid = accepted.filter(e => e.paymentStatus !== PaymentStatus.PENDING);
    const acceptedUnpaid = accepted.filter(e => e.paymentStatus === PaymentStatus.PENDING);
    const needsAction = entries.filter(
      e => e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING
    );

    const totalFees = entries.reduce((sum, entry) => sum + entry.totalFee, 0);
    const paidFees = paidEntries.reduce((sum, e) => sum + e.totalFee, 0);
    const unpaidFees = unpaidEntries.reduce((sum, e) => sum + e.totalFee, 0);
    // Prefer the caller-supplied summary (derived from raw, ungrouped rows —
    // matches My Payments exactly). Fall back to summarizing the grouped
    // `entries` themselves only when no raw-row summary was provided.
    const resolvedBalanceSummary = externalBalanceSummary ?? summarizeEntryBalances(entries, now);
    const currentFees = resolvedBalanceSummary.currentFeesCents / 100;
    const currentAmountDue = resolvedBalanceSummary.amountDueCents / 100;

    return {
      total: entries.length,
      accepted: accepted.length,
      pending: pending.length,
      upcoming: showProgressStats.upcomingEntries,
      completedShows: showProgressStats.completedShows,
      upcomingShows: showProgressStats.upcomingShows,
      currentAcceptedEntries: currentAcceptedEntries.length,
      currentPendingEntries: currentPendingEntries.length,
      acceptedPaid: acceptedPaid.length,
      acceptedUnpaid: acceptedUnpaid.length,
      needsAction: needsAction.length,
      currentFees,
      currentAmountDue,
      totalFees,
      paidFees,
      unpaidFees,
      acceptedPercent:
        entries.length > 0 ? Math.round((accepted.length / entries.length) * 100) : 0,
      paidPercent: totalFees > 0 ? Math.round((paidFees / totalFees) * 100) : 0,
      needsActionPercent:
        entries.length > 0 ? Math.round((needsAction.length / entries.length) * 100) : 0,
    };
  }, [entries, externalBalanceSummary]);

  // Counts for the tab strip. Derived from the SCOPED set, unlike entryStats
  // above: a tab label is a promise about what clicking it will show, and the
  // tabs filter the scoped list.
  // Tab counts describe the list AFTER the status filter, so the strip always
  // adds up to what the page is currently showing. `upcoming + completed` is
  // exactly `all` — the partition invariant Phase A exists to create.
  const tabCounts = useMemo<Record<EntryTabFilter, number>>(() => {
    const now = new Date();
    const statusFiltered = filterEntriesByStatus(scopedEntries, selectedStatus);
    // Every badge counts with the exact predicate its tab filters by, so a
    // count can no longer describe a list the panel would refuse to produce.
    return Object.fromEntries(
      ENTRY_TAB_DEFS.map(tab => [
        tab.id,
        statusFiltered.filter(entry => TAB_PREDICATES[tab.id](entry, now)).length,
      ])
    ) as Record<EntryTabFilter, number>;
  }, [scopedEntries, selectedStatus]);

  // ...and status counts describe the list within the ACTIVE tab, so a chip
  // never promises rows the current tab would hide. The two counts read each
  // other's axis on purpose: each answers "how many will I see if I click this".
  //
  // The `waitlist` chip is the one count that is NOT derived from `entries`
  // alone: `waitlist_entries` is a separate table with its own rows, and a
  // position there need not have a waitlisted entry (often has no entry at
  // all). Both halves go through `resolveWaitlistSurface`, which also decides
  // whether the positions section renders — one rule, three readers.
  const waitlistSurface = useMemo<WaitlistSurface>(() => {
    const now = new Date();
    const inTab = scopedEntries.filter(entry => TAB_PREDICATES[selectedTab](entry, now));
    return resolveWaitlistSurface({
      waitlistEntryCount: inTab.filter(isWaitlistEntry).length,
      waitlistPositionCount,
      isLoadingPositions: waitlistPositionsLoading,
      selectedTab,
      selectedStatus,
      isScoped: scopeMatch.kind !== 'none' && scopeMatch.kind !== 'unmatched',
    });
  }, [
    scopedEntries,
    selectedTab,
    selectedStatus,
    scopeMatch,
    waitlistPositionCount,
    waitlistPositionsLoading,
  ]);

  const statusCounts = useMemo<Record<EntryStatusFilter, number>>(() => {
    const now = new Date();
    const inTab = scopedEntries.filter(entry => TAB_PREDICATES[selectedTab](entry, now));
    return {
      any: inTab.length,
      pending: inTab.filter(isPendingEntry).length,
      accepted: inTab.filter(isExhibitorInEntry).length,
      waitlist: waitlistSurface.chipCount,
    };
  }, [scopedEntries, selectedTab, waitlistSurface]);

  return {
    filteredEntries,
    selectedTab,
    setSelectedTab,
    selectedStatus,
    setSelectedStatus,
    entryStats,
    tabCounts,
    statusCounts,
    scopeMatch,
    clearScope,
    waitlistSurface,
  };
}
