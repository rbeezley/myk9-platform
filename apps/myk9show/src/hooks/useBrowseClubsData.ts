import { useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useDirectoryViewer } from '@/hooks/useDirectoryViewer';
import { useClubStore } from '@/store/clubStore';
import { getPublicDirectoryClubs } from '@/services/database/clubs';
import { useShowStore } from '@/store/showStore';
import { CLUB_TYPES, type Club } from '@/types/club-types';
import { filterVisibleBrowseClubs } from './browseClubsVisibility';

export interface ClubFilters {
  search: string;
  clubType: string;
}

const INITIAL_FILTERS: ClubFilters = {
  search: '',
  clubType: 'all',
};

// WARNING: a value missing from this list is ERASED, not ignored — the param is
// stripped and the filter falls back to its default. Adding a chip option
// without adding it here does not degrade the deep link, it DESTROYS it.
const ALLOWED_FILTER_VALUES = {
  clubType: CLUB_TYPES.map(type => type.value),
} as const;

export interface BrowseClubsData {
  clubs: Club[];
  filteredClubs: Club[];
  isLoading: boolean;
  hasError: boolean;
  /**
   * A signed-out visitor with no connection. The guest directory is
   * online-only (MYK9-747), so this is its own state, never an empty list.
   */
  isOffline: boolean;
  handleRetry: () => void;
  filters: ClubFilters;
  setFilters: React.Dispatch<React.SetStateAction<ClubFilters>>;
  hasActiveFilters: boolean;
  clearAllFilters: () => void;
  /** Map of clubId → upcoming show count */
  clubShowCounts: Map<string, number>;
}

const NO_CLUBS: Club[] = [];

/** Query key for the signed-out directory, per principal (sign-out changes it). */
export const PUBLIC_CLUB_DIRECTORY_QUERY_KEY = ['clubs', 'public-directory'] as const;

export function useBrowseClubsData(): BrowseClubsData {
  const { userWithRoles } = useAuthContext();
  const { isGuest, isSignedIn, authLoading, principalKey } = useDirectoryViewer();
  // Only a signed-in viewer reads the replica (see the INTENT below).
  const replicaClubs = useClubStore(state => (isSignedIn ? state.clubs : NO_CLUBS));
  const readiness = useClubStore(state => state.clubReadiness);
  const ensureClubsReady = useClubStore(state => state.ensureClubsReady);
  const shows = useShowStore(state => state.shows);

  // INTENT: the guest club directory is ONLINE-ONLY by owner decision
  // (MYK9-747). The clubs replica is shared across sign-in states on one
  // device, so a cached row can leak a revoked or never-authorized club to a
  // signed-out visitor. Guests therefore read clubs_select straight from the
  // server and never touch the replica, not even as an offline fallback. The
  // guest directory is not a show-day surface, so offline-first does not
  // apply; offline, it says so instead of listing clubs.
  const guestQuery = useQuery({
    queryKey: [...PUBLIC_CLUB_DIRECTORY_QUERY_KEY, principalKey],
    queryFn: getPublicDirectoryClubs,
    enabled: isGuest,
    staleTime: 60_000,
  });

  // Until auth resolves the viewer is unknown, so both sources stay empty.
  const clubs = isGuest ? (guestQuery.data ?? NO_CLUBS) : replicaClubs;
  const visibleClubs = useMemo(
    () => filterVisibleBrowseClubs(clubs, userWithRoles?.roles),
    [clubs, userWithRoles?.roles]
  );

  // Neither a pending, paused nor failed guest read may render as "no clubs".
  const guestHasData = guestQuery.data !== undefined;
  const isOffline = isGuest && !guestHasData && guestQuery.fetchStatus === 'paused';
  const isLoading = authLoading
    ? true
    : isGuest
      ? !guestHasData && !isOffline && !guestQuery.isError
      : readiness === 'loading' && replicaClubs.length === 0;
  const hasError = isGuest
    ? !guestHasData && guestQuery.isError
    : isSignedIn && readiness === 'unavailable' && replicaClubs.length === 0;
  const refetchGuest = guestQuery.refetch;
  const handleRetry = useCallback(() => {
    if (isGuest) {
      void refetchGuest();
      return;
    }
    void ensureClubsReady({ force: true });
  }, [isGuest, refetchGuest, ensureClubsReady]);

  // URL-backed so a refresh, back-navigation, or shared link keeps the same
  // result set (MYK9-221). Same [values, setValues] contract as useState.
  const [filters, setFilters] = useUrlFilters<ClubFilters>(INITIAL_FILTERS, {
    allowedValues: ALLOWED_FILTER_VALUES,
  });

  // Signed-in browse uses the narrow club-only readiness path over the
  // replica. Guests never reach it (see the INTENT above).
  useEffect(() => {
    if (isSignedIn) void ensureClubsReady();
  }, [ensureClubsReady, isSignedIn]);

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
    let result = visibleClubs;

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
  }, [visibleClubs, filters]);

  const hasActiveFilters = filters.search.trim() !== '' || filters.clubType !== 'all';

  const clearAllFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, [setFilters]);

  return {
    clubs: visibleClubs,
    filteredClubs,
    isLoading,
    hasError,
    isOffline,
    handleRetry,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    clubShowCounts,
  };
}
