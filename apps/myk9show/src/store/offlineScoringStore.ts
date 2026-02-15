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
  error: string | null;
  warnings: string[];
  /** Ordered list of entry IDs for the current session */
  entryOrder: string[];

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
  getNextEntry: (currentEntryId: string) => string | null;
  submitScore: (classId: string, score: JudgeScore) => void;
  setError: (error: string | null) => void;
  addWarning: (warning: string) => void;
  clearWarnings: () => void;
  setEntryOrder: (entryIds: string[]) => void;
}

export const useOfflineScoringStore = create<OfflineScoringStore>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: {},
      scores: {},
      syncQueue: [],
      isOffline: false,
      error: null,
      warnings: [],
      entryOrder: [],
      
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
        isOffline: false,
        error: null,
        warnings: [],
        entryOrder: [],
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
          format: 'scent_work',
          status: 'active',
          isActive: true,
          workflowStep: 'entry_list',
          startTime: new Date(),
          totalEntries: 0,
          completedEntries: [],
          isOffline: get().isOffline,
          pendingSync: [],
        };
        set((state) => ({
          sessions: { ...state.sessions, [session.id]: session },
          error: null,
        }));
      },
      
      endJudgingSession: (sessionId) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              status: 'completed',
              isActive: false,
              endTime: new Date(),
            },
          },
        }));
      },
      
      advanceWorkflowStep: (sessionId) => {
        const WORKFLOW_STEPS = ['setup', 'entry_list', 'scoring', 'review', 'completed'];
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const currentIdx = WORKFLOW_STEPS.indexOf(session.workflowStep || 'setup');
          const nextStep = WORKFLOW_STEPS[Math.min(currentIdx + 1, WORKFLOW_STEPS.length - 1)];
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, workflowStep: nextStep },
            },
          };
        });
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
      
      getNextEntry: (currentEntryId) => {
        const state = get();
        const order = state.entryOrder;
        if (order.length === 0) return null;
        const currentIdx = order.indexOf(currentEntryId);
        if (currentIdx === -1 || currentIdx >= order.length - 1) return null;
        return order[currentIdx + 1];
      },
      
      submitScore: (classId, score) => {
        set((state) => {
          // Add the score
          const updatedScores = {
            ...state.scores,
            [classId]: [...(state.scores[classId] || []), score],
          };

          // Mark entry as completed in the active session
          const updatedSessions = { ...state.sessions };
          const activeSession = Object.values(updatedSessions).find(
            s => s.status === 'active' && s.classId === classId,
          );
          if (activeSession && !activeSession.completedEntries.includes(score.entryId)) {
            updatedSessions[activeSession.id] = {
              ...activeSession,
              completedEntries: [...activeSession.completedEntries, score.entryId],
            };
          }

          return { scores: updatedScores, sessions: updatedSessions };
        });
      },
      
      setError: (error) => set({ error }),

      addWarning: (warning) => set((state) => ({
        warnings: [...state.warnings, warning],
      })),

      clearWarnings: () => set({ warnings: [] }),

      setEntryOrder: (entryIds) => set({ entryOrder: entryIds })
    }),
    {
      name: 'myk9show-offline-scoring-storage',
      storage: createJSONStorage(() => getOptimalStorage('offlineScoring')),
      version: 1
    }
  )
);

export type { OfflineScoringStore };

// ---------------------------------------------------------------------------
// Convenience hooks
// ---------------------------------------------------------------------------

/** Returns the currently active scoring session, if any. */
export const useCurrentScoringSession = () => {
  const sessions = useOfflineScoringStore(state => state.sessions);
  return Object.values(sessions).find(s => s.status === 'active') ?? null;
};

/**
 * Judge authentication hook.
 *
 * Uses the real AuthContext to derive judge identity. Falls back to
 * unauthenticated state when no user is signed in.
 */
export { useJudgeAuth } from './offlineJudgeAuth';

/** Returns all scores for a given class. */
export const useClassScoring = (classId: string) => {
  return useOfflineScoringStore(state => state.getScoresByClass(classId));
};

/**
 * Format-aware score validation.
 *
 * Returns a `validate` function that checks required fields and
 * format-specific rules against `DEFAULT_SCORING_CONFIGS`.
 */
export { useScoringValidation } from './offlineScoringValidation';

/**
 * Derives sync status from the store's sync queue and browser
 * online/offline events.
 */
export { useSyncStatus } from './offlineSyncStatus';