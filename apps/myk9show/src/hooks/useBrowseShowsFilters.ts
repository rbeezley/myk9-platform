import { useState, useMemo, useCallback, useEffect } from 'react';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import type { Show } from '@/types/show-types';
import type { SyncableShowEntry } from '@/store/entryStore';
import { filterShowsForTab } from '@/utils/unified-shows-config';
import type { UserShowContext } from '@/types/unified-shows-types';
import { getEntryStatus, userHasEntriesForShow } from '@/utils/entryStatusUtils';

/**
 * Filter state interface for browse shows page
 */
export interface ShowFilters {
  search: string;
  discipline: string;
  entryStatus: string;
  dateRange: string;
  organization: string;
  club: string;
}

/**
 * Default filter values
 */
const DEFAULT_FILTERS: ShowFilters = {
  search: '',
  discipline: 'all',
  entryStatus: 'all',
  dateRange: 'upcoming',
  organization: 'all',
  club: 'all',
};

/**
 * Discipline to show type mapping
 */
const DISCIPLINE_MAP: Record<string, string> = {
  agility: 'Agility',
  scent_work: 'Scent Work',
  rally: 'Rally',
  obedience: 'Obedience',
};

/**
 * Closed vocabularies, so a hand-edited URL cannot put a filter into a state no
 * chip can represent. `?dateRange=garbage` is the dangerous one: it passes the
 * `!== 'all'` test in applyFilters but matches none of the branches, silently
 * skipping the date filter and leaking past shows onto the default view.
 * `club` and `organization` are data-derived and deliberately absent.
 */
const ALLOWED_FILTER_VALUES = {
  discipline: Object.keys(DISCIPLINE_MAP),
  entryStatus: ['open', 'closing_soon', 'closed', 'waitlist'],
  dateRange: ['all', 'upcoming', 'this_month', 'next_month'],
} as const;

/**
 * Normalize a trial-type / discipline string for comparison: lowercase and
 * strip everything but letters, so 'Scent Work', 'Scentwork', 'scent_work',
 * and 'AKC Scent Work' all reduce to comparable tokens.
 */
export function normalizeDisciplineToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Whether a show's event/trial-type string matches the selected discipline's
 * mapped show type, tolerant of casing, punctuation, and organization
 * prefixes (e.g. an event of 'AKC Scent Work' matches discipline 'Scent Work').
 */
export function disciplineMatchesEvent(showType: string, event: string): boolean {
  const normalizedShowType = normalizeDisciplineToken(showType);
  const normalizedEvent = normalizeDisciplineToken(event);
  if (!normalizedShowType || !normalizedEvent) return false;
  return normalizedEvent.includes(normalizedShowType);
}

