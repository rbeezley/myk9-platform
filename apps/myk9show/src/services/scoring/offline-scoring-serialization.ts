/**
 * Offline Scoring Serialization Helpers
 *
 * Pure functions for serializing and deserializing scoring data
 * (scores and sessions) to/from JSON-safe formats.
 * Date fields are converted to ISO strings for storage and back to
 * Date objects on load.
 */

import type { BaseScore, ScoringSession } from '@/types/scoring-types';

/**
 * Serialize a BaseScore for JSON storage.
 * Converts Date fields to ISO strings.
 */
export function serializeScore(score: BaseScore): Record<string, unknown> {
  return {
    ...score,
    timestamp: score.timestamp.toISOString(),
    recordedAt: score.recordedAt.toISOString(),
    lastModified: score.lastModified.toISOString(),
  };
}

/**
 * Deserialize stored data back into a BaseScore.
 * Converts ISO string fields back to Date objects.
 */
export function deserializeScore(data: unknown): BaseScore {
  const scoreData = data as Record<string, unknown>;
  return {
    ...scoreData,
    timestamp: new Date(scoreData.timestamp as string),
    recordedAt: new Date(scoreData.recordedAt as string),
    lastModified: new Date(scoreData.lastModified as string),
  } as BaseScore;
}

/**
 * Serialize a ScoringSession for JSON storage.
 * Converts Date fields to ISO strings and serializes pendingSync scores.
 */
export function serializeSession(session: ScoringSession): Record<string, unknown> {
  return {
    ...session,
    startTime: session.startTime.toISOString(),
    endTime: session.endTime?.toISOString(),
    lastSyncAt: session.lastSyncAt?.toISOString(),
    pendingSync: session.pendingSync.map(score => serializeScore(score)),
  };
}

/**
 * Deserialize stored data back into a ScoringSession.
 * Converts ISO strings back to Date objects and deserializes pendingSync scores.
 */
export function deserializeSession(data: unknown): ScoringSession {
  const sessionData = data as Record<string, unknown>;
  return {
    ...sessionData,
    startTime: new Date(sessionData.startTime as string),
    endTime: sessionData.endTime ? new Date(sessionData.endTime as string) : undefined,
    lastSyncAt: sessionData.lastSyncAt ? new Date(sessionData.lastSyncAt as string) : undefined,
    pendingSync: ((sessionData.pendingSync || []) as unknown[]).map(score =>
      deserializeScore(score)
    ),
  } as ScoringSession;
}
