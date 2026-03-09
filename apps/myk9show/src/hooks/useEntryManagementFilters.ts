import { useState, useMemo, useCallback } from 'react';
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
}: UseEntryManagementFiltersProps): UseEntryManagementFiltersReturn {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [selectedTab, setSelectedTab] = useState('all');
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

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
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    paymentFilter,
    setPaymentFilter,
    selectedTab,
    setSelectedTab,
    selectedEntries,
    setSelectedEntries,
    handleSelectEntry,
    handleSelectAll,
    filteredEntries,
    clearFilters,
    tabCounts,
  };
}