function parseLocalShowDate(value: string | undefined): Date | null {
  if (!value) return null;

  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (
    ![year, month, day].every(Number.isFinite) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const parsedDate = new Date(year, month - 1, day);
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
}

interface UseBrowseShowsFiltersProps {
  shows: Show[];
  entries: SyncableShowEntry[];
  userContext: UserShowContext | null;
  selectedTab: string;
}

interface UseBrowseShowsFiltersReturn {
  filters: ShowFilters;
  setFilters: React.Dispatch<React.SetStateAction<ShowFilters>>;
  filteredShows: Show[];
  hasActiveFilters: boolean;
  clearAllFilters: () => void;
  activeFilterCount: number;
}

/**
 * Custom hook for managing browse shows filtering logic
 * Extracted from BrowseShowsPage.tsx as part of DEBT-002 refactoring
 */
export function useBrowseShowsFilters({
  shows,
  entries,
  userContext,
  selectedTab,
}: UseBrowseShowsFiltersProps): UseBrowseShowsFiltersReturn {
  // URL-backed so a refresh, back-navigation, or shared link keeps the same
  // result set (MYK9-221). Same [values, setValues] contract as useState.
  const [filters, setFilters] = useUrlFilters<ShowFilters>(DEFAULT_FILTERS, {
    allowedValues: ALLOWED_FILTER_VALUES,
  });
  const [filteredShows, setFilteredShows] = useState<Show[]>([]);

  // Check if filters are active (different from defaults)
  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.discipline !== 'all' ||
      filters.entryStatus !== 'all' ||
      (filters.dateRange !== 'all' && filters.dateRange !== 'upcoming') ||
      filters.organization !== 'all' ||
      filters.club !== 'all'
    );
  }, [filters]);

  // Count active filters for badge display
  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([key, value]) => {
      if (key === 'search') return value !== '';
      if (key === 'dateRange') return value !== 'upcoming' && value !== 'all';
      return value !== 'all';
    }).length;
  }, [filters]);

  // Clear all filters to defaults
  const clearAllFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, [setFilters]);

  // Apply filters to shows
  const applyFilters = useCallback(() => {
    // First apply tab-based filtering
    let filtered = filterShowsForTab(selectedTab, shows, entries, userContext);

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        show =>
          show.name.toLowerCase().includes(searchLower) ||
          show.location.toLowerCase().includes(searchLower) ||
          show.organization.toLowerCase().includes(searchLower)
      );
    }

    // Club filter
    if (filters.club !== 'all') {
      filtered = filtered.filter(show => show.clubId === filters.club);
    }

    // Discipline filter (map to show type)
    if (filters.discipline !== 'all') {
      const showType = DISCIPLINE_MAP[filters.discipline];
      if (showType) {
        filtered = filtered.filter(show =>
          show.events.some(event => disciplineMatchesEvent(showType, event))
        );
      }
    }

    // Entry status filter
    if (filters.entryStatus !== 'all') {
      filtered = filtered.filter(show => {
        const hasUserEntries = userHasEntriesForShow(show.id, entries);
        const status = getEntryStatus(show, hasUserEntries);
        switch (filters.entryStatus) {
          case 'open':
            return status.status === 'accepting';
          case 'closing_soon':
            return status.status === 'closing_soon';
          case 'closed':
            return status.status === 'closed';
          case 'waitlist':
            // Waitlist not yet implemented
            return false;
          default:
            return true;
        }
      });
    }

    // Date range filter — skip for role-scoped tabs that already define their own
    // time range ('past', 'managing', 'assignments').  Applying 'upcoming' on top
    // of 'managing' would silently drop ongoing/past-start shows from the admin view.
    const skipDateFilter =
      selectedTab === 'past' || selectedTab === 'managing' || selectedTab === 'assignments';
    if (!skipDateFilter && filters.dateRange !== 'all') {
      const now = new Date();
      // Compare against local midnight so shows starting today aren't hidden.
      // ISO date-only strings parse as UTC midnight, which falls before the
      // current moment in any negative-offset timezone.
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (filters.dateRange === 'upcoming') {
        filtered = filtered.filter(show => {
          const showDate = parseLocalShowDate(show.endDate || show.startDate);
          return showDate !== null && showDate >= startOfToday;
        });
      } else if (filters.dateRange === 'this_month') {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        filtered = filtered.filter(show => {
          const showDate = parseLocalShowDate(show.startDate);
          return showDate !== null && showDate >= startOfToday && showDate <= nextMonth;
        });
      } else if (filters.dateRange === 'next_month') {
        // Compare local date components to avoid UTC-vs-local boundary issues.
        const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        filtered = filtered.filter(show => {
          const showDate = parseLocalShowDate(show.startDate);
          return (
            showDate !== null &&
            showDate.getFullYear() === nextMonthDate.getFullYear() &&
            showDate.getMonth() === nextMonthDate.getMonth()
          );
        });
      }
    }

    // Sort by start date
    filtered.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    setFilteredShows(filtered);
  }, [shows, entries, userContext, selectedTab, filters]);

  // Apply filters when dependencies change
  useEffect(() => {
    queueMicrotask(() => {
      applyFilters();
    });
  }, [applyFilters]);

  return {
    filters,
    setFilters,
    filteredShows,
    hasActiveFilters,
    clearAllFilters,
    activeFilterCount,
  };
}
