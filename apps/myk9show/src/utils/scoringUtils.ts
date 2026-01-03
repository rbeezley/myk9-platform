/**
 * Utility functions and types for scoring components
 */

import type { ScoringFormat } from '@/types/scoring-types';

// Judge Sync Dashboard type definitions
export interface JudgeSyncDashboardProps {
  judgeId: string;
  classId?: string;
  format?: ScoringFormat;
  onForceSync?: () => void;
  onDataExport?: () => void;
  className?: string;
}
export interface SyncMetrics {
  totalScores: number;
  syncedScores: number;
  pendingScores: number;
  failedScores: number;
  lastSyncTime?: Date;
  syncSuccess: number; // percentage
  averageSyncTime: number; // ms
}

export interface DataIntegrityStatus {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  issues: string[];
}

export interface JudgeActivity {
  sessionsActive: number;
  sessionsCompleted: number;
  scoresSubmitted: number;
  averageScoreTime: number;
  lastActivity?: Date;
}

// Get status color helper
export const getStatusColor = (status: 'good' | 'warning' | 'error'): string => {
  switch (status) {
    case 'good':
      return 'text-success-green';
    case 'warning':
      return 'text-warning-orange';
    case 'error':
      return 'text-error-red';
  }
};

// Get sync health status helper
export const getSyncHealthStatus = (syncMetrics: SyncMetrics): 'good' | 'warning' | 'error' => {
  if (syncMetrics.failedScores > 0) return 'error';
  if (syncMetrics.pendingScores > syncMetrics.totalScores * 0.2) return 'warning';
  return 'good';
};