import { useState, useMemo, useCallback } from 'react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

interface UseEntryManagementFiltersProps {
  entries: EntryManagementEntry[];
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

  // Tab counts
  tabCounts: {
    all: number;
    pending: number;
    accepted: number;
    waitlist: number;
    issues: number;
  };
}

/**
 * Custom hook for managing entry filtering and selection
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export function useEntryManagementFilters({
  entries,
}: UseEntryManagementFiltersProps): UseEntryManagementFiltersReturn {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [selectedTab, setSelectedTab] = useState('all');
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  // Calculate tab counts
  const tabCounts = useMemo(() => ({
    all: entries.length,
    pending: entries.filter(e => e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING).length,
    accepted: entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED).length,
    waitlist: entries.filter(e => e.entryStatus === EntryStatus.WAITLIST).length,
    issues: entries.filter(e =>
      e.entryStatus === EntryStatus.MISSING_INFO ||
      (e.entryStatus === EntryStatus.ACCEPTED && e.paymentStatus === PaymentStatus.PENDING)
    ).length,
  }), [entries]);

  // Derive filtered entries from current filter state
  const filteredEntries = useMemo(() => {
    let filtered = entries;

    // Apply tab filters
    if (selectedTab === 'pending') {
      filtered = filtered.filter(e =>
        e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING
      );
    } else if (selectedTab === 'accepted') {
      filtered = filtered.filter(e => e.entryStatus === EntryStatus.ACCEPTED);
    } else if (selectedTab === 'waitlist') {
      filtered = filtered.filter(e => e.entryStatus === EntryStatus.WAITLIST);
    } else if (selectedTab === 'issues') {
      filtered = filtered.filter(e =>
        e.entryStatus === EntryStatus.MISSING_INFO ||
        (e.entryStatus === EntryStatus.ACCEPTED && e.paymentStatus === PaymentStatus.PENDING)
      );
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
      filtered = filtered.filter(entry =>
        entry.dogName.toLowerCase().includes(search) ||
        entry.ownerName.toLowerCase().includes(search) ||
        entry.entryNumber.toLowerCase().includes(search) ||
        entry.armbandNumber?.toLowerCase().includes(search)
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

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedEntries(new Set(filteredEntries.map(e => e.id)));
    } else {
      setSelectedEntries(new Set());
    }
  }, [filteredEntries]);

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
