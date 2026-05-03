import { useState, useMemo, useCallback, useEffect } from 'react';
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
  const [filters, setFilters] = useState<ShowFilters>(DEFAULT_FILTERS);
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
  }, []);

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
        filtered = filtered.filter(show => show.organization.includes(showType));
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
      if (filters.dateRange === 'upcoming') {
        filtered = filtered.filter(show => {
          const showDate = new Date(show.startDate);
          return showDate >= now;
        });
      } else if (filters.dateRange === 'this_month') {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        filtered = filtered.filter(show => {
          const showDate = new Date(show.startDate);
          return showDate >= now && showDate <= nextMonth;
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
