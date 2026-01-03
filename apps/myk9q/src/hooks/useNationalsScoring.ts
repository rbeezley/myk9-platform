/**
 * useNationalsScoring Hook
 *
 * STATUS: Dormant (No current nationals scheduled)
 * LAST USED: 2024
 *
 * React hook for components to interact with the AKC Nationals scoring system.
 * Provides easy access to scoring functions, leaderboards, and real-time updates.
 */

import { useEffect, useCallback } from 'react';
import { useNationalsStore, type ElementProgressStats } from '../stores/nationalsStore';
import {
  ScoringInput,
  ElementType,
  CompetitionDay,
  LeaderboardEntry,
  NationalsScore
} from '../services/nationalsScoring';

export interface UseNationalsScoringOptions {
  licenseKey: string;
  autoRefreshInterval?: number; // milliseconds
  enableRealtime?: boolean;
}

export interface UseNationalsScoringReturn {
  // Data
  leaderboard: LeaderboardEntry[];
  qualifiers: LeaderboardEntry[];
  elementProgress: ElementProgressStats[];
  advancementStatus: {
    cutLinePoints: number;
    cutLineTime: number;
    qualifiedCount: number;
    needMoreResults: boolean;
  };

  // State
  isLoading: boolean;
  isConnected: boolean;
  isScoring: boolean;
  error: string | null;
  lastUpdated: Date | null;

  // Scoring actions
  submitScore: (input: ScoringInput) => Promise<{ success: boolean; error?: unknown }>;
  updateScore: (scoreId: number, input: Partial<ScoringInput>) => Promise<{ success: boolean; error?: unknown }>;
  startScoring: (entryId: number, element: ElementType, day: CompetitionDay) => void;
  stopScoring: () => void;

  // Data actions
  refreshAll: () => Promise<void>;
  refreshLeaderboard: () => Promise<void>;
  refreshQualifiers: () => Promise<void>;
  getDogScores: (entryId: number) => Promise<NationalsScore[]>;

  // Utility actions
  clearError: () => void;

  // Helper functions
  getTopDogs: (count: number) => LeaderboardEntry[];
  getCurrentLeader: () => LeaderboardEntry | null;
  isQualified: (entryId: number) => boolean;
  getRankByEntryId: (entryId: number) => number | null;
  getCompletionRate: (elementType?: ElementType) => number;
}

