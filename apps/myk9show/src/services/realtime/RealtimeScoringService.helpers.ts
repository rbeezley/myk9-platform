import type { BaseScore, Score, ScoringConflict } from '@/types/scoring-types';
import { generateId } from '@/utils/idUtils';
import { offlineScoringService } from '../scoring/OfflineScoringService';
import { syncQueue } from '../sync/SyncQueue';
import type { PresenceState } from './RealtimeScoringService.types';

/**
 * Parse a raw presence record into a typed PresenceState.
 */
export function parsePresenceRecord(presence: Record<string, unknown>): PresenceState {
  return {
    judgeId: (presence.judgeId || presence.judge_id) as string,
    judgeName: (presence.judgeName || presence.judge_name) as string,
    classId: (presence.classId || presence.class_id) as string,
    lastActivity: new Date((presence.lastActivity || presence.last_activity) as string),
    status: (presence.status as PresenceState['status']) || 'active',
  };
}

/**
 * Detect a scoring conflict between two score versions.
 *
 * Returns a `ScoringConflict` if the scores were modified by different judges
 * within a short time window (5 seconds), otherwise `null`.
 */
export function detectScoringConflict(newScore: Score, oldScore: Score): ScoringConflict | null {
  const timeDiff =
    new Date(newScore.lastModified).getTime() - new Date(oldScore.lastModified).getTime();

  if (timeDiff < 5000 && newScore.judgeId !== oldScore.judgeId) {
    return {
      id: `conflict-${newScore.id}-${Date.now()}`,
      entryId: newScore.entryId,
      classId: newScore.classId,
      conflictType: 'judge_conflict',
      details: {
        oldJudge: oldScore.judgeId,
        newJudge: newScore.judgeId,
        timeDiff,
      },
      timestamp: new Date(),
      resolved: false,
    };
  }

  return null;
}

/**
 * Build presence states from a raw Supabase presence state object.
 */
export function buildPresenceStates(
  state: Record<string, unknown[]> | undefined
): Map<string, PresenceState> {
  const presenceStates = new Map<string, PresenceState>();

  if (state) {
    Object.entries(state).forEach(([, presences]: [string, unknown[]]) => {
      if (Array.isArray(presences)) {
        presences.forEach(presence => {
          const presenceData = presence as Record<string, unknown>;
          const presenceState = parsePresenceRecord(presenceData);
          presenceStates.set(presenceState.judgeId, presenceState);
        });
      }
    });
  }

  return presenceStates;
}

/** Default realtime configuration values. */
export const DEFAULT_REALTIME_CONFIG = {
  throttleMs: 300,
  debounceMs: 500,
  reconnectAttempts: 5,
  reconnectDelay: 2000,
} as const;

// ========================================
// Score CRUD Helpers
// ========================================

/**
 * Create a local score object with a generated ID and pending sync status.
 */
export function createLocalScore(score: Omit<Score, 'id' | 'created_at' | 'updated_at'>): Score {
  const localId = generateId();
  return {
    id: localId,
    ...score,
    version: 1,
    syncStatus: 'pending',
    lastModified: new Date(),
  } as Score;
}

/**
 * Build an updated score object from an existing score and partial updates.
 */
export function buildUpdatedScore(scoreId: string, updates: Partial<Score>): Score {
  const existingScore = offlineScoringService.getScoreById(scoreId);
  return {
    ...(existingScore || {}),
    id: scoreId,
    ...updates,
    version: (existingScore?.version || 0) + 1,
    syncStatus: 'pending',
    lastModified: new Date(),
  } as Score;
}

/**
 * Cache a score locally and enqueue it for sync.
 */
export async function cacheAndEnqueueScore(
  score: Score,
  actionType: 'create' | 'update'
): Promise<void> {
  await offlineScoringService.cacheScore(score as BaseScore);

  syncQueue.enqueue({
    entityType: 'entry',
    actionType,
    entityId: score.entryId,
    data: score as unknown as Record<string, unknown>,
    priority: 5,
    userId: score.recordedBy || 'unknown',
    retries: 0,
    scheduledFor: new Date(),
  });
}

/**
 * Remove a score from cache and enqueue a deletion for sync.
 */
export async function removeAndEnqueueDeletion(scoreId: string): Promise<boolean> {
  const existingScore = offlineScoringService.getScoreById(scoreId);

  if (!existingScore) return false;

  await offlineScoringService.removeScore(scoreId);

  syncQueue.enqueue({
    entityType: 'entry',
    actionType: 'delete',
    entityId: existingScore.entryId,
    data: {
      entryId: existingScore.entryId,
      classId: existingScore.classId,
      judgeId: existingScore.judgeId,
    },
    priority: 5,
    userId: existingScore.recordedBy || 'unknown',
    retries: 0,
    scheduledFor: new Date(),
  });

  return true;
}

/**
 * Resume the sync queue if the device is online.
 */
export function resumeSyncIfOnline(isConnected: boolean): void {
  if (isConnected && navigator.onLine) {
    syncQueue.resume();
  }
}
