import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { getEffectivePaymentStatus } from '@/utils/entryManagementUtils';
import { matchesOperationalAttentionFilter } from '@/features/entry-operations/attentionClassification';
import {
  ENTRY_WORK_MODE_PRESETS,
  type EntryAttentionFilter,
  type EntryPaymentFilter,
  type EntryManagementViewMode,
  type EntryWorkMode,
  isEntryPaymentFilter,
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
  /**
   * Class ids belonging to the currently-selected trial. Lets the trial filter
   * narrow the (show-wide) entries list in place. Memoize at the call site so
   * the filter memo stays stable between renders.
   */
  trialClassIds?: readonly string[];
}

// Phase D: scoring is no longer a view of this page — it is an explicit
// deep-link out to the dedicated scoresheet. Roster is an opt-in toggle
// (`?roster=1`), not a side effect of selecting a trial.
type ViewMode = 'registration' | 'roster';

interface UseEntryManagementFiltersReturn {
  // Filter state
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  paymentFilter: EntryPaymentFilter;
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
  /** Whether the explicit Roster toggle is on (only meaningful with a trial). */
  rosterView: boolean;
  setRosterView: (on: boolean) => void;

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

function getEntryClassId(entryClass: EntryManagementEntry['classes'][number]): string {
  return entryClass.classId ?? entryClass.id;
}

/**
 * Custom hook for managing entry filtering and selection
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export function useEntryManagementFilters({
  entries,
  tabCounts,
  showId,
  trialClassIds,
}: UseEntryManagementFiltersProps): UseEntryManagementFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearchTerm = searchParams.get('person') ?? searchParams.get('search') ?? '';
  const [searchTerm, setSearchTerm] = useState(urlSearchTerm);
  const normalized = useMemo(
    () => normalizeEntryManagementSearchParams(searchParams),
    [searchParams]
  );
  const attentionFilter = normalized.attention;
  const paymentFilter = normalized.payment;
  const workMode = normalized.mode;
  const entryViewMode = normalized.view;
  const selectedTab = attentionFilter;
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  // Trial/class filters — read from URL search params
  const trialFilter = searchParams.get('trial');
  const classFilter = searchParams.get('class');
  // Explicit Roster toggle (Phase D) — only meaningful when a trial is selected.
  const rosterView = searchParams.get('roster') === '1';

  useEffect(() => {
    if (normalized.params.toString() !== searchParams.toString()) {
      setSearchParams(normalized.params, { replace: true });
    }
  }, [normalized, searchParams, setSearchParams]);

  useEffect(() => {
    setSearchTerm(urlSearchTerm);
  }, [urlSearchTerm]);

  const setAttentionFilter = useCallback(
    (filter: EntryAttentionFilter) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (filter === 'all') next.delete('attention');
          else next.set('attention', filter);
          next.delete('entryTab');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setSelectedTab = setAttentionFilter;

  const setPaymentFilter = useCallback(
    (payment: string) => {
      const normalizedPayment: EntryPaymentFilter = isEntryPaymentFilter(payment) ? payment : 'all';
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (normalizedPayment === 'all') next.delete('payment');
          else next.set('payment', normalizedPayment);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setWorkMode = useCallback(
    (mode: EntryWorkMode) => {
      const preset = ENTRY_WORK_MODE_PRESETS[mode];
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (mode === 'review') next.delete('mode');
          else next.set('mode', mode);
          if (preset.attention === 'all') next.delete('attention');
          else next.set('attention', preset.attention);
          if (preset.view === 'table') next.delete('view');
          else next.set('view', preset.view);
          if (preset.payment === 'all') next.delete('payment');
          else next.set('payment', preset.payment);
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

  // Derived view mode — Roster only when the secretary explicitly toggles it on
  // for a selected trial; otherwise the registration list (now filtered in place
  // by trial/class). Scoring is no longer a view here — it deep-links out.
  const viewMode: ViewMode = useMemo(() => {
    return trialFilter && rosterView ? 'roster' : 'registration';
  }, [trialFilter, rosterView]);

  const setRosterView = useCallback(
    (on: boolean) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (on) next.set('roster', '1');
          else next.delete('roster');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setTrialFilter = useCallback(
    (id: string | null) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (id) {
            next.set('trial', id);
          } else {
            next.delete('trial');
            // Roster is meaningless without a trial — drop it too.
            next.delete('roster');
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
          next.delete('roster');
          return next;
        },
        { replace: true }
      );
    }
  }, [showId, setSearchParams]);

  // Derive filtered entries from current filter state
  const filteredEntries = useMemo(() => {
    let filtered = entries;

    // Trial/class scope — honest in-place filters now (Phase D): no silent mode
    // switch. A class filter matches an entry's class directly; a trial filter
    // needs the trial's class id set (passed from the page) to map entries →
    // trial. With no class id set available, the trial filter can't narrow, so
    // it leaves the list untouched rather than emptying it.
    if (classFilter) {
      filtered = filtered.filter(e => e.classes.some(c => getEntryClassId(c) === classFilter));
    } else if (trialFilter && trialClassIds && trialClassIds.length > 0) {
      const ids = new Set(trialClassIds);
      filtered = filtered.filter(e => e.classes.some(c => ids.has(getEntryClassId(c))));
    }

    // Apply tab filters
    if (attentionFilter !== 'all') {
      filtered = filtered.filter(entry =>
        matchesOperationalAttentionFilter(
          {
            entryStatus: entry.entryStatus,
            rawEntryStatus: entry.rawEntryStatus,
            paymentStatus: getEffectivePaymentStatus(entry),
          },
          attentionFilter
        )
      );
    }

    // Apply payment filter
    if (paymentFilter !== 'all') {
      filtered = filtered.filter(e => getEffectivePaymentStatus(e) === paymentFilter);
    }

    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        entry =>
          entry.dogName.toLowerCase().includes(search) ||
          entry.ownerName.toLowerCase().includes(search) ||
          entry.handlerName.toLowerCase().includes(search) ||
          entry.entryNumber.toLowerCase().includes(search) ||
          entry.armbandNumber?.toLowerCase().includes(search) ||
          entry.confirmationNumber?.toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [
    entries,
    attentionFilter,
    searchTerm,
    paymentFilter,
    classFilter,
    trialFilter,
    trialClassIds,
  ]);

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
    rosterView,
    setRosterView,
    selectedEntries,
    setSelectedEntries,
    handleSelectEntry,
    handleSelectAll,
    filteredEntries,
    tabCounts,
  };
}
