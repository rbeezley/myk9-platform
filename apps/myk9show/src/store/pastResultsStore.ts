import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PastResult } from '@/types/results-types';
// import { mockPastResults } from '@/data/mockPastResults'; // Disabled - no mock data
import { getOptimalStorage } from '@/services/database/storage-adapter';

interface PastResultsState {
  results: PastResult[];
  addResult: (result: PastResult) => void;
  editResult: (id: string, updated: PastResult) => void;
  deleteResult: (id: string) => void;
  setResults: (results: PastResult[]) => void;
}

export const usePastResultsStore = create<PastResultsState>()(
  persist(
    (set) => ({
      results: [], // No mock data - starting clean
      addResult: (result) => set((state) => ({ 
        results: [...state.results, result] 
      })),
      editResult: (id, updated) => set((state) => ({
        results: state.results.map(r => r.id === id ? updated : r),
      })),
      deleteResult: (id) => set((state) => ({
        results: state.results.filter(r => r.id !== id),
      })),
      setResults: (results) => set({ results }),
    }),
    {
      name: 'myk9show-past-results-storage',
      storage: createJSONStorage(() => getOptimalStorage('results')),
      partialize: (state) => ({
        results: state.results,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for past results
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.results && Array.isArray(state.results)) {
              // Ensure all results have proper relationships
              state.results = state.results.map((result: unknown) => {
                const r = result as Record<string, unknown>;
                return {
                  ...r,
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
