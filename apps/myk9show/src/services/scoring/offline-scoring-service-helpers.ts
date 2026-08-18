import type {
  BaseScore,
  ConflictResolution,
  ScoringEvent,
  ScoringEventType,
  ScoringSession,
} from '@/types/scoring-types';
import type { SyncQueueItem } from '@/services/sync/types';

export function getOfflineScoreKey(entryId: string, classId: string, judgeId: string): string {
  return `${entryId}-${classId}-${judgeId}`;
}

export function findScoreForEntry(
  scores: Iterable<BaseScore>,
  entryId: string,
  classId: string,
  judgeId?: string
): BaseScore | null {
  if (judgeId) {
    for (const score of scores) {
      if (score.entryId === entryId && score.classId === classId && score.judgeId === judgeId) {
        return score;
      }
    }
    return null;
  }

  for (const score of scores) {
    if (score.entryId === entryId && score.classId === classId) {
      return score;
    }
  }

  return null;
}

export function findScoreById(scores: Iterable<BaseScore>, scoreId: string): BaseScore | null {
  for (const score of scores) {
    if (score.id === scoreId) {
      return score;
    }
  }
  return null;
}

export function getClassScoresFromCache(scores: Iterable<BaseScore>, classId: string): BaseScore[] {
  return Array.from(scores)
    .filter(score => score.classId === classId)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
}

export function getPendingScoresFromCache(scores: Iterable<BaseScore>): BaseScore[] {
  return Array.from(scores).filter(score => score.syncStatus === 'pending');
}

export function buildScoringEvent(
  type: ScoringEventType,
  data: Record<string, unknown>,
  timestamp: Date
): ScoringEvent {
  const eventIds = data as Record<string, string>;
  return {
    type,
    entryId: eventIds.entryId || '',
    classId: eventIds.classId || '',
    judgeId: eventIds.judgeId || '',
    timestamp,
    data,
  };
}

export function detectQualificationConflict(scores: readonly BaseScore[]): boolean {
  if (scores.length < 2) return false;

  const qualifications = scores.map(score => score.qualification);
  const uniqueQualifications = new Set(qualifications);

  return uniqueQualifications.size > 1;
}

export function buildConflictResolution(
  strategy: ConflictResolution['strategy'],
  resolvedAt: Date
): ConflictResolution {
  const resolution: ConflictResolution = {
    strategy,
    resolvedBy: 'system',
    resolvedAt,
    resolutionNotes: 'Automatic conflict resolution applied',
  };

  switch (strategy) {
    case 'average':
      return {
        ...resolution,
        resolutionNotes: 'Manual resolution required for qualification conflicts',
      };
    case 'judge_hierarchy':
      return {
        ...resolution,
        resolutionNotes: 'Head judge score takes precedence',
      };
    case 'head_judge_final':
      return {
        ...resolution,
        resolutionNotes: 'Marked for head judge final decision',
      };
    default:
      return {
        ...resolution,
        resolutionNotes: 'Manual override required',
      };
  }
}

interface BuildScoreSyncQueueItemOptions {
  id: string;
  scoreKey: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export function buildScoreSyncQueueItem({
  id,
  scoreKey,
  data,
  timestamp,
}: BuildScoreSyncQueueItemOptions): SyncQueueItem {
  return {
    id,
    entityType: 'entry',
    entityId: scoreKey,
    operation: 'update',
    data,
    priority: 'medium',
    timestamp,
    attempts: 0,
    retryCount: 0,
    status: 'pending',
  };
}

interface BuildDeletionSyncQueueItemOptions {
  id: string;
  scoreKey: string;
  entryId: string;
  classId: string;
  judgeId: string;
  timestamp: Date;
}

export function buildDeletionSyncQueueItem({
  id,
  scoreKey,
  entryId,
  classId,
  judgeId,
  timestamp,
}: BuildDeletionSyncQueueItemOptions): SyncQueueItem {
  return {
    id,
    entityType: 'entry',
    entityId: scoreKey,
    operation: 'delete',
    data: { entryId, classId, judgeId },
    priority: 'medium',
    timestamp,
    attempts: 0,
    retryCount: 0,
    status: 'pending',
  };
}

interface BuildSessionSyncQueueItemOptions {
  id: string;
  sessionId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export function buildSessionSyncQueueItem({
  id,
  sessionId,
  data,
  timestamp,
}: BuildSessionSyncQueueItemOptions): SyncQueueItem {
  return {
    id,
    entityType: 'entry',
    entityId: sessionId,
    operation: 'update',
    data,
    priority: 'medium',
    timestamp,
    attempts: 0,
    retryCount: 0,
    status: 'pending',
  };
}

/**
 * Retry budget for an offline sync queue item. `SyncQueueItem` carries no
 * per-item override, so the budget is uniform across the scoring queue.
 * Matches the retry ceilings used elsewhere in the sync layer
 * (`backgroundSyncService`, `BatchProcessor`).
 */
export const MAX_SYNC_ATTEMPTS = 3;

export const DEFAULT_SYNC_QUEUE_WARNING_THRESHOLD = 1000;

/** An item that has failed fewer than `MAX_SYNC_ATTEMPTS` times is still retriable. */
export function hasRetryBudget(item: SyncQueueItem): boolean {
  return (item.attempts || 0) < MAX_SYNC_ATTEMPTS;
}

export function shouldWarnForSyncQueue(
  queueLength: number,
  warningThreshold = DEFAULT_SYNC_QUEUE_WARNING_THRESHOLD
): boolean {
  return queueLength >= warningThreshold;
}

export function getSyncQueueStatus(queue: readonly SyncQueueItem[]): {
  queued: number;
  pending: number;
  failed: number;
  lastSync?: Date;
} {
  const pending = queue.filter(hasRetryBudget).length;
  const failed = queue.length - pending;

  return { queued: queue.length, pending, failed };
}

export function retainSyncQueueItems(
  queue: readonly SyncQueueItem[],
  cutoff: Date
): SyncQueueItem[] {
  // INTENT: an item is dropped only once it has BOTH exhausted its retry budget
  // and aged past the cutoff. A judge's score that still has retries left is never
  // discarded for merely being old — on show day, an unsynced score is the only
  // copy of that result. Do not "simplify" this to an age-only cutoff.
  return queue.filter(
    item =>
      hasRetryBudget(item) ||
      new Date((item as { timestamp: string | number | Date }).timestamp) > cutoff
  );
}

export function getOfflineScoringStatistics({
  cachedScores,
  sessions,
  pendingSyncItems,
}: {
  cachedScores: number;
  sessions: Iterable<ScoringSession>;
  pendingSyncItems: number;
}): {
  cachedScores: number;
  activeSessions: number;
  pendingSyncItems: number;
  totalScoresSubmitted: number;
} {
  return {
    cachedScores,
    activeSessions: Array.from(sessions).filter(session => session.status === 'active').length,
    pendingSyncItems,
    totalScoresSubmitted: cachedScores,
  };
}
