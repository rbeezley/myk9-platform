/**
 * Helper functions for CollaborativeJudging service
 *
 * Broadcasting utilities and internal state management helpers.
 */

import { subscriptionManager } from '../realtime/subscriptionManager';
import { errorMonitor } from '../../lib/errorMonitoring';
import { logger } from '../../services/LoggingService';
import type {
  ScoringConflict,
  CollaborativeScore,
  JudgeActivity,
  JudgeSession,
} from './collaborative-judging-types';
import { getSeverityLevel } from './collaborative-judging-utils';

/**
 * Broadcast a scoring conflict to all participants
 */
export async function broadcastConflict(
  channelName: string,
  conflict: ScoringConflict,
  showId: string,
  classId: string
): Promise<void> {
  try {
    await subscriptionManager.broadcast(channelName, {
      type: 'scoring-conflict',
      payload: conflict,
      metadata: { priority: 'critical', timestamp: Date.now() },
    });
  } catch (error) {
    errorMonitor.captureError(error as Error, {
      additionalData: { conflict, showId, classId },
    });
  }
}

/**
 * Broadcast conflict resolution to all participants
 */
export async function broadcastConflictResolution(
  channelName: string,
  conflict: ScoringConflict,
  showId: string,
  classId: string
): Promise<void> {
  try {
    await subscriptionManager.broadcast(channelName, {
      type: 'conflict-resolved',
      payload: conflict,
      metadata: { priority: 'high', timestamp: Date.now() },
    });
  } catch (error) {
    errorMonitor.captureError(error as Error, {
      additionalData: { conflict, showId, classId },
    });
  }
}

/**
 * Broadcast a conflict discussion note
 */
export async function broadcastConflictDiscussion(
  channelName: string,
  conflictId: string,
  discussionNote: ScoringConflict['discussionNotes'][0],
  showId: string,
  classId: string
): Promise<void> {
  try {
    await subscriptionManager.broadcast(channelName, {
      type: 'conflict-discussion',
      payload: { conflictId, discussionNote },
      metadata: { priority: 'medium', timestamp: Date.now() },
    });
  } catch (error) {
    errorMonitor.captureError(error as Error, {
      additionalData: { conflictId, discussionNote, showId, classId },
    });
  }
}

/**
 * Broadcast judge activity update
 */
export async function broadcastJudgeActivity(
  channelName: string,
  activity: JudgeActivity,
  showId: string,
  classId: string
): Promise<void> {
  try {
    await subscriptionManager.broadcast(channelName, {
      type: 'judge-activity',
      payload: activity,
      metadata: { priority: 'low', timestamp: Date.now() },
    });
  } catch (error) {
    errorMonitor.captureError(error as Error, {
      additionalData: { activity, showId, classId },
    });
  }
}

/**
 * Build a ScoringConflict object from a score comparison
 */
export function buildScoringConflict(
  entryId: string,
  classId: string,
  comparison: { judge1: CollaborativeScore; judge2: CollaborativeScore; difference: number },
  primaryJudge: string | null
): ScoringConflict {
  const conflictId = `conflict-${entryId}-${Date.now()}`;

  return {
    id: conflictId,
    entryId,
    dogId: comparison.judge1.dogId,
    armband: comparison.judge1.armband,
    classId,
    conflictType: 'score-difference',
    severity: getSeverityLevel(comparison.difference),
    judges: [
      {
        judgeId: comparison.judge1.judgeId,
        judgeName: comparison.judge1.judgeName,
        score: comparison.judge1,
        position: `Score: ${comparison.judge1.scoreData.points}`,
      },
      {
        judgeId: comparison.judge2.judgeId,
        judgeName: comparison.judge2.judgeName,
        score: comparison.judge2,
        position: `Score: ${comparison.judge2.scoreData.points}`,
      },
    ],
    primaryJudge: primaryJudge ?? undefined,
    detectedAt: new Date(),
    status: 'open',
    discussionNotes: [],
  };
}

/**
 * Safely invoke a set of listeners with error handling
 */
export function notifyListeners<T>(
  listeners: Set<(data: T) => void>,
  data: T,
  context: string
): void {
  listeners.forEach(listener => {
    try {
      listener(data);
    } catch (error) {
      logger.error(`Error in ${context} listener`, 'judging', {}, error as Error);
    }
  });
}

/**
 * Update activity status for idle judges
 */
export function updateActivityStatus(judgeActivities: Map<string, JudgeActivity>): void {
  const now = new Date();

  judgeActivities.forEach(activity => {
    const timeSinceUpdate = now.getTime() - activity.lastUpdate.getTime();
    if (timeSinceUpdate > 30000) {
      activity.activity = 'idle';
      activity.typing = false;
    }
  });
}

/**
 * Clean up inactive judge sessions
 */
export function cleanupInactiveSessions(
  judgeSessions: Map<string, JudgeSession>,
  timeoutMs: number
): void {
  const cutoff = new Date(Date.now() - timeoutMs);

  judgeSessions.forEach(session => {
    if (session.lastActivity < cutoff && session.status === 'active') {
      session.status = 'disconnected';
      logger.debug('Judge session marked as disconnected', 'judging', {
        judgeName: session.judgeName,
      });
    }
  });
}
