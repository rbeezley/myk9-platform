import { describe, it, expect } from 'vitest';
import {
  serializeScore,
  deserializeScore,
  serializeMultiJudgeScore,
  deserializeMultiJudgeScore,
  serializeSession,
  deserializeSession
} from './offline-scoring-serialization';
import type { BaseScore, MultiJudgeScore, ScoringSession } from '@/types/scoring-types';

function makeScore(overrides: Partial<BaseScore> = {}): BaseScore {
  return {
    id: 'score-1',
    entryId: 'entry-1',
    classId: 'class-1',
    showId: 'show-1',
    dogId: 'dog-1',
    judgeId: 'judge-1',
    format: 'regular' as BaseScore['format'],
    qualification: 'qualified' as BaseScore['qualification'],
    timestamp: new Date('2026-07-01T10:00:00.000Z'),
    points: 100,
    faults: 0,
    time: 45.2,
    placement: 1,
    judgeNotes: 'clean run',
    recordedBy: 'judge-1',
    recordedAt: new Date('2026-07-01T10:00:05.000Z'),
    isProvisional: false,
    placementCalculated: 1,
    version: 1,
    lastModified: new Date('2026-07-01T10:00:10.000Z'),
    syncStatus: 'pending',
    ...overrides
  };
}

describe('serializeScore / deserializeScore', () => {
  it('converts Date fields to ISO strings', () => {
    const score = makeScore();
    const serialized = serializeScore(score);

    expect(serialized.timestamp).toBe('2026-07-01T10:00:00.000Z');
    expect(serialized.recordedAt).toBe('2026-07-01T10:00:05.000Z');
    expect(serialized.lastModified).toBe('2026-07-01T10:00:10.000Z');
    expect(serialized.entryId).toBe('entry-1');
  });

  it('round-trips a score through serialize -> deserialize', () => {
    const score = makeScore();
    const roundTripped = deserializeScore(serializeScore(score));

    expect(roundTripped.timestamp).toBeInstanceOf(Date);
    expect(roundTripped.timestamp.toISOString()).toBe(score.timestamp.toISOString());
    expect(roundTripped.recordedAt.toISOString()).toBe(score.recordedAt.toISOString());
    expect(roundTripped.lastModified.toISOString()).toBe(score.lastModified.toISOString());
    expect(roundTripped.entryId).toBe(score.entryId);
    expect(roundTripped.placement).toBe(score.placement);
  });
});

describe('serializeMultiJudgeScore / deserializeMultiJudgeScore', () => {
  it('converts the judgeScores Map to a plain object', () => {
    const score1 = makeScore({ judgeId: 'judge-1' });
    const score2 = makeScore({ judgeId: 'judge-2', id: 'score-2' });
    const multiScore: MultiJudgeScore = {
      entryId: 'entry-1',
      classId: 'class-1',
      format: 'regular' as BaseScore['format'],
      judgeScores: new Map([
        ['judge-1', score1],
        ['judge-2', score2]
      ]),
      hasConflicts: false,
      lastUpdated: new Date('2026-07-01T11:00:00.000Z'),
      syncStatus: 'pending'
    };

    const serialized = serializeMultiJudgeScore(multiScore);

    expect(serialized.judgeScores).toEqual({ 'judge-1': score1, 'judge-2': score2 });
    expect(serialized.lastUpdated).toBe('2026-07-01T11:00:00.000Z');
    expect(serialized.conflictResolution).toBeUndefined();
  });

  it('serializes conflictResolution.resolvedAt when present', () => {
    const multiScore: MultiJudgeScore = {
      entryId: 'entry-1',
      classId: 'class-1',
      format: 'regular' as BaseScore['format'],
      judgeScores: new Map([['judge-1', makeScore()]]),
      hasConflicts: true,
      conflictResolution: {
        strategy: 'average',
        resolvedBy: 'head-judge-1',
        resolvedAt: new Date('2026-07-01T12:00:00.000Z')
      },
      lastUpdated: new Date('2026-07-01T11:00:00.000Z'),
      syncStatus: 'conflict'
    };

    const serialized = serializeMultiJudgeScore(multiScore);
    const conflictResolution = serialized.conflictResolution as Record<string, unknown>;

    expect(conflictResolution.resolvedAt).toBe('2026-07-01T12:00:00.000Z');
    expect(conflictResolution.strategy).toBe('average');
  });

  it('round-trips judgeScores Map through serialize -> deserialize', () => {
    const multiScore: MultiJudgeScore = {
      entryId: 'entry-1',
      classId: 'class-1',
      format: 'regular' as BaseScore['format'],
      judgeScores: new Map([['judge-1', makeScore()]]),
      hasConflicts: false,
      lastUpdated: new Date('2026-07-01T11:00:00.000Z'),
      syncStatus: 'pending'
    };

    const roundTripped = deserializeMultiJudgeScore(serializeMultiJudgeScore(multiScore));

    expect(roundTripped.judgeScores).toBeInstanceOf(Map);
    expect(roundTripped.judgeScores.get('judge-1')?.entryId).toBe('entry-1');
    expect(roundTripped.lastUpdated).toBeInstanceOf(Date);
  });

  it('handles missing judgeScores by defaulting to an empty Map on deserialize', () => {
    const roundTripped = deserializeMultiJudgeScore({
      entryId: 'entry-1',
      classId: 'class-1',
      lastUpdated: '2026-07-01T11:00:00.000Z'
    });

    expect(roundTripped.judgeScores).toBeInstanceOf(Map);
    expect(roundTripped.judgeScores.size).toBe(0);
  });
});

