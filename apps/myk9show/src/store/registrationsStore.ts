import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Registration } from '@/types/dog-types';
import { getOptimalStorage } from '@/services/database/storage-adapter';

interface RegistrationsStore {
  registrations: Registration[];
  setRegistrations: (registrations: Registration[]) => void;
  addRegistration: (registration: Registration) => void;
  updateRegistration: (registration: Registration) => void;
  removeRegistration: (id: string) => void;

  // Dialog and selection state
  isAddRegistrationDialogOpen: boolean;
  setIsAddRegistrationDialogOpen: (open: boolean) => void;
  /**
   * Bumped on every OPEN of the add panel. The panel is hosted for the whole
   * page now, so it never unmounts between uses and EditPanelWrapper only
   * resets when its `initialData` VALUE changes — which for Add is a module
   * constant. Hosts key the panel on this so each open starts blank instead of
   * pre-filled with the registration just saved.
   */
  addRegistrationOpenCount: number;
  isEditRegistrationDialogOpen: boolean;
  setIsEditRegistrationDialogOpen: (open: boolean) => void;
  isDeleteRegistrationDialogOpen: boolean;
  setIsDeleteRegistrationDialogOpen: (open: boolean) => void;
  isViewRegistrationDialogOpen: boolean;
  setIsViewRegistrationDialogOpen: (open: boolean) => void;
  selectedRegistration: Registration | null;
  setSelectedRegistration: (registration: Registration | null) => void;
}

export const useRegistrationsStore = create<RegistrationsStore>()(
  persist(
    set => ({
      registrations: [],
      setRegistrations: registrations => set({ registrations }),
      addRegistration: registration =>
        set(state => ({
          registrations: [...state.registrations, registration],
        })),
      updateRegistration: registration =>
        set(state => ({
          registrations: state.registrations.map(r =>
            r.id === registration.id ? registration : r
          ),
        })),
      removeRegistration: id =>
        set(state => ({
          registrations: state.registrations.filter(r => r.id !== id),
        })),

      // Dialog and selection state
      isAddRegistrationDialogOpen: false,
      addRegistrationOpenCount: 0,
      setIsAddRegistrationDialogOpen: open =>
        set(state => ({
          isAddRegistrationDialogOpen: open,
          addRegistrationOpenCount:
            open && !state.isAddRegistrationDialogOpen
              ? state.addRegistrationOpenCount + 1
              : state.addRegistrationOpenCount,
        })),
      isEditRegistrationDialogOpen: false,
      setIsEditRegistrationDialogOpen: open => set({ isEditRegistrationDialogOpen: open }),
      isDeleteRegistrationDialogOpen: false,
      setIsDeleteRegistrationDialogOpen: open => set({ isDeleteRegistrationDialogOpen: open }),
      isViewRegistrationDialogOpen: false,
      setIsViewRegistrationDialogOpen: open => set({ isViewRegistrationDialogOpen: open }),
      selectedRegistration: null,
      setSelectedRegistration: registration => set({ selectedRegistration: registration }),
    }),
    {
      name: 'myk9show-registrations-storage',
      storage: createJSONStorage(() => getOptimalStorage('registrations')),
      // Only persist the registrations data, not the UI state
      partialize: state => ({
        registrations: state.registrations,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for registrations
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.registrations && Array.isArray(state.registrations)) {
              // Ensure all registrations have proper relationships
              state.registrations = state.registrations.map((registration: unknown) => {
                const reg = registration as Record<string, unknown>;
                return {
                  ...reg,
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
