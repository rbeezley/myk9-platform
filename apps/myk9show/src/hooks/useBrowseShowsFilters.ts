import { useState, useMemo, useCallback, useEffect } from 'react';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import type { Show } from '@/types/show-types';
import type { SyncableShowEntry } from '@/store/entryStore';
import { filterShowsForTab } from '@/utils/unified-shows-config';
import type { UserShowContext } from '@/types/unified-shows-types';
import { getEntryStatus, userHasEntriesForShow } from '@/utils/entryStatusUtils';
import {
  ALL_MONTHS_KEY,
  isMonthKey,
  monthKeyOf,
} from '@/components/shows/browse/monthScrubber.helpers';
import { RADIUS_OPTIONS, showDistanceMiles, type LatLng } from '@/features/location/distance';

/**
 * Filter state interface for browse shows page
 */
export interface ShowFilters {
  search: string;
  discipline: string;
  entryStatus: string;
  /** `'all'` (upcoming shows) or a `YYYY-MM` month key from the scrubber. */
  month: string;
  organization: string;
  club: string;
  /** `'all'` or a miles radius from the visitor's location; inert without one. */
  radius: string;
}

/**
 * Default filter values
 */
const DEFAULT_FILTERS: ShowFilters = {
  search: '',
  discipline: 'all',
  entryStatus: 'all',
  month: ALL_MONTHS_KEY,
  organization: 'all',
  club: 'all',
  radius: 'all',
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
 * chip can represent. `month` is open-ended (any `YYYY-MM`), so it is shape-
 * checked with `isMonthKey` in the hook instead: a malformed value reads as
 * `'all'`, which keeps the upcoming rule rather than leaking past shows.
 * `club` and `organization` are data-derived and deliberately absent.
 *
 * WARNING: a value missing from a list here is ERASED, not ignored — the param
 * is stripped and the filter falls back to its default. Adding a chip option
 * without adding it here does not degrade the deep link, it DESTROYS it.
 */
const ALLOWED_FILTER_VALUES = {
  discipline: Object.keys(DISCIPLINE_MAP),
  entryStatus: ['open', 'closing_soon', 'closed', 'waitlist'],
  radius: RADIUS_OPTIONS,
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
  /** The visitor's chosen location; enables the radius filter and nearest-first sort. */
  origin?: LatLng | null;
}

interface UseBrowseShowsFiltersReturn {
  filters: ShowFilters;
  setFilters: React.Dispatch<React.SetStateAction<ShowFilters>>;
  filteredShows: Show[];
  /** `filteredShows` before the month filter — what the month scrubber counts. */
  monthScopedShows: Show[];
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
  origin = null,
}: UseBrowseShowsFiltersProps): UseBrowseShowsFiltersReturn {
  // URL-backed so a refresh, back-navigation, or shared link keeps the same
  // result set (MYK9-221). Same [values, setValues] contract as useState.
  const [rawFilters, setFilters] = useUrlFilters<ShowFilters>(DEFAULT_FILTERS, {
    allowedValues: ALLOWED_FILTER_VALUES,
  });
  // A `?month=` outside the `YYYY-MM` shape falls back to the upcoming rule.
  const filters = useMemo<ShowFilters>(
    () =>
      isMonthKey(rawFilters.month) || rawFilters.month === ALL_MONTHS_KEY
        ? rawFilters
        : { ...rawFilters, month: ALL_MONTHS_KEY },
    [rawFilters]
  );
  const [filteredShows, setFilteredShows] = useState<Show[]>([]);
  const [monthScopedShows, setMonthScopedShows] = useState<Show[]>([]);

  // Check if filters are active (different from defaults)
  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.discipline !== 'all' ||
      filters.entryStatus !== 'all' ||
      filters.month !== ALL_MONTHS_KEY ||
      filters.organization !== 'all' ||
      filters.club !== 'all' ||
      (filters.radius !== 'all' && origin !== null)
    );
  }, [filters, origin]);

  // Count active filters for badge display
  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([key, value]) => {
      if (key === 'search') return value !== '';
      if (key === 'month') return value !== ALL_MONTHS_KEY;
      if (key === 'radius') return value !== 'all' && origin !== null;
      return value !== 'all';
    }).length;
  }, [filters, origin]);

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

    // Month filter. A chosen month keeps every show starting in it, past or
    // future, on every tab — it replaced the Past Shows tab (MYK9-427). With no
    // month, the default is "upcoming", skipped for role-scoped tabs that
    // define their own time range ('managing', 'assignments'): applying it on
    // top of 'managing' would silently drop ongoing/past-start shows from the
    // admin view.
    // Radius: the only thing a known location ever HIDES, and only once the
    // visitor picked one. A show with no venue pin cannot be measured, so it
    // stays in — hiding it would read as "no show there", which is false.
    const radiusMiles = origin && filters.radius !== 'all' ? Number(filters.radius) : null;
    if (radiusMiles !== null) {
      filtered = filtered.filter(show => {
        const miles = showDistanceMiles(origin, show);
        return miles === null || miles <= radiusMiles;
      });
    }

    // Sort by start date before the month split so both lists share an order.
    filtered.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    setMonthScopedShows(filtered);

    if (filters.month !== ALL_MONTHS_KEY) {
      filtered = filtered.filter(show => monthKeyOf(show.startDate) === filters.month);
    } else if (selectedTab !== 'managing' && selectedTab !== 'assignments') {
      const now = new Date();
      // Compare against local midnight so shows starting today aren't hidden.
      // ISO date-only strings parse as UTC midnight, which falls before the
      // current moment in any negative-offset timezone.
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(show => {
        const showDate = parseLocalShowDate(show.endDate || show.startDate);
        return showDate !== null && showDate >= startOfToday;
      });
    }

    // Within one month the question is "which is closest?"; across All
    // upcoming it is still "which is soonest?", so date order stays there.
    // Unmeasurable shows sort last, in date order, never mixed in.
    if (origin && filters.month !== ALL_MONTHS_KEY) {
      const distanceOf = new Map(filtered.map(show => [show.id, showDistanceMiles(origin, show)]));
      filtered.sort((a, b) => {
        const da = distanceOf.get(a.id) ?? null;
        const db = distanceOf.get(b.id) ?? null;
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    }

    setFilteredShows(filtered);
  }, [shows, entries, userContext, selectedTab, filters, origin]);

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
    monthScopedShows,
    hasActiveFilters,
    clearAllFilters,
    activeFilterCount,
  };
}
