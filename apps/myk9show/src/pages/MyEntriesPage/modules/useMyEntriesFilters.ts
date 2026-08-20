/**
 * Filters and stats hook for MyEntriesPage
 * Handles tab filtering, sorting, and computed statistics
 * @module MyEntriesPage/hooks
 */

import { useState, useMemo } from 'react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { isPendingEntry, isWaitlistEntry } from '@/utils/entryPredicates';
import {
  summarizeEntryBalances,
  type EntryBalanceSummary,
} from '@/features/payments/entryBalanceSummary';
import {
  computeMyEntriesShowDateStats,
  isCompletedEntry,
  isPastShowEntry,
} from './myEntriesStats.helpers';
import type { MyEntry, MyEntryStats, EntryTabFilter } from './my-entries-types';

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
}

interface UseMyEntriesFiltersReturn {
  filteredEntries: MyEntry[];
  selectedTab: EntryTabFilter;
  setSelectedTab: (tab: EntryTabFilter) => void;
  entryStats: MyEntryStats;
  tabCounts: Record<EntryTabFilter, number>;
}

/**
 * Hook for filtering and computing statistics on entries
 */
export function useMyEntriesFilters({
  entries,
  balanceSummary: externalBalanceSummary,
}: UseMyEntriesFiltersProps): UseMyEntriesFiltersReturn {
  const [selectedTab, setSelectedTab] = useState<EntryTabFilter>('all');
  // Derive filtered and sorted entries from current tab and entries
  const filteredEntries = useMemo(() => {
    let filtered = [...entries];

    switch (selectedTab) {
      case 'pending':
        filtered = filtered.filter(isPendingEntry);
        break;
      case 'accepted':
        filtered = filtered.filter(isExhibitorInEntry);
        break;
      case 'waitlist':
        filtered = filtered.filter(isWaitlistEntry);
        break;
      case 'upcoming': {
        const now = new Date();
        // Strict complement of Completed: everything still ahead of the
        // exhibitor, including entries that need payment or review.
        filtered = filtered.filter(entry => !isCompletedEntry(entry, now));
        break;
      }
      case 'completed': {
        const now = new Date();
        filtered = filtered.filter(entry => isCompletedEntry(entry, now));
        break;
      }
      default:
        // 'all' - no additional filtering
        break;
    }

    // Sort by show date — still-ahead entries first (nearest date at top). Uses
    // the same rule as the tabs so ordering and tab membership never disagree:
    // a show running today sorts as upcoming, a scored entry sorts as done.
    const now = new Date();
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
  }, [entries, selectedTab]);

  const { entryStats, tabCounts } = useMemo<{
    entryStats: MyEntryStats;
    tabCounts: Record<EntryTabFilter, number>;
  }>(() => {
    const now = new Date();
    const accepted = entries.filter(isExhibitorInEntry);
    const pending = entries.filter(isPendingEntry);
    const waitlist = entries.filter(isWaitlistEntry);
    // Date-only, for the summary cards and money math — a scored entry at a
    // show that has not happened yet can still owe an entry fee.
    const currentEntries = entries.filter(entry => !isPastShowEntry(entry, now));
    // Tab axis — see `isCompletedEntry`. Kept separate from `currentEntries`
    // on purpose so folding scored entries into Completed cannot move fees.
    const completedEntries = entries.filter(entry => isCompletedEntry(entry, now));
    const currentAcceptedEntries = currentEntries.filter(isExhibitorInEntry);
    const currentPendingEntries = currentEntries.filter(isPendingEntry);
    // Date-aware, distinct-show counts (see myEntriesStats.helpers). A multi-day
    // show running today counts as upcoming, not past, matching the Show Today banner.
    const showDateStats = computeMyEntriesShowDateStats(entries, now);
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
      entryStats: {
        total: entries.length,
        accepted: accepted.length,
        pending: pending.length,
        upcoming: showDateStats.upcomingEntries,
        pastShows: showDateStats.pastShows,
        upcomingShows: showDateStats.upcomingShows,
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
      },
      tabCounts: {
        all: entries.length,
        pending: pending.length,
        accepted: accepted.length,
        waitlist: waitlist.length,
        upcoming: entries.length - completedEntries.length,
        completed: completedEntries.length,
      },
    };
  }, [entries, externalBalanceSummary]);

  return {
    filteredEntries,
    selectedTab,
    setSelectedTab,
    entryStats,
    tabCounts,
  };
}
