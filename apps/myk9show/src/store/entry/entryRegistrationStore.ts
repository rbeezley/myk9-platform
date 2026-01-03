import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { generateId } from '@/utils/idUtils';

export interface RegistrationData {
  submittedAt: string;
  handler: string;
  handlerId?: string;
  entryFee: number;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  specialRequests?: string;
  jumpHeight?: string;
  preferredJudge?: string;
  moveUpRequested?: boolean;
}

export interface EntryRegistration {
  id: string;
  showId: string;
  classId: string;
  dogId: string;
  registrationData: RegistrationData;
  status: 'draft' | 'submitted' | 'paid' | 'confirmed';
  createdAt: string;
  updatedAt: string;
}

interface EntryRegistrationStore {
  // State
  registrations: EntryRegistration[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  createRegistration: (data: Omit<EntryRegistration, 'id' | 'createdAt' | 'updatedAt'>) => EntryRegistration;
  updateRegistration: (id: string, updates: Partial<EntryRegistration>) => void;
  deleteRegistration: (id: string) => void;
  
  // Queries
  getRegistration: (id: string) => EntryRegistration | undefined;
  getRegistrationsByShow: (showId: string) => EntryRegistration[];
  getRegistrationsByClass: (classId: string) => EntryRegistration[];
  getRegistrationsByDog: (dogId: string) => EntryRegistration[];
  getRegistrationsByStatus: (status: EntryRegistration['status']) => EntryRegistration[];
  
  // Registration workflow
  submitRegistration: (id: string) => void;
  confirmPayment: (id: string) => void;
  refundPayment: (id: string) => void;
  
  // Bulk operations
  bulkUpdateRegistrations: (ids: string[], updates: Partial<EntryRegistration>) => void;
  bulkDeleteRegistrations: (ids: string[]) => void;
  
  // Utility
  clearError: () => void;
  resetStore: () => void;
}

const initialState = {
  registrations: [],
  isLoading: false,
  error: null,
};

export const useEntryRegistrationStore = create<EntryRegistrationStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      createRegistration: (data) => {
        const registration: EntryRegistration = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        set(state => ({
          registrations: [...state.registrations, registration],
        }));
        
        return registration;
      },
      
      updateRegistration: (id, updates) => {
        set(state => ({
          registrations: state.registrations.map(reg =>
            reg.id === id
              ? { ...reg, ...updates, updatedAt: new Date().toISOString() }
              : reg
          ),
        }));
      },
      
      deleteRegistration: (id) => {
        set(state => ({
          registrations: state.registrations.filter(reg => reg.id !== id),
        }));
      },
      
      getRegistration: (id) => {
        return get().registrations.find(reg => reg.id === id);
      },
      
      getRegistrationsByShow: (showId) => {
        return get().registrations.filter(reg => reg.showId === showId);
      },
      
      getRegistrationsByClass: (classId) => {
        return get().registrations.filter(reg => reg.classId === classId);
      },
      
      getRegistrationsByDog: (dogId) => {
        return get().registrations.filter(reg => reg.dogId === dogId);
      },
      
      getRegistrationsByStatus: (status) => {
        return get().registrations.filter(reg => reg.status === status);
      },
      
      submitRegistration: (id) => {
        const registration = get().getRegistration(id);
        if (registration && registration.status === 'draft') {
          get().updateRegistration(id, {
            status: 'submitted',
            registrationData: {
              ...registration.registrationData,
              submittedAt: new Date().toISOString(),
            },
          });
        }
      },
      
      confirmPayment: (id) => {
        const registration = get().getRegistration(id);
        if (registration && registration.status === 'submitted') {
          get().updateRegistration(id, {
            status: 'paid',
            registrationData: {
              ...registration.registrationData,
              paymentStatus: 'paid',
            },
          });
        }
      },
      
      refundPayment: (id) => {
        const registration = get().getRegistration(id);
        if (registration && registration.registrationData.paymentStatus === 'paid') {
          get().updateRegistration(id, {
            registrationData: {
              ...registration.registrationData,
              paymentStatus: 'refunded',
            },
          });
        }
      },
      
      bulkUpdateRegistrations: (ids, updates) => {
        set(state => ({
          registrations: state.registrations.map(reg =>
            ids.includes(reg.id)
              ? { ...reg, ...updates, updatedAt: new Date().toISOString() }
              : reg
          ),
        }));
      },
      
      bulkDeleteRegistrations: (ids) => {
        set(state => ({
          registrations: state.registrations.filter(reg => !ids.includes(reg.id)),
        }));
      },
      
      clearError: () => {
        set({ error: null });
      },
      
      resetStore: () => {
        set(initialState);
      },
    }),
    {
      name: 'entry-registration-store',
      storage: createJSONStorage(() => getOptimalStorage('entryRegistrationStore')),
    }
  )
);