export const useNationalsScoring = (options: UseNationalsScoringOptions): UseNationalsScoringReturn => {
  const {
    licenseKey,
    autoRefreshInterval = 30000, // 30 seconds default
    enableRealtime = true
  } = options;

  // Get store state and actions
  const {
    leaderboard,
    qualifiers,
    elementProgress,
    advancementStatus,
    isLoading,
    isConnected,
    isScoring,
    error,
    lastUpdated,
    initializeStore,
    refreshLeaderboard,
    refreshQualifiers,
    refreshElementProgress,
    refreshAdvancementStatus,
    submitScore,
    updateScore,
    startScoring,
    stopScoring,
    getDogScores,
    clearError,
    forceRefresh,
    enableRealtime: enableStoreRealtime,
    disableRealtime
  } = useNationalsStore();

  // Initialize store on mount
  useEffect(() => {
    initializeStore(licenseKey);

    return () => {
      // ALWAYS cleanup on unmount to prevent memory leaks
      // This is critical for long-lived apps where components mount/unmount frequently
disableRealtime();
    };
  }, [licenseKey, initializeStore, disableRealtime]);

  // Enable/disable real-time based on option
  useEffect(() => {
    if (enableRealtime) {
      enableStoreRealtime();
    } else {
      disableRealtime();
    }
  }, [enableRealtime, enableStoreRealtime, disableRealtime]);

  // Auto-refresh data if real-time is disabled
  useEffect(() => {
    if (!enableRealtime && autoRefreshInterval > 0) {
      const interval = setInterval(() => {
        if (!isLoading) {
          forceRefresh();
        }
      }, autoRefreshInterval);

      return () => clearInterval(interval);
    }
  }, [enableRealtime, autoRefreshInterval, isLoading, forceRefresh]);

  // Helper functions
  const getTopDogs = useCallback((count: number): LeaderboardEntry[] => {
    return leaderboard.slice(0, count);
  }, [leaderboard]);

  const getCurrentLeader = useCallback((): LeaderboardEntry | null => {
    return leaderboard.find(entry => entry.rank === 1) || null;
  }, [leaderboard]);

  const isQualified = useCallback((entryId: number): boolean => {
    return leaderboard.find(entry => entry.entry_id === entryId)?.qualified_for_finals || false;
  }, [leaderboard]);

  const getRankByEntryId = useCallback((entryId: number): number | null => {
    const entry = leaderboard.find(entry => entry.entry_id === entryId);
    return entry?.rank || null;
  }, [leaderboard]);

  const getCompletionRate = useCallback((elementType?: ElementType): number => {
    if (!elementProgress.length) return 0;

    if (elementType) {
      const elementStats = elementProgress.filter(ep => ep.element_type === elementType);
      if (!elementStats.length) return 0;

      const totalEntries = elementStats.reduce((sum, stat) => sum + stat.total_entries, 0);
      const successfulEntries = elementStats.reduce((sum, stat) => sum + stat.successful_entries, 0);

      return totalEntries > 0 ? (successfulEntries / totalEntries) * 100 : 0;
    }

    // Overall completion rate
    const totalEntries = elementProgress.reduce((sum, stat) => sum + stat.total_entries, 0);
    const successfulEntries = elementProgress.reduce((sum, stat) => sum + stat.successful_entries, 0);

    return totalEntries > 0 ? (successfulEntries / totalEntries) * 100 : 0;
  }, [elementProgress]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshLeaderboard(),
      refreshQualifiers(),
      refreshElementProgress(),
      refreshAdvancementStatus()
    ]);
  }, [refreshLeaderboard, refreshQualifiers, refreshElementProgress, refreshAdvancementStatus]);

  return {
    // Data
    leaderboard,
    qualifiers,
    elementProgress,
    advancementStatus,

    // State
    isLoading,
    isConnected,
    isScoring,
    error,
    lastUpdated,

    // Scoring actions
    submitScore,
    updateScore,
    startScoring,
    stopScoring,

    // Data actions
    refreshAll,
    refreshLeaderboard,
    refreshQualifiers,
    getDogScores,

    // Utility actions
    clearError,

    // Helper functions
    getTopDogs,
    getCurrentLeader,
    isQualified,
    getRankByEntryId,
    getCompletionRate
  };
};

// Additional hooks for specific use cases

/**
 * Hook for leaderboard components
 */
export const useNationalsLeaderboard = (licenseKey: string, limit?: number) => {
  const { leaderboard, isLoading, error, refreshLeaderboard } = useNationalsScoring({
    licenseKey,
    enableRealtime: true
  });

  const topEntries = limit ? leaderboard.slice(0, limit) : leaderboard;

  return {
    entries: topEntries,
    isLoading,
    error,
    refresh: refreshLeaderboard,
    total: leaderboard.length
  };
};

/**
 * Hook for judge scoring interface
 */
export const useJudgeScoring = (licenseKey: string, judgeId?: number) => {
  const {
    submitScore,
    updateScore,
    startScoring,
    stopScoring,
    isScoring,
    isLoading,
    error,
    clearError
  } = useNationalsScoring({
    licenseKey,
    enableRealtime: false // Judges don't need real-time updates
  });

  const scoreWithJudge = useCallback(async (input: Omit<ScoringInput, 'judge_id'>) => {
    return submitScore({
      ...input,
      judge_id: judgeId
    });
  }, [submitScore, judgeId]);

  return {
    submitScore: scoreWithJudge,
    updateScore,
    startScoring,
    stopScoring,
    isScoring,
    isLoading,
    error,
    clearError
  };
};

/**
 * Hook for element progress displays
 */
export const useElementProgress = (licenseKey: string) => {
  const { elementProgress, isLoading, error, refreshAll } = useNationalsScoring({
    licenseKey,
    enableRealtime: true
  });

  const refreshElementProgress = refreshAll;

  const getProgressByElement = useCallback((elementType: ElementType, day?: CompetitionDay) => {
    return elementProgress.filter(ep =>
      ep.element_type === elementType &&
      (day === undefined || ep.day === day)
    );
  }, [elementProgress]);

  const getProgressByDay = useCallback((day: CompetitionDay) => {
    return elementProgress.filter(ep => ep.day === day);
  }, [elementProgress]);

  return {
    elementProgress,
    getProgressByElement,
    getProgressByDay,
    isLoading,
    error,
    refresh: refreshElementProgress
  };
};