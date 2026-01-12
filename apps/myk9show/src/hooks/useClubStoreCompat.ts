// Compatibility layer for Club Store using React Query
// Provides clubStore-like API while using database operations
import { useMemo } from 'react';
import type { Club, ClubInput } from '@/types/club-types';
import { logger } from '@/services/LoggingService';
import {
  useClubsQuery,
  useClubQuery,
  useClubManagement,
  useClubsSearchQuery,
  useActiveClubsQuery,
  useClubStatisticsQuery
} from './queries/useClubsDatabase';
import { mapClubToClubInput } from '@/services/mappers/clubMappers';

export interface ClubStoreCompatState {
  clubs: Club[];
  selectedClubId: string;
  isLoading: boolean;
  error: Error | null;
  
  // Club operations
  setClubs: (clubs: Club[]) => void;
  selectClub: (id: string) => void;
  updateClub: (updatedClub: Club) => void;
  addClub: (newClub: Club) => void;
  addClubOptimistic: (clubInput: ClubInput) => Promise<string>;
  updateClubOptimistic: (clubId: string, updates: Partial<Club>) => Promise<void>;
  removeClub: (clubId: string) => void;
  removeClubOptimistic: (clubId: string) => Promise<void>;
  
  // Search and filtering
  searchClubs: (term: string) => Club[];
  getActiveClubs: () => Club[];
  getClubById: (id: string) => Club | undefined;
  
  // Statistics
  getClubStatistics: () => { total: number } | undefined;
  
  // Sync status (compatibility methods)
  getSyncStatus: (clubId: string) => 'synced' | 'pending' | 'error' | 'conflict';
  hasPendingChanges: () => boolean;
}

/**
 * Hook that provides clubStore-compatible API using React Query
 * Maintains backward compatibility while using database operations
 */
export const useClubStoreCompat = (selectedClubId: string = ''): ClubStoreCompatState => {
  // Core data queries
  const { data: clubs = [], isLoading, error } = useClubsQuery();
  const { data: activeClubs = [] } = useActiveClubsQuery();
  const { data: statistics } = useClubStatisticsQuery();
  
  // Management operations
  const { createClub, updateClub, deleteClub } = useClubManagement();

  // Memoized operations to prevent unnecessary re-renders
  const operations = useMemo(() => ({
    // Basic operations (these are now no-ops since React Query manages state)
    setClubs: () => {
      // No-op: React Query manages state automatically
    },
    
    selectClub: () => {
      // No-op: selection is handled by component state, not store
    },
    
    updateClub: () => {
      // No-op: React Query handles optimistic updates
    },
    
    addClub: () => {
      // No-op: React Query handles optimistic updates
    },

    // Database operations
    addClubOptimistic: async (clubInput: ClubInput): Promise<string> => {
      const newClub = await createClub(clubInput);
      return newClub.id;
    },

    updateClubOptimistic: async (clubId: string, updates: Partial<Club>): Promise<void> => {
      // Convert Club updates to ClubInput format for database
      const clubInputUpdates: Partial<ClubInput> = {};
      
      if (updates.name !== undefined) clubInputUpdates.name = updates.name;
      if (updates.clubNumber !== undefined) clubInputUpdates.clubNumber = updates.clubNumber;
      if (updates.email !== undefined) clubInputUpdates.email = updates.email;
      if (updates.phone !== undefined) clubInputUpdates.phone = updates.phone;
      if (updates.website !== undefined) clubInputUpdates.website = updates.website;
      if (updates.description !== undefined) clubInputUpdates.description = updates.description;
      if (updates.logo !== undefined) clubInputUpdates.logo = updates.logo;
      if (updates.founded !== undefined) clubInputUpdates.founded = updates.founded;
      if (updates.clubType !== undefined) clubInputUpdates.clubType = updates.clubType;
      if (updates.memberIds !== undefined) clubInputUpdates.memberIds = updates.memberIds;
      
      // Handle address updates
      if (updates.address) {
        clubInputUpdates.street = updates.address.street;
        clubInputUpdates.city = updates.address.city;
        clubInputUpdates.state = updates.address.state;
        clubInputUpdates.zipCode = updates.address.zipCode;
        clubInputUpdates.country = updates.address.country;
      }

      await updateClub({ id: clubId, updates: clubInputUpdates });
    },

    removeClub: () => {
      // No-op: React Query handles optimistic updates
    },

    removeClubOptimistic: async (clubId: string): Promise<void> => {
      await deleteClub(clubId);
    },

    // Search and filtering operations
    searchClubs: (term: string): Club[] => {
      if (!term.trim()) return clubs;
      const searchTerm = term.toLowerCase();
      return clubs.filter(club => 
        club.name.toLowerCase().includes(searchTerm) ||
        club.email.toLowerCase().includes(searchTerm) ||
        club.phone.includes(searchTerm) ||
        club.clubNumber.toLowerCase().includes(searchTerm) ||
        `${club.address.city} ${club.address.state}`.toLowerCase().includes(searchTerm)
      );
    },

    getActiveClubs: (): Club[] => {
      return activeClubs;
    },

    getClubById: (id: string): Club | undefined => {
      return clubs.find(club => club.id === id);
    },

    // Statistics
    getClubStatistics: () => {
      return statistics;
    },

    // Sync status (compatibility - always returns 'synced' since we're using database)
    getSyncStatus: (): 'synced' => {
      return 'synced';
    },

    hasPendingChanges: (): boolean => {
      return false; // No pending changes when using database directly
    }
  }), [clubs, activeClubs, statistics, createClub, updateClub, deleteClub]);

  return {
    clubs,
    selectedClubId,
    isLoading,
    error: error as Error | null,
    ...operations
  };
};

/**
 * Hook to get a specific club with React Query caching
 */
export const useClubDetails = (clubId: string) => {
  const { data: club, isLoading, error } = useClubQuery(clubId);
  
  const operations = useMemo(() => ({
    // Convert club to input format for editing
    getClubInput: (): ClubInput | undefined => {
      return club ? mapClubToClubInput(club) : undefined;
    }
  }), [club]);

  return {
    club,
    isLoading,
    error: error as Error | null,
    ...operations
  };
};

/**
 * Hook for club search with debouncing
 */
export const useClubSearch = (searchTerm: string) => {
  const { data: clubs = [], isLoading, error } = useClubsSearchQuery(searchTerm);

  return {
    clubs,
    isLoading,
    error: error as Error | null,
    hasResults: clubs.length > 0,
    resultCount: clubs.length
  };
};