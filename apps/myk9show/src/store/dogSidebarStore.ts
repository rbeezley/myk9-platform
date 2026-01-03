import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';

interface DogSidebarState {
  // Sidebar UI state
  isOpen: boolean;
  searchTerm: string;
  selectedDogId: string | null;
  
  // Actions
  setIsOpen: (isOpen: boolean) => void;
  setSearchTerm: (searchTerm: string) => void;
  setSelectedDogId: (dogId: string | null) => void;
  toggleSidebar: () => void;
}

export const useDogSidebarStore = create<DogSidebarState>()(
  persist(
    (set) => ({
      // Initial state
      isOpen: true,
      searchTerm: '',
      selectedDogId: null,
      
      // Actions
      setIsOpen: (isOpen) => set({ isOpen }),
      setSearchTerm: (searchTerm) => set({ searchTerm }),
      setSelectedDogId: (selectedDogId) => set({ selectedDogId }),
      toggleSidebar: () => set((state) => ({ isOpen: !state.isOpen })),
    }),
    {
      name: 'myk9show-dog-sidebar-storage',
      storage: createJSONStorage(() => getOptimalStorage('dogSidebar')),
      // Only persist the sidebar state, not the search term
      partialize: (state) => ({
        isOpen: state.isOpen,
        selectedDogId: state.selectedDogId,
      }),
    }
  )
);
