// Compatibility layer for Show Store - provides showStore-like API using React Query
import { useMemo } from 'react';
import type { Show, ShowInput } from '@/types/show-types';
import type { CascadingDeletePreview } from '@/utils/cascadingDelete';
import {
  useShowsQuery,
  useShowQuery,
  useShowsSearchQuery,
  useShowsByClubQuery,
  useShowsByStatusQuery,
  useUpcomingShowsQuery,
  useShowsByDateRangeQuery,
  useShowStatisticsQuery,
  useShowsWithEntryCountsQuery,
  useShowManagement,
} from '@/hooks/queries/useShowsDatabase';

/**
 * Main compatibility hook that provides the same API as useShowStore
 * but powered by React Query + Supabase instead of Zustand + localStorage
 */
export const useShowStoreCompat = () => {
  const showsQuery = useShowsQuery();
  const { createShow, updateShow, deleteShow, isCreating, isUpdating, isDeleting } = useShowManagement();

  // Memoize the store-like API to prevent unnecessary re-renders
  const storeAPI = useMemo(() => ({
    // Data state (from React Query)
    shows: showsQuery.data || [],
    selectedShowId: '', // This could be managed with additional state if needed
    isLoading: showsQuery.isLoading || isCreating || isUpdating || isDeleting,
    error: showsQuery.error?.message || null,

    // Local-First Actions (now powered by React Query + Supabase)
    addShow: async (showData: ShowInput): Promise<Show> => {
      const newShow = await createShow(showData);
      return newShow;
    },

    updateShow: async (id: string, updates: Partial<ShowInput>): Promise<Show | null> => {
      const updatedShow = await updateShow({ id, updates });
      return updatedShow;
    },

    deleteShow: async (id: string): Promise<void> => {
      await deleteShow({ id });
    },

    deleteShowCascading: async (id: string): Promise<void> => {
      // For now, same as deleteShow - cascading logic would be handled by database triggers
      await deleteShow({ id });
    },

    getShowById: (id: string): Show | null => {
      const shows = showsQuery.data || [];
      return shows.find(s => s.id === id) || null;
    },

    getShowsByClub: (clubId: string): Show[] => {
      const shows = showsQuery.data || [];
      return shows.filter(s => s.clubId === clubId);
    },

    // Data Management
    setShows: () => {
      console.warn('setShows is not needed with React Query - data is managed automatically');
    },

    loadShows: async (): Promise<void> => {
      // React Query handles loading automatically, but we can trigger a refetch
      await showsQuery.refetch();
    },

    // Sync Status (always 'synced' since we're directly using the database)
    getSyncStatus: (): 'synced' | 'pending' | 'error' | 'conflict' => {
      return 'synced'; // All operations are immediate with database
    },

    // Legacy methods for compatibility - these just log warnings and call new methods
    addShowLegacy: (show: Show) => {
      console.warn('addShowLegacy is deprecated. Use addShow() instead.');
      // Convert Show to ShowInput and call new method
      const showInput: ShowInput = {
        name: show.name,
        type: show.type,
        startDate: show.startDate,
        endDate: show.endDate,
        location: show.location,
        status: show.status,
        events: show.events,
        source: show.source,
        entryOpenDate: show.entryOpenDate,
        entryCloseDate: show.entryCloseDate,
        preEntryFee: show.preEntryFee,
        dayOfShowFee: show.dayOfShowFee,
        clubId: show.clubId,
        clubName: show.clubName,
        clubAddress: show.clubAddress,
        clubEmail: show.clubEmail,
        chairman: show.chairman,
        secretary: show.secretary,
        chiefSteward: show.chiefSteward,
        assignedJudges: show.assignedJudges,
        trials: show.trials,
      };
      createShow(showInput).catch(console.error);
    },

    updateShowLegacy: (show: Show) => {
      console.warn('updateShowLegacy is deprecated. Use updateShow() instead.');
      const showInput: ShowInput = {
        name: show.name,
        type: show.type,
        startDate: show.startDate,
        endDate: show.endDate,
        location: show.location,
        status: show.status,
        events: show.events,
        source: show.source,
        entryOpenDate: show.entryOpenDate,
        entryCloseDate: show.entryCloseDate,
        preEntryFee: show.preEntryFee,
        dayOfShowFee: show.dayOfShowFee,
        clubId: show.clubId,
        clubName: show.clubName,
        clubAddress: show.clubAddress,
        clubEmail: show.clubEmail,
        chairman: show.chairman,
        secretary: show.secretary,
        chiefSteward: show.chiefSteward,
        assignedJudges: show.assignedJudges,
        trials: show.trials,
      };
      updateShow({ id: show.id, updates: showInput }).catch(console.error);
    },

    removeShow: (id: string) => {
      console.warn('removeShow is deprecated. Use deleteShow() instead.');
      deleteShow({ id }).catch(console.error);
    },

    removeShowCascading: (id: string) => {
      console.warn('removeShowCascading is deprecated. Use deleteShowCascading() instead.');
      deleteShow({ id }).catch(console.error);
    },

    previewCascadingDelete: (): CascadingDeletePreview | null => {
      console.warn('previewCascadingDelete is not yet implemented with database backend');
      return null;
    },

    // Selection (this could be enhanced with additional state management if needed)
    selectShow: () => {
      console.warn('selectShow is not implemented in compatibility layer. Consider managing selection state in components.');
    },
  }), [showsQuery, createShow, updateShow, deleteShow, isCreating, isUpdating, isDeleting]);

  return storeAPI;
};

