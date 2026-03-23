import { useState, useEffect, useMemo, useCallback } from 'react';
import { useClubStore } from '@/store/clubStore';
import { useShowStore } from '@/store/showStore';
import type { Club } from '@/types/club-types';

export interface ClubFilters {
  search: string;
  clubType: string;
}

const INITIAL_FILTERS: ClubFilters = {
  search: '',
  clubType: 'all',
};

export interface BrowseClubsData {
  clubs: Club[];
  filteredClubs: Club[];
  isLoading: boolean;
  hasError: boolean;
  handleRetry: () => void;
  filters: ClubFilters;
  setFilters: React.Dispatch<React.SetStateAction<ClubFilters>>;
  hasActiveFilters: boolean;
  clearAllFilters: () => void;
  /** Map of clubId → upcoming show count */
  clubShowCounts: Map<string, number>;
}

export function useBrowseClubsData(): BrowseClubsData {
  const clubs = useClubStore(state => state.clubs);
  const isLoading = useClubStore(state => state.isLoading);
  const error = useClubStore(state => state.error);
  const loadClubs = useClubStore(state => state.loadClubs);
  const shows = useShowStore(state => state.shows);

  const hasError = !!error;
  const handleRetry = useCallback(() => {
    loadClubs();
  }, [loadClubs]);

  const [filters, setFilters] = useState<ClubFilters>(INITIAL_FILTERS);

  // Load clubs on mount if empty
  useEffect(() => {
    if (clubs.length === 0 && !isLoading) loadClubs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once on mount

  // Compute upcoming show counts per club
  const clubShowCounts = useMemo(() => {
    const now = new Date();
    const counts = new Map<string, number>();
    for (const show of shows) {
      if (new Date(show.endDate) >= now && show.clubId) {
        counts.set(show.clubId, (counts.get(show.clubId) || 0) + 1);
      }
    }
    return counts;
  }, [shows]);

  // Filter clubs by search text and club type
  const filteredClubs = useMemo(() => {
    let result = clubs;

    // Search filter: match name, city, or state
    if (filters.search.trim()) {
      const query = filters.search.toLowerCase().trim();
      result = result.filter(
        club =>
          club.name.toLowerCase().includes(query) ||
          club.address?.city?.toLowerCase().includes(query) ||
          club.address?.state?.toLowerCase().includes(query)
      );
    }

    // Club type filter
    if (filters.clubType && filters.clubType !== 'all') {
      result = result.filter(club => club.clubType === filters.clubType);
    }

    // Sort alphabetically by name
    return [...result].sort((a, b) => a.name.localeCompare(b.name));
  }, [clubs, filters]);

  const hasActiveFilters = filters.search.trim() !== '' || filters.clubType !== 'all';

  const clearAllFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, []);

  return {
    clubs,
    filteredClubs,
    isLoading,
    hasError,
    handleRetry,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    clubShowCounts,
  };
}
