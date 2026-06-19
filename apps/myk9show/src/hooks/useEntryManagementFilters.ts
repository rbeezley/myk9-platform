import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  isPendingEntry,
  isAcceptedEntry,
  isWaitlistEntry,
  isIssueEntry,
} from '@/utils/entryPredicates';
import {
  ENTRY_WORK_MODE_PRESETS,
  type EntryAttentionFilter,
  type EntryManagementViewMode,
  type EntryWorkMode,
  isMoveUpStatus,
  isPulledStatus,
  normalizeEntryManagementSearchParams,
} from '@/components/entries/management/entryManagementFilters';

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

interface UseEntryManagementFiltersReturn {
  // Filter state
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  paymentFilter: string;
  setPaymentFilter: (payment: string) => void;
  selectedTab: string;
  setSelectedTab: (tab: EntryAttentionFilter) => void;
  attentionFilter: EntryAttentionFilter;
  setAttentionFilter: (filter: EntryAttentionFilter) => void;
  workMode: EntryWorkMode;
  setWorkMode: (mode: EntryWorkMode) => void;
  entryViewMode: EntryManagementViewMode;
  setEntryViewMode: (view: EntryManagementViewMode) => void;

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
  const [paymentFilter, setPaymentFilter] = useState('all');
  const normalized = useMemo(
    () => normalizeEntryManagementSearchParams(searchParams),
    [searchParams]
  );
  const attentionFilter = normalized.attention;
  const workMode = normalized.mode;
  const entryViewMode = normalized.view;
  const selectedTab = attentionFilter;
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  // Trial/class filters — read from URL search params
  const trialFilter = searchParams.get('trial');
  const classFilter = searchParams.get('class');

  useEffect(() => {
    if (normalized.params.toString() !== searchParams.toString()) {
      setSearchParams(normalized.params, { replace: true });
    }
  }, [normalized, searchParams, setSearchParams]);

  const setAttentionFilter = useCallback(
    (filter: EntryAttentionFilter) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (filter === 'all') next.delete('attention');
          else next.set('attention', filter);
          next.delete('entryTab');
          next.delete('tab');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setSelectedTab = setAttentionFilter;

  const setWorkMode = useCallback(
    (mode: EntryWorkMode) => {
      const preset = ENTRY_WORK_MODE_PRESETS[mode];
      setPaymentFilter(preset.payment);
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (mode === 'review') next.delete('mode');
          else next.set('mode', mode);
          if (preset.attention === 'all') next.delete('attention');
          else next.set('attention', preset.attention);
          if (preset.view === 'table') next.delete('view');
          else next.set('view', preset.view);
          next.delete('entryTab');
          next.delete('tab');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setEntryViewMode = useCallback(
    (view: EntryManagementViewMode) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (view === 'table') next.delete('view');
          else next.set('view', view);
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
    if (attentionFilter === 'pending') {
      filtered = filtered.filter(isPendingEntry);
    } else if (attentionFilter === 'accepted') {
      filtered = filtered.filter(isAcceptedEntry);
    } else if (attentionFilter === 'waitlist') {
      filtered = filtered.filter(isWaitlistEntry);
    } else if (attentionFilter === 'issues') {
      filtered = filtered.filter(isIssueEntry);
    } else if (attentionFilter === 'move-ups') {
      filtered = filtered.filter(e => isMoveUpStatus(e.entryStatus));
    } else if (attentionFilter === 'pulled') {
      filtered = filtered.filter(e => isPulledStatus(e.entryStatus));
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
  }, [entries, attentionFilter, searchTerm, paymentFilter]);

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

  return {
    searchTerm,
    setSearchTerm,
    paymentFilter,
    setPaymentFilter,
    selectedTab,
    setSelectedTab,
    attentionFilter,
    setAttentionFilter,
    workMode,
    setWorkMode,
    entryViewMode,
    setEntryViewMode,
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
    tabCounts,
  };
}
