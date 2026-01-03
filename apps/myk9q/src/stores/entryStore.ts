import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// Entry status type - single source of truth
export type EntryStatus =
  | 'no-status'      // Not checked in
  | 'checked-in'     // Checked in
  | 'at-gate'        // Called to gate
  | 'come-to-gate'   // Being called to gate
  | 'conflict'       // Scheduling conflict
  | 'pulled'         // Withdrawn from class
  | 'in-ring'        // Currently competing
  | 'completed';     // Finished (manual completion, no score)

export interface Entry {
  id: number;
  armband: number;
  callName: string;
  breed: string;
  handler: string;
  jumpHeight?: string;
  preferredTime?: string;
  isScored: boolean;
  // New unified status field
  status: EntryStatus;
  // Deprecated fields (for backward compatibility during migration)
  /** @deprecated Use status instead */
  inRing?: boolean;
  /** @deprecated Use status instead */
  checkedIn?: boolean;
  /** @deprecated Use status instead */
  checkinStatus?: EntryStatus;

  resultText?: string;
  searchTime?: string;
  faultCount?: number;
  placement?: number;
  classId: number;
  className: string;
  section?: string;
  element?: string;
  level?: string;
  timeLimit?: string;
  timeLimit2?: string;
  timeLimit3?: string;
  areas?: number;
  exhibitorOrder?: number;
  actualClassId?: number; // The real class ID for real-time subscriptions
  competitionType?: string; // Competition type for nationals detection
  trialDate?: string; // Trial date from view
  trialNumber?: string | number; // Trial number from view
  // Nationals-specific scoring fields
  correctFinds?: number;
  incorrectFinds?: number;
  noFinishCount?: number;
  totalPoints?: number;
  // Reason fields
  nqReason?: string;
  excusedReason?: string;
  withdrawnReason?: string;
  // Visibility flags - control what results are visible based on user role and timing settings
  showPlacement?: boolean;
  showQualification?: boolean;
  showTime?: boolean;
  showFaults?: boolean;
}

interface EntryFilters {
  showScored: boolean;
  showUnscored: boolean;
  searchTerm: string;
  sortBy: 'armband' | 'callName' | 'handler' | 'status';
  sortDirection: 'asc' | 'desc';
}

interface EntryState {
  // Data
  entries: Entry[];
  currentClassEntries: Entry[];
  currentEntry: Entry | null;
  
  // UI State
  filters: EntryFilters;
  isLoading: boolean;
  error: string | null;
  
  // Pagination
  currentPage: number;
  entriesPerPage: number;
  totalEntries: number;
  
  // Actions
  setEntries: (entries: Entry[]) => void;
  setCurrentClassEntries: (classId: number) => void;
  setCurrentEntry: (entry: Entry | null) => void;
  updateEntry: (entryId: number, updates: Partial<Entry>) => void;
  markAsScored: (entryId: number, resultText: string) => void;
  markInRing: (entryId: number, inRing: boolean) => void;
  
  // Filter Actions
  setFilter: (filter: Partial<EntryFilters>) => void;
  resetFilters: () => void;
  
  // Pagination Actions
  setPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  
  // Utility
  getFilteredEntries: () => Entry[];
  getEntryByArmband: (armband: number) => Entry | undefined;
  getPendingEntries: () => Entry[];
  getScoredEntries: () => Entry[];
}

const defaultFilters: EntryFilters = {
  showScored: true,
  showUnscored: true,
  searchTerm: '',
  sortBy: 'armband',
  sortDirection: 'asc'
};

