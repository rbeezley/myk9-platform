import { describe, expect, it } from 'vitest';
import type { BaseScore, ScoringEventType, ScoringSession } from '@/types/scoring-types';
import type { SyncQueueItem } from '@/services/sync/types';
import {
  buildDeletionSyncQueueItem,
  buildConflictResolution,
  buildScoreSyncQueueItem,
  buildScoringEvent,
  buildSessionSyncQueueItem,
  detectQualificationConflict,
  findScoreById,
  findScoreForEntry,
  getClassScoresFromCache,
  getOfflineScoreKey,
  getOfflineScoringStatistics,
  getPendingScoresFromCache,
  getSyncQueueStatus,
  MAX_SYNC_ATTEMPTS,
  retainSyncQueueItems,
  shouldWarnForSyncQueue,
} from './offline-scoring-service-helpers';

const now = new Date('2026-06-13T12:00:00.000Z');

function score(overrides: Partial<BaseScore> = {}): BaseScore {
  return {
    id: 'score-1',
    entryId: 'entry-1',
    classId: 'class-1',
    judgeId: 'judge-1',
    format: 'scent_work',
    qualification: 'Qualified',
    timestamp: now,
    recordedBy: 'judge-1',
    recordedAt: now,
    version: 1,
    lastModified: now,
    syncStatus: 'synced',
    ...overrides,
  };
}

function session(overrides: Partial<ScoringSession> = {}): ScoringSession {
  return {
    id: 'session-1',
    classId: 'class-1',
    judgeId: 'judge-1',
    format: 'scent_work',
    status: 'active',
    startTime: now,
    totalEntries: 3,
    completedEntries: [],
    isOffline: false,
    pendingSync: [],
    ...overrides,
  };
}

function queueItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: 'queue-1',
    entityType: 'entry',
    entityId: 'entity-1',
    operation: 'update',
    data: {},
    priority: 'medium',
    timestamp: now,
    attempts: 0,
    retryCount: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('offline scoring service helpers', () => {
  it('builds the existing offline score composite key format', () => {
    expect(getOfflineScoreKey('entry-1', 'class-1', 'judge-1')).toBe('entry-1-class-1-judge-1');
  });

  it('finds an exact judge score or falls back to any entry/class score', () => {
    const scores = [
      score({ id: 'score-1', judgeId: 'judge-a' }),
      score({ id: 'score-2', judgeId: 'judge-b' }),
      score({ id: 'score-3', entryId: 'other-entry', judgeId: 'judge-b' }),
    ];

    expect(findScoreForEntry(scores, 'entry-1', 'class-1', 'judge-b')?.id).toBe('score-2');
    expect(findScoreForEntry(scores, 'entry-1', 'class-1')?.id).toBe('score-1');
    expect(findScoreForEntry(scores, 'missing', 'class-1')).toBeNull();
  });

  it('finds scores by id', () => {
    const scores = [score({ id: 'score-a' }), score({ id: 'score-b' })];

    expect(findScoreById(scores, 'score-b')?.id).toBe('score-b');
    expect(findScoreById(scores, 'score-c')).toBeNull();
  });

  it('filters class scores and sorts by recorded time', () => {
    const early = score({
      id: 'early',
      recordedAt: new Date('2026-06-13T10:00:00.000Z'),
    });
    const late = score({
      id: 'late',
      recordedAt: new Date('2026-06-13T11:00:00.000Z'),
    });
    const otherClass = score({
      id: 'other-class',
      classId: 'class-2',
      recordedAt: new Date('2026-06-13T09:00:00.000Z'),
    });

    expect(getClassScoresFromCache([late, otherClass, early], 'class-1').map(s => s.id)).toEqual([
      'early',
      'late',
    ]);
  });

  it('returns only pending scores', () => {
    const pending = score({ id: 'pending', syncStatus: 'pending' });
    const synced = score({ id: 'synced', syncStatus: 'synced' });
    const conflict = score({ id: 'conflict', syncStatus: 'conflict' });

    expect(getPendingScoresFromCache([synced, pending, conflict])).toEqual([pending]);
  });

  it('builds scoring events with existing empty identifier fallbacks', () => {
    const event = buildScoringEvent(
      'score_submitted' satisfies ScoringEventType,
      { entryId: 'entry-1', score: { id: 'score-1' } },
      now
    );

    expect(event).toMatchObject({
      type: 'score_submitted',
      entryId: 'entry-1',
      classId: '',
      judgeId: '',
      timestamp: now,
      data: { entryId: 'entry-1', score: { id: 'score-1' } },
    });
  });

  it('detects multi-judge qualification conflicts', () => {
    expect(
      detectQualificationConflict([
        score({ judgeId: 'judge-a', qualification: 'Qualified' }),
        score({ judgeId: 'judge-b', qualification: 'Not Qualified' }),
      ])
    ).toBe(true);

    expect(
      detectQualificationConflict([
        score({ judgeId: 'judge-a', qualification: 'Qualified' }),
        score({ judgeId: 'judge-b', qualification: 'Qualified' }),
      ])
    ).toBe(false);

    expect(detectQualificationConflict([score()])).toBe(false);
  });

  it('builds conflict resolution notes for each configured strategy', () => {
    expect(buildConflictResolution('average', now)).toMatchObject({
      strategy: 'average',
      resolvedBy: 'system',
      resolvedAt: now,
      resolutionNotes: 'Manual resolution required for qualification conflicts',
    });
    expect(buildConflictResolution('judge_hierarchy', now).resolutionNotes).toBe(
      'Head judge score takes precedence'
    );
    expect(buildConflictResolution('head_judge_final', now).resolutionNotes).toBe(
      'Marked for head judge final decision'
    );
    expect(buildConflictResolution('manual_override', now).resolutionNotes).toBe(
      'Manual override required'
    );
  });

  it('builds score, delete, and session sync queue items', () => {
    expect(
      buildScoreSyncQueueItem({
        id: 'queue-score',
        scoreKey: 'entry-1-class-1-judge-1',
        data: { id: 'score-1' },
        timestamp: now,
      })
    ).toEqual({
      id: 'queue-score',
      entityType: 'entry',
      entityId: 'entry-1-class-1-judge-1',
      operation: 'update',
      data: { id: 'score-1' },
      priority: 'medium',
      timestamp: now,
      attempts: 0,
      retryCount: 0,
      status: 'pending',
    });

    expect(
      buildDeletionSyncQueueItem({
        id: 'queue-delete',
        scoreKey: 'entry-1-class-1-judge-1',
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        timestamp: now,
      })
    ).toMatchObject({
      id: 'queue-delete',
      entityType: 'entry',
      entityId: 'entry-1-class-1-judge-1',
      operation: 'delete',
      data: { entryId: 'entry-1', classId: 'class-1', judgeId: 'judge-1' },
      status: 'pending',
    });

    expect(
      buildSessionSyncQueueItem({
        id: 'queue-session',
        sessionId: 'session-1',
        data: { id: 'session-1' },
        timestamp: now,
      })
    ).toMatchObject({
      id: 'queue-session',
      entityType: 'entry',
      entityId: 'session-1',
      operation: 'update',
      data: { id: 'session-1' },
      status: 'pending',
    });
  });

  it('counts items with retry budget as pending and exhausted items as failed', () => {
    expect(
      getSyncQueueStatus([
        queueItem({ id: 'unattempted', attempts: 0 }),
        queueItem({ id: 'mid-retry', attempts: 1 }),
        queueItem({ id: 'last-chance', attempts: 2 }),
        queueItem({ id: 'exhausted', attempts: 3 }),
        queueItem({ id: 'over-exhausted', attempts: 5 }),
      ])
    ).toEqual({ queued: 5, pending: 3, failed: 2 });
  });

  it('warns when the pending queue reaches the configured threshold', () => {
    expect(shouldWarnForSyncQueue(999, 1000)).toBe(false);
    expect(shouldWarnForSyncQueue(1000, 1000)).toBe(true);
    expect(shouldWarnForSyncQueue(1001, 1000)).toBe(true);
  });

  it('drops queue items only once they are both retry-exhausted and past the cutoff', () => {
    const cutoff = new Date('2026-06-13T12:00:00.000Z');
    const old = new Date('2026-06-13T10:00:00.000Z');
    const fresh = new Date('2026-06-13T13:00:00.000Z');

    // Never attempted: kept regardless of age — an unsynced judge score is the only copy.
    const oldUnattempted = queueItem({ id: 'old-unattempted', attempts: 0, timestamp: old });
    // Retries remaining: kept despite being old (this regressed before MAX_SYNC_ATTEMPTS).
    const oldMidRetry = queueItem({ id: 'old-mid-retry', attempts: 1, timestamp: old });
    // Exhausted but fresh: kept, still inside the cutoff window.
    const freshExhausted = queueItem({ id: 'fresh-exhausted', attempts: 3, timestamp: fresh });
    // Exhausted and old: the only prunable shape.
    const oldExhausted = queueItem({ id: 'old-exhausted', attempts: 3, timestamp: old });

    expect(
      retainSyncQueueItems([oldUnattempted, oldMidRetry, freshExhausted, oldExhausted], cutoff)
    ).toEqual([oldUnattempted, oldMidRetry, freshExhausted]);
  });

  it('bounds queue growth: a queue of exhausted, aged items prunes to empty', () => {
    const cutoff = new Date('2026-06-13T12:00:00.000Z');
    const old = new Date('2026-06-13T10:00:00.000Z');

    const exhausted = Array.from({ length: 50 }, (_, i) =>
      queueItem({ id: `exhausted-${i}`, attempts: MAX_SYNC_ATTEMPTS, timestamp: old })
    );

    expect(retainSyncQueueItems(exhausted, cutoff)).toEqual([]);
  });

  it('calculates offline scoring statistics', () => {
    expect(
      getOfflineScoringStatistics({
        cachedScores: 4,
        sessions: [
          session({ id: 'active', status: 'active' }),
          session({ id: 'completed', status: 'completed' }),
        ],
        pendingSyncItems: 2,
      })
    ).toEqual({
      cachedScores: 4,
      activeSessions: 1,
      pendingSyncItems: 2,
      totalScoresSubmitted: 4,
    });
  });
});
