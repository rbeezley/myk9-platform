/**
 * Filters and stats hook for MyEntriesPage
 * Handles tab filtering, sorting, and computed statistics
 * @module MyEntriesPage/hooks
 */

import { useState, useMemo } from 'react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { isPendingEntry, isAcceptedEntry, isWaitlistEntry } from '@/utils/entryPredicates';
import { computeMyEntriesShowDateStats, isPastShowEntry } from './myEntriesStats.helpers';
import type { MyEntry, MyEntryStats, EntryTabFilter } from './my-entries-types';

interface UseMyEntriesFiltersProps {
  entries: MyEntry[];
}

interface UseMyEntriesFiltersReturn {
  filteredEntries: MyEntry[];
  selectedTab: EntryTabFilter;
  setSelectedTab: (tab: EntryTabFilter) => void;
  entryStats: MyEntryStats;
}

/**
 * Hook for filtering and computing statistics on entries
 */
export function useMyEntriesFilters({
  entries,
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
        filtered = filtered.filter(isAcceptedEntry);
        break;
      case 'waitlist':
        filtered = filtered.filter(isWaitlistEntry);
        break;
      case 'upcoming': {
        const now = new Date();
        // Date-range aware: all non-past entry rows belong here, including
        // entries that still need payment or review.
        filtered = filtered.filter(entry => !isPastShowEntry(entry, now));
        break;
      }
      case 'completed': {
        const now = new Date();
        filtered = filtered.filter(entry => isPastShowEntry(entry, now));
        break;
      }
      default:
        // 'all' - no additional filtering
        break;
    }

    // Sort by show date — upcoming first (nearest date at top). Use the same
    // date-range rule as the tabs so a show running today sorts as upcoming.
    const now = new Date();
    filtered.sort((a, b) => {
      const aUpcoming = !isPastShowEntry(a, now);
      const bUpcoming = !isPastShowEntry(b, now);
      // Upcoming entries before past entries
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      // Within upcoming: soonest first; within past: most recent first
      return aUpcoming
        ? a.showDate.getTime() - b.showDate.getTime()
        : b.showDate.getTime() - a.showDate.getTime();
    });

    return filtered;
  }, [entries, selectedTab]);

  /**
   * Computed statistics for entries
   */
  const entryStats = useMemo<MyEntryStats>(() => {
    const now = new Date();
    const accepted = entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED);
    const pending = entries.filter(e => e.entryStatus === EntryStatus.PENDING);
    const currentEntries = entries.filter(entry => !isPastShowEntry(entry, now));
    const currentAcceptedEntries = currentEntries.filter(isAcceptedEntry);
    const currentPendingEntries = currentEntries.filter(isPendingEntry);
    const currentSummaryEntries = [...currentAcceptedEntries, ...currentPendingEntries];
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
    const currentFees = currentSummaryEntries.reduce((sum, entry) => sum + entry.totalFee, 0);
    const currentAmountDue = currentSummaryEntries
      .filter(entry => entry.paymentStatus === PaymentStatus.PENDING)
      .reduce((sum, entry) => sum + entry.totalFee, 0);

    return {
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
    };
  }, [entries]);

  return {
    filteredEntries,
    selectedTab,
    setSelectedTab,
    entryStats,
  };
}
