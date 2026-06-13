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

export function getSyncQueueStatus(queue: readonly SyncQueueItem[]): {
  pending: number;
  failed: number;
  lastSync?: Date;
} {
  const pending = queue.filter(item => (item.attempts || 0) < (item.attempts || 3)).length;
  const failed = queue.filter(item => (item.attempts || 0) >= (item.attempts || 3)).length;

  return { pending, failed };
}

export function retainSyncQueueItems(
  queue: readonly SyncQueueItem[],
  cutoff: Date
): SyncQueueItem[] {
  return queue.filter(
    item =>
      (item.attempts || 0) < (item.attempts || 3) ||
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
