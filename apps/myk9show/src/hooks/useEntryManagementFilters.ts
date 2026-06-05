import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  isPendingEntry,
  isAcceptedEntry,
  isWaitlistEntry,
  isIssueEntry,
} from '@/utils/entryPredicates';

interface TabCounts {
  all: number;
  pending: number;
  accepted: number;
  waitlist: number;
  issues: number;
}

interface UseEntryManagementFiltersProps {
  entries: EntryManagementEntry[];
  tabCounts: TabCounts;
  showId?: string;
}

type ViewMode = 'registration' | 'roster' | 'scoring';
const ENTRY_TABS = [
  'all',
  'pending',
  'accepted',
  'waitlist',
  'move-ups',
  'scratches',
  'issues',
] as const;
type EntryTab = (typeof ENTRY_TABS)[number];

function isEntryTab(value: string | null): value is EntryTab {
  return ENTRY_TABS.includes(value as EntryTab);
}

interface UseEntryManagementFiltersReturn {
  // Filter state
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  paymentFilter: string;
  setPaymentFilter: (payment: string) => void;
  selectedTab: string;
  setSelectedTab: (tab: string) => void;

  // Trial/class filters
  trialFilter: string | null;
  setTrialFilter: (id: string | null) => void;
  classFilter: string | null;
  setClassFilter: (id: string | null) => void;
  viewMode: ViewMode;

  // Selection
  selectedEntries: Set<string>;
  setSelectedEntries: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleSelectEntry: (entryId: string, checked: boolean) => void;
  handleSelectAll: (checked: boolean) => void;

  // Filtered results
  filteredEntries: EntryManagementEntry[];

  // Actions
  clearFilters: () => void;

  // Tab counts (precomputed, passed through)
  tabCounts: TabCounts;
}

/**
 * Custom hook for managing entry filtering and selection
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export function useEntryManagementFilters({
  entries,
  tabCounts,
  showId,
}: UseEntryManagementFiltersProps): UseEntryManagementFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const routeEntryTab = searchParams.get('entryTab');
  const resolvedEntryTab = isEntryTab(routeEntryTab) ? routeEntryTab : 'all';
  const [selectedTab, setSelectedTabState] = useState<EntryTab>(resolvedEntryTab);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  // Trial/class filters — read from URL search params
  const trialFilter = searchParams.get('trial');
  const classFilter = searchParams.get('class');

  useEffect(() => {
    setSelectedTabState(resolvedEntryTab);
  }, [resolvedEntryTab]);

  const setSelectedTab = useCallback(
    (tab: string) => {
      const nextTab = isEntryTab(tab) ? tab : 'all';
      setSelectedTabState(nextTab);
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (nextTab === 'all') {
            next.delete('entryTab');
          } else {
            next.set('entryTab', nextTab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Derived view mode
  const viewMode: ViewMode = useMemo(() => {
    if (trialFilter && classFilter) return 'scoring';
    if (trialFilter) return 'roster';
    return 'registration';
  }, [trialFilter, classFilter]);

  const setTrialFilter = useCallback(
    (id: string | null) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (id) {
            next.set('trial', id);
          } else {
            next.delete('trial');
          }
          // Always clear class when trial changes
          next.delete('class');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setClassFilter = useCallback(
    (id: string | null) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (id) {
            next.set('class', id);
          } else {
            next.delete('class');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Reset trial/class filters when showId changes (but not on initial mount)
  const prevShowIdRef = useRef(showId);
  useEffect(() => {
    if (prevShowIdRef.current !== showId) {
      prevShowIdRef.current = showId;
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.delete('trial');
          next.delete('class');
          return next;
        },
        { replace: true }
      );
    }
  }, [showId, setSearchParams]);

  // Derive filtered entries from current filter state
  const filteredEntries = useMemo(() => {
    let filtered = entries;

    // Apply tab filters
    if (selectedTab === 'pending') {
      filtered = filtered.filter(isPendingEntry);
    } else if (selectedTab === 'accepted') {
      filtered = filtered.filter(isAcceptedEntry);
    } else if (selectedTab === 'waitlist') {
      filtered = filtered.filter(isWaitlistEntry);
    } else if (selectedTab === 'issues') {
      filtered = filtered.filter(isIssueEntry);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.entryStatus === statusFilter);
    }

    // Apply payment filter
    if (paymentFilter !== 'all') {
      filtered = filtered.filter(e => e.paymentStatus === paymentFilter);
    }

    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        entry =>
          entry.dogName.toLowerCase().includes(search) ||
          entry.ownerName.toLowerCase().includes(search) ||
          entry.entryNumber.toLowerCase().includes(search) ||
          entry.armbandNumber?.toLowerCase().includes(search) ||
          entry.confirmationNumber?.toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [entries, selectedTab, searchTerm, statusFilter, paymentFilter]);

  // Selection handlers
  const handleSelectEntry = useCallback((entryId: string, checked: boolean) => {
    setSelectedEntries(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(entryId);
      } else {
        newSet.delete(entryId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedEntries(new Set(filteredEntries.map(e => e.id)));
      } else {
        setSelectedEntries(new Set());
      }
    },
    [filteredEntries]
  );

  // Clear filters
  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setPaymentFilter('all');
    setSelectedTabState('all');
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('trial');
        next.delete('class');
        next.delete('entryTab');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  return {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    paymentFilter,
    setPaymentFilter,
    selectedTab,
    setSelectedTab,
    trialFilter,
    setTrialFilter,
    classFilter,
    setClassFilter,
    viewMode,
    selectedEntries,
    setSelectedEntries,
    handleSelectEntry,
    handleSelectAll,
    filteredEntries,
    clearFilters,
    tabCounts,
  };
}
