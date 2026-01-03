import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';

interface UserSidebarStore {
  selectedPersonId: string | null;
  setSelectedPersonId: (id: string | null) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export const useUserSidebarStore = create<UserSidebarStore>()(
  persist(
    (set) => ({
      selectedPersonId: null,
      setSelectedPersonId: (id) => set({ selectedPersonId: id }),
      searchTerm: '',
      setSearchTerm: (term) => set({ searchTerm: term }),
    }),
    {
      name: 'myk9show-people-sidebar-storage',
      storage: createJSONStorage(() => getOptimalStorage('peopleSidebar')),
      // Only persist the selected person ID, not the search term
      partialize: (state) => ({
        selectedPersonId: state.selectedPersonId,
      }),
    }
  )
);
