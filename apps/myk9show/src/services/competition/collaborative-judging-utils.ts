/**
 * Collaborative Judging Utilities
 * Phase 6.2: Live Competition Features
 *
 * Pure/stateless helper functions for collaborative judging operations,
 * including data mapping, severity calculation, conflict detection,
 * and metrics initialization.
 */

import type {
  JudgeSession,
  CollaborativeScore,
  ScoringConflict,
  JudgeActivity,
  CollaborationMetrics,
} from './collaborative-judging-types';
import type {
  PresenceTrackingData
} from '../../types/realtime-types';

/**
 * Map raw database/event data to a JudgeSession object
 */
export function mapToJudgeSession(data: Record<string, unknown>): JudgeSession {
  return {
    sessionId: data.session_id as string,
    judgeId: data.judge_id as string,
    judgeName: (data.judge_name as string) || 'Unknown Judge',
    classId: data.class_id as string,
    className: (data.class_name as string) || 'Unknown Class',
    showId: data.show_id as string,
    role: (data.role as JudgeSession['role']) || 'primary',
    status: (data.status as JudgeSession['status']) || 'active',
    startedAt: new Date(data.started_at as string),
    lastActivity: new Date((data.last_activity as string) || (data.updated_at as string)),
    scoreCount: (data.score_count as number) || 0,
    averageScoreTime: (data.average_score_time as number) || 0,
    conflictCount: (data.conflict_count as number) || 0,
    permissions: {
      canScore: (data.can_score as boolean) !== false,
      canModifyResults: (data.can_modify_results as boolean) || false,
      canFinalizeResults: (data.can_finalize_results as boolean) || false,
      canViewOtherScores: (data.can_view_other_scores as boolean) !== false,
    },
  };
}

/**
 * Map raw database/event data to a CollaborativeScore object
 */
export function mapToCollaborativeScore(data: Record<string, unknown>): CollaborativeScore {
  return {
    id: data.id as string,
    entryId: data.entry_id as string,
    dogId: data.dog_id as string,
    armband: (data.armband as string) || '',
    sessionId: data.session_id as string,
    judgeId: data.judge_id as string,
    judgeName: (data.judge_name as string) || 'Unknown Judge',
    scoreData: {
      points: (data.points as number) || 0,
      time: (data.time as number) || 0,
      faults: (data.faults as number) || 0,
      notes: data.notes as string,
    },
    isTemporary: (data.is_temporary as boolean) || false,
    isPreliminary: (data.is_preliminary as boolean) !== false,
    submittedAt: new Date((data.submitted_at as string) || (data.created_at as string)),
    lastModified: new Date(data.updated_at as string),
    version: (data.version as number) || 1,
    conflictStatus: (data.conflict_status as CollaborativeScore['conflictStatus']) || 'none',
  };
}

/**
 * Map presence data to a JudgeActivity object for judges
 */
export function mapPresenceToJudgeActivity(presence: PresenceTrackingData): JudgeActivity {
  return {
    judgeId: presence.user_id,
    activity: 'idle',
    activityStarted: new Date(),
    lastUpdate: new Date(presence.last_seen),
  };
}

/**
 * Get severity level based on score difference magnitude
 */
export function getSeverityLevel(difference: number): ScoringConflict['severity'] {
  if (difference >= 15) return 'critical';
  if (difference >= 10) return 'high';
  if (difference >= 7) return 'medium';
  return 'low';
}

/**
 * Determine the primary judge from a collection of sessions.
 * Returns the judgeId of the primary-role judge, or the first judge if none has the primary role.
 */
export function determinePrimaryJudge(sessions: Map<string, JudgeSession>): string {
  const primaryJudge = Array.from(sessions.values())
    .find(session => session.role === 'primary');

  return primaryJudge?.judgeId || Array.from(sessions.keys())[0] || '';
}

/**
 * Compute other judge scores relative to a given score for a particular entry
 */
export function computeOtherJudgeScores(
  score: CollaborativeScore,
  entryScores: CollaborativeScore[]
): CollaborativeScore['otherJudgeScores'] {
  return entryScores
    .filter(s => s.judgeId !== score.judgeId)
    .map(s => ({
      judgeId: s.judgeId,
      judgeName: s.judgeName,
      score: s.scoreData.points,
      difference: Math.abs(s.scoreData.points - score.scoreData.points),
    }));
}

/**
 * Detect pairwise scoring conflicts that exceed the discrepancy threshold.
 * Returns an array of comparisons where the point difference is above the threshold.
 */
export function detectScoreDiscrepancies(
  entryScores: CollaborativeScore[],
  threshold: number
): Array<{ judge1: CollaborativeScore; judge2: CollaborativeScore; difference: number }> {
  const comparisons: Array<{
    judge1: CollaborativeScore;
    judge2: CollaborativeScore;
    difference: number;
  }> = [];

  for (let i = 0; i < entryScores.length; i++) {
    for (let j = i + 1; j < entryScores.length; j++) {
      const score1 = entryScores[i];
      const score2 = entryScores[j];
      const difference = Math.abs(score1.scoreData.points - score2.scoreData.points);

      if (difference > threshold) {
        comparisons.push({ judge1: score1, judge2: score2, difference });
      }
    }
  }

  return comparisons;
}

/**
 * Initialize collaboration metrics for a show/class
 */
export function initializeMetrics(showId: string, classId: string): CollaborationMetrics {
  return {
    showId,
    classId,
    activeSessions: 0,
    totalScores: 0,
    consensusRate: 100,
    averageScoreDiscrepancy: 0,
    conflictsDetected: 0,
    conflictsResolved: 0,
    averageResolutionTime: 0,
    judgeProductivity: new Map(),
    lastUpdated: new Date(),
  };
}