/**
 * Hook for getting a specific show with React Query optimizations
 */
export const useShowWithQuery = (id: string) => {
  const showQuery = useShowQuery(id);
  
  return {
    show: showQuery.data || null,
    isLoading: showQuery.isLoading,
    error: showQuery.error?.message || null,
    refetch: showQuery.refetch,
  };
};

/**
 * Hook for searching shows with React Query
 */
export const useShowSearchWithQuery = (searchTerm: string) => {
  const searchQuery = useShowsSearchQuery(searchTerm);
  
  return {
    shows: searchQuery.data || [],
    isLoading: searchQuery.isLoading,
    error: searchQuery.error?.message || null,
    refetch: searchQuery.refetch,
  };
};

/**
 * Hook for getting shows by club with React Query optimizations
 */
export const useShowsByClubWithQuery = (clubId: string) => {
  const clubShowsQuery = useShowsByClubQuery(clubId);
  
  return {
    shows: clubShowsQuery.data || [],
    isLoading: clubShowsQuery.isLoading,
    error: clubShowsQuery.error?.message || null,
    refetch: clubShowsQuery.refetch,
  };
};

/**
 * Hook for getting shows by status with React Query optimizations
 */
export const useShowsByStatusWithQuery = (status: string) => {
  const statusShowsQuery = useShowsByStatusQuery(status);
  
  return {
    shows: statusShowsQuery.data || [],
    isLoading: statusShowsQuery.isLoading,
    error: statusShowsQuery.error?.message || null,
    refetch: statusShowsQuery.refetch,
  };
};

/**
 * Hook for getting upcoming shows with React Query optimizations
 */
export const useUpcomingShowsWithQuery = (limit?: number) => {
  const upcomingQuery = useUpcomingShowsQuery(limit);
  
  return {
    shows: upcomingQuery.data || [],
    isLoading: upcomingQuery.isLoading,
    error: upcomingQuery.error?.message || null,
    refetch: upcomingQuery.refetch,
  };
};

/**
 * Hook for getting shows by date range with React Query optimizations
 */
export const useShowsByDateRangeWithQuery = (startDate: string, endDate: string) => {
  const dateRangeQuery = useShowsByDateRangeQuery(startDate, endDate);
  
  return {
    shows: dateRangeQuery.data || [],
    isLoading: dateRangeQuery.isLoading,
    error: dateRangeQuery.error?.message || null,
    refetch: dateRangeQuery.refetch,
  };
};

/**
 * Hook for getting show statistics with React Query optimizations
 */
export const useShowStatisticsWithQuery = () => {
  const statsQuery = useShowStatisticsQuery();
  
  return {
    statistics: statsQuery.data || null,
    isLoading: statsQuery.isLoading,
    error: statsQuery.error?.message || null,
    refetch: statsQuery.refetch,
  };
};

/**
 * Hook for getting shows with entry counts
 */
export const useShowsWithEntryCountsCompat = () => {
  const entryCountsQuery = useShowsWithEntryCountsQuery();
  
  return {
    shows: entryCountsQuery.data || [],
    isLoading: entryCountsQuery.isLoading,
    error: entryCountsQuery.error?.message || null,
    refetch: entryCountsQuery.refetch,
  };
};