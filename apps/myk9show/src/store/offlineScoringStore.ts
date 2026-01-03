import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import type { 
  ScoringSession, 
  JudgeScore
} from '@/types/scoring-types';
import type { SyncQueueItem } from '@/services/sync/types';
import { generateId } from '@/utils/idUtils';

interface OfflineScoringStore {
  // State
  sessions: Record<string, ScoringSession>;
  scores: Record<string, JudgeScore[]>;
  syncQueue: SyncQueueItem[];
  isOffline: boolean;
  
  // Actions
  createSession: (session: ScoringSession) => void;
  updateSession: (sessionId: string, updates: Partial<ScoringSession>) => void;
  deleteSession: (sessionId: string) => void;
  
  addScore: (classId: string, score: JudgeScore) => void;
  updateScore: (classId: string, scoreId: string, updates: Partial<JudgeScore>) => void;
  deleteScore: (classId: string, scoreId: string) => void;
  
  addToSyncQueue: (item: SyncQueueItem) => void;
  removeFromSyncQueue: (itemId: string) => void;
  updateSyncQueueItem: (itemId: string, updates: Partial<SyncQueueItem>) => void;
  
  setOfflineMode: (isOffline: boolean) => void;
  clearAllData: () => void;
  
  // Selectors
  getSessionsByJudge: (judgeId: string) => ScoringSession[];
  getScoresByClass: (classId: string) => JudgeScore[];
  getPendingSyncItems: () => SyncQueueItem[];
  
  // Additional methods for OfflineJudgeInterface
  startJudgingSession: (classId: string, judgeId: string) => void;
  endJudgingSession: (sessionId: string) => void;
  advanceWorkflowStep: (sessionId: string) => void;
  setCurrentEntry: (sessionId: string, entryId: string) => void;
  getNextEntry: (sessionId: string) => string | null;
  submitScore: (classId: string, score: JudgeScore) => void;
  setError: (error: string | null) => void;
  addWarning: (warning: string) => void;
}

export const useOfflineScoringStore = create<OfflineScoringStore>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: {},
      scores: {},
      syncQueue: [],
      isOffline: false,
      
      // Session management
      createSession: (session) => set((state) => ({
        sessions: { ...state.sessions, [session.id]: session }
      })),
      
      updateSession: (sessionId, updates) => set((state) => ({
        sessions: {
          ...state.sessions,
          [sessionId]: { ...state.sessions[sessionId], ...updates }
        }
      })),
      
      deleteSession: (sessionId) => set((state) => {
        const { [sessionId]: _removed, ...sessions } = state.sessions;
        void _removed; // Suppress unused variable warning
        return { sessions };
      }),
      
      // Score management
      addScore: (classId, score) => set((state) => ({
        scores: {
          ...state.scores,
          [classId]: [...(state.scores[classId] || []), score]
        }
      })),
      
      updateScore: (classId, scoreId, updates) => set((state) => ({
        scores: {
          ...state.scores,
          [classId]: (state.scores[classId] || []).map(score =>
            score.id === scoreId ? { ...score, ...updates } : score
          )
        }
      })),
      
      deleteScore: (classId, scoreId) => set((state) => ({
        scores: {
          ...state.scores,
          [classId]: (state.scores[classId] || []).filter(score => score.id !== scoreId)
        }
      })),
      
      // Sync queue management
      addToSyncQueue: (item) => set((state) => ({
        syncQueue: [...state.syncQueue, item]
      })),
      
      removeFromSyncQueue: (itemId) => set((state) => ({
        syncQueue: state.syncQueue.filter(item => item.id !== itemId)
      })),
      
      updateSyncQueueItem: (itemId, updates) => set((state) => ({
        syncQueue: state.syncQueue.map(item =>
          item.id === itemId ? { ...item, ...updates } : item
        )
      })),
      
      // Utility actions
      setOfflineMode: (isOffline) => set({ isOffline }),
      
      clearAllData: () => set({
        sessions: {},
        scores: {},
        syncQueue: [],
        isOffline: false
      }),
      
      // Selectors
      getSessionsByJudge: (judgeId) => {
        const state = get();
        return Object.values(state.sessions).filter(session => session.judgeId === judgeId);
      },
      
      getScoresByClass: (classId) => {
        const state = get();
        return state.scores[classId] || [];
      },
      
      getPendingSyncItems: () => {
        const state = get();
        return state.syncQueue.filter(item => item.status === 'pending');
      },
      
      // Additional methods implementation
      startJudgingSession: (classId, judgeId) => {
        const session: ScoringSession = {
          id: generateId(),
          classId,
          judgeId,
          format: 'scent_work', // Default format
          status: 'active',
          startTime: new Date(),
          totalEntries: 0,
          completedEntries: [],
          isOffline: false,
          pendingSync: []
        };
        set((state) => ({
          sessions: { ...state.sessions, [session.id]: session }
        }));
      },
      
      endJudgingSession: (sessionId) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              status: 'completed',
              endTime: new Date()
            }
          }
        }));
      },
      
      advanceWorkflowStep: (sessionId) => {
        // Placeholder implementation
        console.log('Advancing workflow for session:', sessionId);
      },
      
      setCurrentEntry: (sessionId, entryId) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              currentEntryId: entryId
            }
          }
        }));
      },
      
      getNextEntry: (sessionId) => {
        void sessionId; // Suppress unused parameter warning
        // Placeholder - would need entry list logic
        return null;
      },
      
      submitScore: (classId, score) => {
        set((state) => ({
          scores: {
            ...state.scores,
            [classId]: [...(state.scores[classId] || []), score]
          }
        }));
      },
      
      setError: (error) => {
        // Would need to add error state to the store
        console.error('Scoring error:', error);
      },
      
      addWarning: (warning) => {
        // Would need to add warnings state to the store
        console.warn('Scoring warning:', warning);
      }
    }),
    {
      name: 'myk9show-offline-scoring-storage',
      storage: createJSONStorage(() => getOptimalStorage('offlineScoring')),
      version: 1
    }
  )
);

export type { OfflineScoringStore };

// Export convenience hooks
export const useCurrentScoringSession = () => {
  const sessions = useOfflineScoringStore(state => state.sessions);
  return Object.values(sessions).find(s => s.status === 'active');
};

export const useJudgeAuth = () => {
  // Placeholder for judge authentication
  return {
    judgeId: 'judge-001',
    judgeName: 'John Doe',
    isAuthenticated: true
  };
};

export const useClassScoring = (classId: string) => {
  const scores = useOfflineScoringStore(state => state.getScoresByClass(classId));
  return scores;
};

export const useScoringValidation = () => {
  // Placeholder for scoring validation
  return {
    validate: (score: unknown) => {
      void score; // Suppress unused parameter warning
      return { isValid: true, errors: [] };
    }
  };
};

export const useSyncStatus = () => {
  const syncQueue = useOfflineScoringStore(state => state.syncQueue);
  const pendingCount = syncQueue.filter(item => item.status === 'pending').length;
  
  return {
    pendingCount,
    isOnline: true,
    lastSyncTime: new Date()
  };
};

export const useScoringEvents = () => {
  // Placeholder for scoring events
  return {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      void event;
      void handler;
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      void event;
      void handler;
    },
    emit: (event: string, data: unknown) => {
      void event;
      void data;
    }
  };
};