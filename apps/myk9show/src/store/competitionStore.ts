import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Competition } from '@/types/competition-types';
// import { mockCompetitions } from '@/data/mockCompetitions'; // Disabled - no mock data
import { getOptimalStorage } from '@/services/database/storage-adapter';

interface CompetitionState {
  competitions: Competition[];
  addCompetition: (comp: Competition) => void;
  editCompetition: (id: string, comp: Competition) => void;
  deleteCompetition: (id: string) => void;
}

export const useCompetitionStore = create<CompetitionState>()(
  persist(
    (set) => ({
      competitions: [], // No mock data - starting clean
      addCompetition: (comp) => set((state) => ({ 
        competitions: [...state.competitions, comp] 
      })),
      editCompetition: (id, comp) => set((state) => ({
        competitions: state.competitions.map((c) => (c.id === id ? comp : c)),
      })),
      deleteCompetition: (id) => set((state) => ({
        competitions: state.competitions.filter((c) => c.id !== id),
      })),
    }),
    {
      name: 'myk9show-competitions-storage',
      storage: createJSONStorage(() => getOptimalStorage('competitions')),
      partialize: (state) => ({
        competitions: state.competitions,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for competitions
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.competitions && Array.isArray(state.competitions)) {
              // Ensure all competitions have proper relationships
              state.competitions = state.competitions.map((competition: unknown) => {
                const c = competition as Record<string, unknown>;
                return {
                  ...c,
                  // Add any data transformations needed for relationships
                };
              });
            }
          }
        }
        return persistedState;
      },
    }
  )
);
