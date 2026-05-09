/**
 * Scoring Store
 *
 * Zustand store for managing scoring sessions and score records.
 * Handles session lifecycle, score submission, and sync status tracking.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Score, ScoringSession, CompetitionType } from '../types';

interface ScoringStoreOptions {
  enableDevtools?: boolean;
  storageName?: string;
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
  updateScoreSync: (entryId: string | number, syncStatus: 'synced' | 'error') => void;
  undoLastScore: () => void;
  moveToNextEntry: () => void;
  moveToPreviousEntry: () => void;
  endScoringSession: () => void;
  clearSession: () => void;
}

/**
 * Create the scoring store with persistence
 *
 * @param options - Enable Redux DevTools and configure persisted storage.
 */
export function createScoringStore(options: boolean | ScoringStoreOptions = {}) {
  const resolvedOptions: ScoringStoreOptions =
    typeof options === 'boolean' ? { enableDevtools: options } : options;
  const { enableDevtools = false, storageName = 'scoring-storage' } = resolvedOptions;

  return create<ScoringState>()(
    devtools(
      persist(
        (set) => ({
          currentSession: null,
          isScoring: false,
          lastScoredEntry: null,

          startScoringSession: (
            classId,
            className,
            competitionType,
            judgeId,
            totalEntries
          ) => {
            set({
              currentSession: {
                classId,
                className,
                competitionType,
                judgeId,
                startedAt: new Date().toISOString(),
                currentEntryIndex: 0,
                totalEntries,
                scores: [],
              },
              isScoring: true,
              lastScoredEntry: null,
            });
          },

          submitScore: (scoreData) => {
            const score: Score = {
              ...scoreData,
              scoredAt: new Date().toISOString(),
              syncStatus: 'pending',
            };

            set((state) => {
              if (!state.currentSession) return state;

              return {
                ...state,
                currentSession: {
                  ...state.currentSession,
                  scores: [...state.currentSession.scores, score],
                },
                lastScoredEntry: score,
              };
            });
          },

          updateScoreSync: (entryId, syncStatus) => {
            set((state) => {
              if (!state.currentSession) return state;

              const updatedScores = state.currentSession.scores.map((score) =>
                score.entryId === entryId ? { ...score, syncStatus } : score
              );

              return {
                ...state,
                currentSession: {
                  ...state.currentSession,
                  scores: updatedScores,
                },
              };
            });
          },

          undoLastScore: () => {
            set((state) => {
              if (
                !state.currentSession ||
                state.currentSession.scores.length === 0
              ) {
                return state;
              }

              const scores = [...state.currentSession.scores];
              scores.pop();

              return {
                ...state,
                currentSession: {
                  ...state.currentSession,
                  scores,
                  currentEntryIndex: Math.max(
                    0,
                    state.currentSession.currentEntryIndex - 1
                  ),
                },
                lastScoredEntry: scores[scores.length - 1] || null,
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
                  currentEntryIndex: nextIndex,
                },
              };
            });
          },

          moveToPreviousEntry: () => {
            set((state) => {
              if (!state.currentSession) return state;

              const prevIndex = Math.max(
                0,
                state.currentSession.currentEntryIndex - 1
              );

              return {
                ...state,
                currentSession: {
                  ...state.currentSession,
                  currentEntryIndex: prevIndex,
                },
              };
            });
          },

          endScoringSession: () => {
            set({
              isScoring: false,
            });
          },

          clearSession: () => {
            set({
              currentSession: null,
              isScoring: false,
              lastScoredEntry: null,
            });
          },
        }),
        {
          name: storageName,
          partialize: (state) => ({
            currentSession: state.currentSession,
            lastScoredEntry: state.lastScoredEntry,
          }),
        }
      ),
      { enabled: enableDevtools }
    )
  );
}

// Default store instance (devtools disabled for library use)
export const useScoringStore = createScoringStore();

// Re-export types for convenience
export type { ScoringState, ScoringStoreOptions };
