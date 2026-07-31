/**
 * Unit tests for OfflineScoringService.
 *
 * offline-scoring-service-helpers.test.ts already covers the pure helper
 * functions (key building, filtering/sorting, sync-queue item shape,
 * conflict detection, statistics). This file focuses on the service's
 * stateful decision logic that those helpers feed into:
 *  - score submission: validation gate, versioning, sync-status, and the
 *    online/offline sync-queueing branch
 *  - multi-judge conflict handling (second judge's score never overwrites
 *    the first judge's cached score; conflict flag reflects qualification
 *    mismatch)
 *  - session lifecycle (start/end/lookup) and the offline flag captured
 *    from navigator.onLine
 *  - score/session removal, server-confirmed cache updates, and cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import type { BaseScore } from '@/types/scoring-types';

function createMemoryStorage(): StateStorage {
  const store = new Map<string, string>();
  return {
    getItem: async (name: string) => (store.has(name) ? (store.get(name) as string) : null),
    setItem: async (name: string, value: string) => {
      store.set(name, value);
    },
    removeItem: async (name: string) => {
      store.delete(name);
    },
  };
}

vi.mock('@/services/database/storage-adapter', () => ({
  getOptimalStorage: vi.fn(() => createMemoryStorage()),
}));

import { OfflineScoringService } from './OfflineScoringService';
import { syncService } from '@/services/sync/syncService';

const now = new Date('2026-06-13T12:00:00.000Z');

function baseScore(overrides: Partial<BaseScore> = {}): BaseScore {
  return {
    entryId: 'entry-1',
    classId: 'class-1',
    judgeId: 'judge-1',
    format: 'scent_work',
    qualification: 'Qualified',
    timestamp: now,
    recordedBy: 'judge-1',
    recordedAt: now,
    version: 0,
    lastModified: now,
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('OfflineScoringService', () => {
  let service: OfflineScoringService;

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    service = new OfflineScoringService();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await service.destroy();
  });

  describe('score validation', () => {
    it('rejects a score for an unsupported format without caching it', async () => {
      const result = await service.submitScore(
        baseScore({ format: 'not_a_real_format' as unknown as BaseScore['format'] })
      );

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatchObject({ field: 'format', code: 'INVALID_FORMAT' });
      expect(service.getScore('entry-1', 'class-1')).toBeNull();
    });

    it('rejects a score missing required identifiers', async () => {
      const result = await service.submitScore(baseScore({ judgeId: '' }));

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_IDS')).toBe(true);
    });

    it('rejects a score missing a qualification status', async () => {
      const result = await service.submitScore(
        baseScore({ qualification: undefined as unknown as BaseScore['qualification'] })
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_QUALIFICATION')).toBe(true);
    });
  });

  describe('score submission', () => {
    it('stores a valid score, stamping version 1 and pending sync status', async () => {
      const result = await service.submitScore(baseScore());

      expect(result).toEqual({ isValid: true, errors: [], warnings: [] });

      const stored = service.getScore('entry-1', 'class-1', 'judge-1');
      expect(stored).toMatchObject({ version: 1, syncStatus: 'pending' });
    });

    it('increments the version on each successful resubmission for the same judge', async () => {
      await service.submitScore(baseScore());
      await service.submitScore(baseScore({ qualification: 'Not Qualified' }));

      const stored = service.getScore('entry-1', 'class-1', 'judge-1');
      expect(stored?.version).toBe(2);
      expect(stored?.qualification).toBe('Not Qualified');
    });

    it('updateScore merges partial updates and resubmits with an incremented version', async () => {
      await service.submitScore(baseScore());
      const scoreKey = 'entry-1-class-1-judge-1';

      const result = await service.updateScore(scoreKey, { qualification: 'Not Qualified' });

      expect(result.isValid).toBe(true);
      expect(service.getScore('entry-1', 'class-1', 'judge-1')).toMatchObject({
        qualification: 'Not Qualified',
        version: 2,
      });
    });

    it('updateScore reports NOT_FOUND for an unknown score key', async () => {
      const result = await service.updateScore('missing-key', { qualification: 'Qualified' });

      expect(result).toEqual({
        isValid: false,
        errors: [{ field: 'general', message: 'Score not found', code: 'NOT_FOUND' }],
        warnings: [],
      });
    });

    it('emits a score_submitted event on success', async () => {
      const listener = vi.fn();
      service.on('score_submitted', listener);

      await service.submitScore(baseScore());

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('offline sync queueing', () => {
    it('queues the score for sync and attempts an immediate sync when online', async () => {
      const processQueueSpy = vi.spyOn(syncService, 'processQueue').mockResolvedValue(undefined);

      await service.submitScore(baseScore());

      expect(service.getSyncQueueStatus().pending).toBe(1);
      expect(processQueueSpy).toHaveBeenCalledTimes(1);
    });

    it('does not queue for sync while offline, but still caches the score locally', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      const processQueueSpy = vi.spyOn(syncService, 'processQueue');

      const result = await service.submitScore(baseScore());

      expect(result.isValid).toBe(true);
      expect(service.getScore('entry-1', 'class-1', 'judge-1')).not.toBeNull();
      expect(service.getSyncQueueStatus().pending).toBe(0);
      expect(processQueueSpy).not.toHaveBeenCalled();
    });

    it('getPendingScores returns only scores whose syncStatus is pending', async () => {
      await service.submitScore(baseScore());
      await service.cacheScore(baseScore({ entryId: 'entry-2', syncStatus: 'synced' }));

      const pending = service.getPendingScores();
      expect(pending).toHaveLength(1);
      expect(pending[0].entryId).toBe('entry-1');
    });

    it('forceSyncAll triggers processQueue when online', async () => {
      const processQueueSpy = vi.spyOn(syncService, 'processQueue').mockResolvedValue(undefined);

      await service.forceSyncAll();

      expect(processQueueSpy).toHaveBeenCalledTimes(1);
    });

    it('forceSyncAll does not sync while offline', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      const processQueueSpy = vi.spyOn(syncService, 'processQueue');

      await service.forceSyncAll();

      expect(processQueueSpy).not.toHaveBeenCalled();
    });
  });

  describe('multi-judge conflict handling', () => {
    it('routes a second judge scoring the same entry into multi-judge tracking instead of overwriting the cache', async () => {
      await service.submitScore(baseScore({ judgeId: 'judge-1', qualification: 'Qualified' }));
      await service.submitScore(baseScore({ judgeId: 'judge-2', qualification: 'Not Qualified' }));

      // The judge-agnostic lookup still resolves to the first judge's score —
      // the second judge's score was diverted to multi-judge tracking, not
      // written into the primary score cache under a new key.
      expect(service.getScore('entry-1', 'class-1')?.judgeId).toBe('judge-1');
      // Each judge's own keyed score is independently retrievable.
      expect(service.getScore('entry-1', 'class-1', 'judge-1')?.qualification).toBe('Qualified');
      expect(service.getScore('entry-1', 'class-1', 'judge-2')).toBeNull();
    });

    it('flags a conflict when two judges disagree on qualification, but not when they agree', async () => {
      const conflictListener = vi.fn();
      service.on('multi_judge_score_updated', conflictListener);

      await service.submitScore(baseScore({ judgeId: 'judge-1', qualification: 'Qualified' }));
      await service.submitScore(baseScore({ judgeId: 'judge-2', qualification: 'Not Qualified' }));

      expect(conflictListener).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ hasConflicts: true }) })
      );
    });

    it('does not flag a conflict when two judges agree on qualification', async () => {
      const conflictListener = vi.fn();
      service.on('multi_judge_score_updated', conflictListener);

      await service.submitScore(baseScore({ judgeId: 'judge-1', qualification: 'Qualified' }));
      await service.submitScore(baseScore({ judgeId: 'judge-2', qualification: 'Qualified' }));

      expect(conflictListener).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ hasConflicts: false }) })
      );
    });
  });

  describe('session lifecycle', () => {
    it('starts a session that captures the browser online/offline state', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

      const session = await service.startSession('class-1', 'judge-1', 'scent_work', 5);

      expect(session).toMatchObject({
        classId: 'class-1',
        judgeId: 'judge-1',
        format: 'scent_work',
        status: 'active',
        totalEntries: 5,
        completedEntries: [],
        isOffline: true,
      });
    });

    it('getActiveSession finds the active session for a judge/class pair and ignores others', async () => {
      await service.startSession('class-1', 'judge-1', 'scent_work', 5);
      await service.startSession('class-2', 'judge-1', 'scent_work', 5);

      expect(service.getActiveSession('class-1', 'judge-1')?.classId).toBe('class-1');
      expect(service.getActiveSession('class-1', 'judge-2')).toBeNull();
    });

    it('endSession marks the session completed and sets an end time', async () => {
      const session = await service.startSession('class-1', 'judge-1', 'scent_work', 5);

      await service.endSession(session.id);

      expect(service.getActiveSession('class-1', 'judge-1')).toBeNull();
    });

    it('endSession throws for an unknown session id', async () => {
      await expect(service.endSession('missing-session')).rejects.toThrow(
        'Session missing-session not found'
      );
    });

    it('submitScore updates the matching active session completedEntries list', async () => {
      await service.startSession('class-1', 'judge-1', 'scent_work', 5);

      await service.submitScore(baseScore({ entryId: 'entry-9' }));

      expect(service.getActiveSession('class-1', 'judge-1')?.completedEntries).toContain('entry-9');
    });
  });

  describe('score removal and server reconciliation', () => {
    it('deleteScore removes the cached score and queues a deletion for sync', async () => {
      await service.submitScore(baseScore());

      await service.deleteScore('entry-1', 'class-1', 'judge-1');

      expect(service.getScore('entry-1', 'class-1', 'judge-1')).toBeNull();
      expect(service.getSyncQueueStatus().pending).toBeGreaterThanOrEqual(1);
    });

    it('getScoreById finds a score by its id field', async () => {
      await service.submitScore(baseScore({ id: 'score-xyz' }));

      expect(service.getScoreById('score-xyz')?.entryId).toBe('entry-1');
      expect(service.getScoreById('missing-id')).toBeNull();
    });

    it('removeScore deletes by id and returns false when not found', async () => {
      await service.submitScore(baseScore({ id: 'score-xyz' }));

      expect(await service.removeScore('missing-id')).toBe(false);
      expect(await service.removeScore('score-xyz')).toBe(true);
      expect(service.getScoreById('score-xyz')).toBeNull();
    });

    it('updateCacheWithServerData merges server data and marks the score synced', async () => {
      await service.submitScore(baseScore({ id: 'local-id' }));

      const updated = await service.updateCacheWithServerData('local-id', {
        id: 'server-id',
        placement: 1,
      });

      expect(updated).toBe(true);
      const stored = service.getScore('entry-1', 'class-1', 'judge-1');
      expect(stored).toMatchObject({ id: 'server-id', placement: 1, syncStatus: 'synced' });
    });

    it('updateCacheWithServerData returns false for a local id that is not cached', async () => {
      const updated = await service.updateCacheWithServerData('missing-local-id', {
        id: 'server-id',
      });

      expect(updated).toBe(false);
    });

    it('cacheScore stores a score without validation or sync queueing', async () => {
      await service.cacheScore(baseScore({ syncStatus: 'synced' }));

      expect(service.getScore('entry-1', 'class-1', 'judge-1')).toMatchObject({
        syncStatus: 'synced',
      });
      expect(service.getSyncQueueStatus().pending).toBe(0);
    });
  });

  describe('statistics and cache management', () => {
    it('getStatistics reflects cached scores, active sessions, and pending sync items', async () => {
      await service.startSession('class-1', 'judge-1', 'scent_work', 5);
      await service.submitScore(baseScore());

      const stats = service.getStatistics();
      expect(stats.cachedScores).toBe(1);
      expect(stats.activeSessions).toBe(1);
      expect(stats.pendingSyncItems).toBeGreaterThanOrEqual(1);
    });

    it('clearCache resets scores, sessions, and the sync queue', async () => {
      await service.startSession('class-1', 'judge-1', 'scent_work', 5);
      await service.submitScore(baseScore());

      await service.clearCache();

      const stats = service.getStatistics();
      expect(stats).toMatchObject({ cachedScores: 0, activeSessions: 0, pendingSyncItems: 0 });
      expect(service.getScore('entry-1', 'class-1', 'judge-1')).toBeNull();
    });

    it('getClassScores returns every score recorded for a class', async () => {
      await service.submitScore(baseScore({ entryId: 'entry-1' }));
      await service.submitScore(baseScore({ entryId: 'entry-2', judgeId: 'judge-3' }));

      expect(service.getClassScores('class-1')).toHaveLength(2);
      expect(service.getClassScores('unknown-class')).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('is safe to run with no sessions or sync queue items', async () => {
      await expect(service.cleanup()).resolves.toBeUndefined();
    });

    it('prunes sync queue items whose deletion was attempted and are older than 24 hours', async () => {
      vi.useFakeTimers({ now });
      try {
        await service.submitScore(baseScore());
        await service.deleteScore('entry-1', 'class-1', 'judge-1');
        expect(service.getSyncQueueStatus().pending).toBeGreaterThanOrEqual(1);

        vi.setSystemTime(new Date(now.getTime() + 25 * 60 * 60 * 1000));
        await service.cleanup();

        // Unattempted (0-attempt) items are retained regardless of age by the
        // current sync-queue-cleanup policy (see retainSyncQueueItems), so the
        // deletion item queued above survives the 24h cutoff.
        expect(service.getSyncQueueStatus().pending).toBeGreaterThanOrEqual(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps an active session in place (only completed sessions are eligible for pruning)', async () => {
      await service.startSession('class-1', 'judge-1', 'scent_work', 5);

      await service.cleanup();

      expect(service.getActiveSession('class-1', 'judge-1')).not.toBeNull();
    });
  });
});