describe('serializeSession / deserializeSession', () => {
  function makeSession(overrides: Partial<ScoringSession> = {}): ScoringSession {
    return {
      id: 'session-1',
      classId: 'class-1',
      judgeId: 'judge-1',
      format: 'regular' as BaseScore['format'],
      status: 'active',
      startTime: new Date('2026-07-01T09:00:00.000Z'),
      totalEntries: 5,
      completedEntries: ['entry-1'],
      isOffline: true,
      pendingSync: [makeScore()],
      ...overrides
    };
  }

  it('serializes startTime and pendingSync scores', () => {
    const session = makeSession();
    const serialized = serializeSession(session);

    expect(serialized.startTime).toBe('2026-07-01T09:00:00.000Z');
    expect(serialized.endTime).toBeUndefined();
    expect(serialized.lastSyncAt).toBeUndefined();
    expect((serialized.pendingSync as Record<string, unknown>[])[0].timestamp).toBe(
      '2026-07-01T10:00:00.000Z'
    );
  });

  it('serializes optional endTime and lastSyncAt when present', () => {
    const session = makeSession({
      endTime: new Date('2026-07-01T13:00:00.000Z'),
      lastSyncAt: new Date('2026-07-01T13:05:00.000Z')
    });

    const serialized = serializeSession(session);

    expect(serialized.endTime).toBe('2026-07-01T13:00:00.000Z');
    expect(serialized.lastSyncAt).toBe('2026-07-01T13:05:00.000Z');
  });

  it('round-trips a session through serialize -> deserialize', () => {
    const session = makeSession({
      endTime: new Date('2026-07-01T13:00:00.000Z'),
      lastSyncAt: new Date('2026-07-01T13:05:00.000Z')
    });

    const roundTripped = deserializeSession(serializeSession(session));

    expect(roundTripped.startTime).toBeInstanceOf(Date);
    expect(roundTripped.endTime).toBeInstanceOf(Date);
    expect(roundTripped.lastSyncAt).toBeInstanceOf(Date);
    expect(roundTripped.pendingSync).toHaveLength(1);
    expect(roundTripped.pendingSync[0].timestamp).toBeInstanceOf(Date);
    expect(roundTripped.id).toBe('session-1');
  });

  it('defaults pendingSync to an empty array when missing', () => {
    const roundTripped = deserializeSession({
      id: 'session-2',
      startTime: '2026-07-01T09:00:00.000Z'
    });

    expect(roundTripped.pendingSync).toEqual([]);
  });
});
