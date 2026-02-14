/**
 * Offline Scoring Serialization Helpers
 *
 * Pure functions for serializing and deserializing scoring data
 * (scores, multi-judge scores, and sessions) to/from JSON-safe formats.
 * Date fields are converted to ISO strings for storage and back to
 * Date objects on load.
 */

import type {
  BaseScore,
  MultiJudgeScore,
  ScoringSession,
  ConflictResolution
} from '@/types/scoring-types';

/**
 * Serialize a BaseScore for JSON storage.
 * Converts Date fields to ISO strings.
 */
export function serializeScore(score: BaseScore): Record<string, unknown> {
  return {
    ...score,
    timestamp: score.timestamp.toISOString(),
    recordedAt: score.recordedAt.toISOString(),
    lastModified: score.lastModified.toISOString()
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
    lastModified: new Date(scoreData.lastModified as string)
  } as BaseScore;
}

/**
 * Serialize a MultiJudgeScore for JSON storage.
 * Converts the judgeScores Map to a plain object and Date fields to ISO strings.
 */
export function serializeMultiJudgeScore(score: MultiJudgeScore): Record<string, unknown> {
  return {
    ...score,
    judgeScores: Object.fromEntries(score.judgeScores),
    lastUpdated: score.lastUpdated.toISOString(),
    conflictResolution: score.conflictResolution ? {
      ...score.conflictResolution,
      resolvedAt: score.conflictResolution.resolvedAt.toISOString()
    } : undefined
  };
}

/**
 * Deserialize stored data back into a MultiJudgeScore.
 * Converts plain objects back to Maps and ISO strings back to Date objects.
 */
export function deserializeMultiJudgeScore(data: unknown): MultiJudgeScore {
  const multiData = data as Record<string, unknown>;
  return {
    ...multiData,
    judgeScores: new Map(Object.entries(multiData.judgeScores || {} as Record<string, BaseScore>)),
    lastUpdated: new Date(multiData.lastUpdated as string),
    conflictResolution: multiData.conflictResolution ? {
      ...(multiData.conflictResolution as ConflictResolution),
      resolvedAt: new Date((multiData.conflictResolution as ConflictResolution).resolvedAt)
    } : undefined
  } as MultiJudgeScore;
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
    pendingSync: session.pendingSync.map(score => serializeScore(score))
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
    pendingSync: ((sessionData.pendingSync || []) as unknown[]).map((score) => deserializeScore(score))
  } as ScoringSession;
}