export const useEntryStore = create<EntryState>()(
  devtools(
    (set, get) => ({
      // Initial state
      entries: [],
      currentClassEntries: [],
      currentEntry: null,
      filters: defaultFilters,
      isLoading: false,
      error: null,
      currentPage: 1,
      entriesPerPage: 20,
      totalEntries: 0,

      // Data Actions
      setEntries: (entries) => {
        set({
          entries,
          totalEntries: entries.length,
          currentPage: 1,
          error: null
        });
      },

      setCurrentClassEntries: (classId) => {
        const classEntries = get().entries.filter(e => e.classId === classId);
        set({
          currentClassEntries: classEntries,
          totalEntries: classEntries.length,
          currentPage: 1
        });
      },

      setCurrentEntry: (entry) => {
        set({ currentEntry: entry });
      },

      updateEntry: (entryId, updates) => {
        set((state) => ({
          entries: state.entries.map(entry =>
            entry.id === entryId ? { ...entry, ...updates } : entry
          ),
          currentClassEntries: state.currentClassEntries.map(entry =>
            entry.id === entryId ? { ...entry, ...updates } : entry
          ),
          currentEntry: state.currentEntry?.id === entryId
            ? { ...state.currentEntry, ...updates }
            : state.currentEntry
        }));
      },

      markAsScored: (entryId, resultText) => {
        get().updateEntry(entryId, {
          isScored: true,
          resultText,
          status: 'completed',  // Move to completed tab
          inRing: false         // Deprecated field for backward compat
        });
      },

      markInRing: (entryId, inRing) => {
        get().updateEntry(entryId, { inRing });
      },

      // Filter Actions
      setFilter: (filter) => {
        set((state) => ({
          filters: { ...state.filters, ...filter },
          currentPage: 1
        }));
      },

      resetFilters: () => {
        set({
          filters: defaultFilters,
          currentPage: 1
        });
      },

      // Pagination Actions
      setPage: (page) => {
        const maxPage = Math.ceil(get().totalEntries / get().entriesPerPage);
        set({
          currentPage: Math.min(Math.max(1, page), maxPage)
        });
      },

      nextPage: () => {
        const { currentPage, totalEntries, entriesPerPage } = get();
        const maxPage = Math.ceil(totalEntries / entriesPerPage);
        if (currentPage < maxPage) {
          set({ currentPage: currentPage + 1 });
        }
      },

      previousPage: () => {
        const { currentPage } = get();
        if (currentPage > 1) {
          set({ currentPage: currentPage - 1 });
        }
      },

      // Utility Functions
      getFilteredEntries: () => {
        const { currentClassEntries, filters } = get();
        
        let filtered = [...currentClassEntries];

        // Apply scored/unscored filter
        if (!filters.showScored) {
          filtered = filtered.filter(e => !e.isScored);
        }
        if (!filters.showUnscored) {
          filtered = filtered.filter(e => e.isScored);
        }

        // Apply search filter
        if (filters.searchTerm) {
          const term = filters.searchTerm.toLowerCase();
          filtered = filtered.filter(e =>
            e.callName.toLowerCase().includes(term) ||
            e.handler.toLowerCase().includes(term) ||
            e.breed.toLowerCase().includes(term) ||
            e.armband.toString().includes(term)
          );
        }

        // Apply sorting
        filtered.sort((a, b) => {
          let comparison = 0;
          
          switch (filters.sortBy) {
            case 'armband':
              comparison = a.armband - b.armband;
              break;
            case 'callName':
              comparison = a.callName.localeCompare(b.callName);
              break;
            case 'handler':
              comparison = a.handler.localeCompare(b.handler);
              break;
            case 'status':
              comparison = (a.isScored ? 1 : 0) - (b.isScored ? 1 : 0);
              break;
          }

          return filters.sortDirection === 'asc' ? comparison : -comparison;
        });

        return filtered;
      },

      getEntryByArmband: (armband) => {
        return get().entries.find(e => e.armband === armband);
      },

      getPendingEntries: () => {
        return get().currentClassEntries.filter(e => !e.isScored);
      },

      getScoredEntries: () => {
        return get().currentClassEntries.filter(e => e.isScored);
      }
    }),
    { enabled: import.meta.env.DEV } // Only enable devtools in development
  )
);