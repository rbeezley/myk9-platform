/**
 * Collaborative Judging Types
 * Phase 6.2: Live Competition Features
 *
 * Type definitions for multi-judge collaborative scoring, including
 * judge sessions, collaborative scores, scoring conflicts, judge activity,
 * and collaboration metrics.
 */

export interface JudgeSession {
  sessionId: string;
  judgeId: string;
  judgeName: string;
  classId: string;
  className: string;
  showId: string;
  role: 'primary' | 'secondary' | 'trainee' | 'observer';
  status: 'active' | 'paused' | 'disconnected' | 'completed';
  startedAt: Date;
  lastActivity: Date;
  scoreCount: number;
  averageScoreTime: number;
  conflictCount: number;
  permissions: {
    canScore: boolean;
    canModifyResults: boolean;
    canFinalizeResults: boolean;
    canViewOtherScores: boolean;
  };
}

export interface CollaborativeScore {
  id: string;
  entryId: string;
  dogId: string;
  armband: string;
  sessionId: string;
  judgeId: string;
  judgeName: string;
  scoreData: {
    points: number;
    time: number;
    faults: number;
    notes?: string | undefined;
  };
  isTemporary: boolean;
  isPreliminary: boolean;
  submittedAt: Date;
  lastModified: Date;
  version: number;
  conflictStatus?: 'none' | 'detected' | 'resolved' | undefined;
  otherJudgeScores?: Array<{
    judgeId: string;
    judgeName: string;
    score: number;
    difference: number;
  }> | undefined;
}

export interface ScoringConflict {
  id: string;
  entryId: string;
  dogId: string;
  armband: string;
  classId: string;
  conflictType: 'score-difference' | 'timing-conflict' | 'simultaneous-update' | 'eligibility-dispute';
  severity: 'low' | 'medium' | 'high' | 'critical';
  judges: Array<{
    judgeId: string;
    judgeName: string;
    score: CollaborativeScore;
    position: string; // position/opinion on the conflict
  }>;
  primaryJudge?: string | undefined; // Who has final say
  detectedAt: Date;
  resolvedAt?: Date | undefined;
  resolvedBy?: string | undefined;
  resolution?: {
    method: 'primary-judge-decision' | 'consensus' | 'average' | 'manual-override';
    finalScore: CollaborativeScore;
    notes: string;
  } | undefined;
  status: 'open' | 'under-review' | 'resolved' | 'escalated';
  discussionNotes: Array<{
    judgeId: string;
    judgeName: string;
    note: string;
    timestamp: Date;
  }>;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface JudgeActivity {
  judgeId: string;
  activity: 'scoring' | 'reviewing' | 'discussing' | 'idle';
  currentEntry?: string | undefined;
  targetEntry?: string | undefined; // Entry they're about to score
  activityStarted: Date;
  lastUpdate: Date;
  typing?: boolean | undefined;
  focusedElement?: string | undefined;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface CollaborationMetrics {
  showId: string;
  classId: string;
  activeSessions: number;
  totalScores: number;
  consensusRate: number; // Percentage of scores with no conflicts
  averageScoreDiscrepancy: number;
  conflictsDetected: number;
  conflictsResolved: number;
  averageResolutionTime: number; // minutes
  judgeProductivity: Map<string, {
    judgeId: string;
    scoresSubmitted: number;
    averageScoreTime: number;
    conflictRate: number;
  }>;
  lastUpdated: Date;
}

/** Configuration options for the collaborative judging service */
export interface CollaborativeJudgingConfig {
  scoreDiscrepancyThreshold: number; // Points difference to trigger conflict
  simultaneousScoreTimeoutMs: number;
  autoResolveConflicts: boolean;
  enableRealTimeDiscussion: boolean;
  scoringSessionTimeoutMs: number;
  maxConflictDiscussionLength: number;
}
