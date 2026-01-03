import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type QualifyingResult = 'Q' | 'NQ' | 'EX' | 'DQ' | 'E' | 'ABS' | 'WD' | 'Qualified' | 'Excused' | 'Withdrawn' | 'Eliminated' | 'Absent' | null;
export type CompetitionType = 
  | 'UKC_OBEDIENCE'
  | 'UKC_RALLY' 
  | 'UKC_NOSEWORK'
  | 'AKC_SCENT_WORK'
  | 'AKC_SCENT_WORK_NATIONAL'
  | 'AKC_FASTCAT'
  | 'ASCA_SCENT_DETECTION';

interface Score {
  entryId: number;
  armband: number;
  points?: number;
  time?: string;
  faults?: number;
  qualifying: QualifyingResult;
  nonQualifyingReason?: string;
  areas?: { [key: string]: string }; // For multi-area scent work
  healthCheckPassed?: boolean; // For Fast CAT
  mph?: number; // For Fast CAT speed
  score?: number; // For Rally scoring
  deductions?: number; // For Rally deductions
  // Nationals-specific fields
  correctCount?: number;
  incorrectCount?: number;
  finishCallErrors?: number;
  scoredAt: string;
  syncStatus: 'pending' | 'synced' | 'error';
}

interface ScoringSession {
  classId: number;
  className: string;
  competitionType: CompetitionType;
  judgeId: string;
  startedAt: string;
  currentEntryIndex: number;
  totalEntries: number;
  scores: Score[];
}

interface ScoringState {
  currentSession: ScoringSession | null;
  isScoring: boolean;
  lastScoredEntry: Score | null;
  
  // Actions
  startScoringSession: (
    classId: number,
    className: string,
    competitionType: CompetitionType,
    judgeId: string,
    totalEntries: number
  ) => void;
  
  submitScore: (score: Omit<Score, 'scoredAt' | 'syncStatus'>) => void;
  updateScoreSync: (entryId: number, syncStatus: 'synced' | 'error') => void;
  undoLastScore: () => void;
  moveToNextEntry: () => void;
  moveToPreviousEntry: () => void;
  endScoringSession: () => void;
  clearSession: () => void;
}

export const useScoringStore = create<ScoringState>()(
  devtools(
    persist(
      (set) => ({
        currentSession: null,
        isScoring: false,
        lastScoredEntry: null,

        startScoringSession: (classId, className, competitionType, judgeId, totalEntries) => {
          set({
            currentSession: {
              classId,
              className,
              competitionType,
              judgeId,
              startedAt: new Date().toISOString(),
              currentEntryIndex: 0,
              totalEntries,
              scores: []
            },
            isScoring: true,
            lastScoredEntry: null
          });
        },

        submitScore: (scoreData) => {
          const score: Score = {
            ...scoreData,
            scoredAt: new Date().toISOString(),
            syncStatus: 'pending'
          };

          set((state) => {
            if (!state.currentSession) return state;

            return {
              ...state,
              currentSession: {
                ...state.currentSession,
                scores: [...state.currentSession.scores, score]
              },
              lastScoredEntry: score
            };
          });
        },

        updateScoreSync: (entryId, syncStatus) => {
          set((state) => {
            if (!state.currentSession) return state;

            const updatedScores = state.currentSession.scores.map(score =>
              score.entryId === entryId ? { ...score, syncStatus } : score
            );

            return {
              ...state,
              currentSession: {
                ...state.currentSession,
                scores: updatedScores
              }
            };
          });
        },

        undoLastScore: () => {
          set((state) => {
            if (!state.currentSession || state.currentSession.scores.length === 0) {
              return state;
            }

            const scores = [...state.currentSession.scores];
            scores.pop();

            return {
              ...state,
              currentSession: {
                ...state.currentSession,
                scores,
                currentEntryIndex: Math.max(0, state.currentSession.currentEntryIndex - 1)
              },
              lastScoredEntry: scores[scores.length - 1] || null
            };
          });
        },

        moveToNextEntry: () => {
          set((state) => {
            if (!state.currentSession) return state;

            const nextIndex = Math.min(
              state.currentSession.currentEntryIndex + 1,
              state.currentSession.totalEntries - 1
            );

            return {
              ...state,
              currentSession: {
                ...state.currentSession,
                currentEntryIndex: nextIndex
              }
            };
          });
        },

        moveToPreviousEntry: () => {
          set((state) => {
            if (!state.currentSession) return state;

            const prevIndex = Math.max(0, state.currentSession.currentEntryIndex - 1);

            return {
              ...state,
              currentSession: {
                ...state.currentSession,
                currentEntryIndex: prevIndex
              }
            };
          });
        },

        endScoringSession: () => {
          set({
            isScoring: false
          });
        },

        clearSession: () => {
          set({
            currentSession: null,
            isScoring: false,
            lastScoredEntry: null
          });
        }
      }),
      {
        name: 'scoring-storage',
        partialize: (state) => ({
          currentSession: state.currentSession,
          lastScoredEntry: state.lastScoredEntry
        })
      }
    ),
    { enabled: import.meta.env.DEV } // Only enable devtools in development
  )
);