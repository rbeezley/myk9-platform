import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Achievement } from '@/types/achievement-types';
// import { mockAchievements } from '@/data/mockAchievements'; // Disabled - no mock data
import { getOptimalStorage } from '@/services/database/storage-adapter';

interface AchievementsState {
  achievements: Achievement[];
  addAchievement: (achievement: Achievement) => void;
  editAchievement: (id: string, updated: Achievement) => void;
  deleteAchievement: (id: string) => void;
  setAchievements: (achievements: Achievement[]) => void;
}

export const useAchievementsStore = create<AchievementsState>()(
  persist(
    (set) => ({
      achievements: [], // No mock data - starting clean
      addAchievement: (achievement) => set((state) => ({ 
        achievements: [...state.achievements, achievement] 
      })),
      editAchievement: (id, updated) => set((state) => ({
        achievements: state.achievements.map(a => a.id === id ? updated : a),
      })),
      deleteAchievement: (id) => set((state) => ({
        achievements: state.achievements.filter(a => a.id !== id),
      })),
      setAchievements: (achievements) => set({ achievements }),
    }),
    {
      name: 'myk9show-achievements-storage',
      storage: createJSONStorage(() => getOptimalStorage('achievements')),
      partialize: (state) => ({
        achievements: state.achievements,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for achievements
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.achievements && Array.isArray(state.achievements)) {
              // Ensure all achievements have proper relationships
              state.achievements = state.achievements.map((achievement: unknown) => {
                const a = achievement as Record<string, unknown>;
                return {
                  ...a,
                  // Add data transformations needed for relationships
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
