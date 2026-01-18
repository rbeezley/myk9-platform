import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { generateId } from '@/utils/idUtils';

export interface CompetitionData {
  startTime?: string | undefined;
  endTime?: string | undefined;
  score?: string | undefined;
  time?: string | undefined;
  placement?: string | undefined;
  qualified?: boolean | undefined;
  qualification?: string | undefined;
  qualificationReason?: string | undefined;
  faults?: number | undefined;
  judgeNotes?: string | undefined;
  recordedBy: string;
  recordedAt: string;
}

export interface EntryCompetition {
  id: string;
  registrationId: string;
  armband: string;
  runOrder: number;
  competitionData: CompetitionData;
  status: 'scheduled' | 'competing' | 'completed' | 'withdrawn' | 'scratched';
  createdAt: string;
  updatedAt: string;
}

interface EntryCompetitionStore {
  // State
  competitions: EntryCompetition[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  createCompetition: (data: Omit<EntryCompetition, 'id' | 'createdAt' | 'updatedAt'>) => EntryCompetition;
  updateCompetition: (id: string, updates: Partial<EntryCompetition>) => void;
  deleteCompetition: (id: string) => void;
  
  // Queries
  getCompetition: (id: string) => EntryCompetition | undefined;
  getCompetitionByRegistration: (registrationId: string) => EntryCompetition | undefined;
  getCompetitionsByStatus: (status: EntryCompetition['status']) => EntryCompetition[];
  
  // Competition workflow
  startCompetition: (id: string) => void;
  completeCompetition: (id: string, competitionData: CompetitionData) => void;
  withdrawCompetition: (id: string, reason?: string) => void;
  scratchCompetition: (id: string, reason?: string) => void;
  
  // Scoring operations
  recordScore: (id: string, score: string, time?: string) => void;
  recordFaults: (id: string, faults: number) => void;
  recordQualification: (id: string, qualified: boolean, reason?: string) => void;
  addJudgeNotes: (id: string, notes: string) => void;
  
  // Run order management
  updateRunOrder: (id: string, runOrder: number) => void;
  reorderCompetitions: (competitions: Array<{id: string; runOrder: number}>) => void;
  
  // Bulk operations
  bulkUpdateCompetitions: (ids: string[], updates: Partial<EntryCompetition>) => void;
  bulkDeleteCompetitions: (ids: string[]) => void;
  
  // Utility
  clearError: () => void;
  resetStore: () => void;
}

const initialState = {
  competitions: [],
  isLoading: false,
  error: null,
};

export const useEntryCompetitionStore = create<EntryCompetitionStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      createCompetition: (data) => {
        const competition: EntryCompetition = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        set(state => ({
          competitions: [...state.competitions, competition],
        }));
        
        return competition;
      },
      
      updateCompetition: (id, updates) => {
        set(state => ({
          competitions: state.competitions.map(comp =>
            comp.id === id
              ? { ...comp, ...updates, updatedAt: new Date().toISOString() }
              : comp
          ),
        }));
      },
      
      deleteCompetition: (id) => {
        set(state => ({
          competitions: state.competitions.filter(comp => comp.id !== id),
        }));
      },
      
      getCompetition: (id) => {
        return get().competitions.find(comp => comp.id === id);
      },
      
      getCompetitionByRegistration: (registrationId) => {
        return get().competitions.find(comp => comp.registrationId === registrationId);
      },
      
      getCompetitionsByStatus: (status) => {
        return get().competitions.filter(comp => comp.status === status);
      },
      
      startCompetition: (id) => {
        const competition = get().getCompetition(id);
        if (competition && competition.status === 'scheduled') {
          get().updateCompetition(id, {
            status: 'competing',
            competitionData: {
              ...competition.competitionData,
              startTime: new Date().toISOString(),
            },
          });
        }
      },
      
      completeCompetition: (id, competitionData) => {
        const competition = get().getCompetition(id);
        if (competition && competition.status === 'competing') {
          get().updateCompetition(id, {
            status: 'completed',
            competitionData: {
              ...competition.competitionData,
              ...competitionData,
              endTime: new Date().toISOString(),
            },
          });
        }
      },
      
      withdrawCompetition: (id, reason) => {
        const competition = get().getCompetition(id);
        if (competition && ['scheduled', 'competing'].includes(competition.status)) {
          get().updateCompetition(id, {
            status: 'withdrawn',
            competitionData: {
              ...competition.competitionData,
              qualificationReason: reason || 'Withdrawn',
            },
          });
        }
      },
      
      scratchCompetition: (id, reason) => {
        const competition = get().getCompetition(id);
        if (competition && competition.status === 'scheduled') {
          get().updateCompetition(id, {
            status: 'scratched',
            competitionData: {
              ...competition.competitionData,
              qualificationReason: reason || 'Scratched',
            },
          });
        }
      },
      
      recordScore: (id, score, time) => {
        const competition = get().getCompetition(id);
        if (competition && competition.status === 'competing') {
          get().updateCompetition(id, {
            competitionData: {
              ...competition.competitionData,
              score,
              time,
            },
          });
        }
      },
      
      recordFaults: (id, faults) => {
        const competition = get().getCompetition(id);
        if (competition && competition.status === 'competing') {
          get().updateCompetition(id, {
            competitionData: {
              ...competition.competitionData,
              faults,
            },
          });
        }
      },
      
      recordQualification: (id, qualified, reason) => {
        const competition = get().getCompetition(id);
        if (competition && competition.status === 'competing') {
          get().updateCompetition(id, {
            competitionData: {
              ...competition.competitionData,
              qualified,
              qualification: qualified ? 'Qualified' : 'Not Qualified',
              qualificationReason: reason,
            },
          });
        }
      },
      
      addJudgeNotes: (id, notes) => {
        const competition = get().getCompetition(id);
        if (competition) {
          get().updateCompetition(id, {
            competitionData: {
              ...competition.competitionData,
              judgeNotes: notes,
            },
          });
        }
      },
      
      updateRunOrder: (id, runOrder) => {
        get().updateCompetition(id, { runOrder });
      },
      
      reorderCompetitions: (competitions) => {
        competitions.forEach(({ id, runOrder }) => {
          get().updateRunOrder(id, runOrder);
        });
      },
      
      bulkUpdateCompetitions: (ids, updates) => {
        set(state => ({
          competitions: state.competitions.map(comp =>
            ids.includes(comp.id)
              ? { ...comp, ...updates, updatedAt: new Date().toISOString() }
              : comp
          ),
        }));
      },
      
      bulkDeleteCompetitions: (ids) => {
        set(state => ({
          competitions: state.competitions.filter(comp => !ids.includes(comp.id)),
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
      name: 'entry-competition-store',
      storage: createJSONStorage(() => getOptimalStorage('entryCompetitionStore')),
    }
  )
);