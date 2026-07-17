import { describe, it, expect, beforeEach } from 'vitest';
import { useOfflineScoringStore, useCurrentScoringSession } from './offlineScoringStore';
import { renderHook } from '@testing-library/react';
import type { ScoringSession, JudgeScore } from '@/types/scoring-types';
import type { SyncQueueItem } from '@/services/sync/types';

function makeSession(overrides: Partial<ScoringSession> = {}): ScoringSession {
  return {
    id: 'session-1',
    classId: 'class-1',
    judgeId: 'judge-1',
    format: 'scent_work',
    status: 'active',
    startTime: new Date('2026-07-01T09:00:00.000Z'),
    totalEntries: 5,
    completedEntries: [],
    isOffline: false,
    pendingSync: [],
    ...overrides,
  };
}

function makeScore(overrides: Partial<JudgeScore> = {}): JudgeScore {
  const now = new Date('2026-07-01T10:00:00.000Z');
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
    syncStatus: 'pending',
    ...overrides,
  };
}

function makeSyncItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: 'sync-1',
    entityType: 'entry',
    actionType: 'update',
    entityId: 'entry-1',
    data: {},
    timestamp: new Date(),
    userId: 'user-1',
    retries: 0,
    priority: 5,
    scheduledFor: new Date(),
    status: 'pending',
    retryCount: 0,
    ...overrides,
  } as SyncQueueItem;
}

describe('useOfflineScoringStore', () => {
  beforeEach(() => {
    useOfflineScoringStore.getState().clearAllData();
  });

  it('createSession adds a session keyed by id', () => {
    const session = makeSession();
    useOfflineScoringStore.getState().createSession(session);

    expect(useOfflineScoringStore.getState().sessions['session-1']).toEqual(session);
  });

  it('updateSession merges updates into the existing session', () => {
    useOfflineScoringStore.getState().createSession(makeSession());
    useOfflineScoringStore.getState().updateSession('session-1', { status: 'paused' });

    expect(useOfflineScoringStore.getState().sessions['session-1'].status).toBe('paused');
    expect(useOfflineScoringStore.getState().sessions['session-1'].classId).toBe('class-1');
  });

  it('deleteSession removes the session', () => {
    useOfflineScoringStore.getState().createSession(makeSession());
    useOfflineScoringStore.getState().deleteSession('session-1');

    expect(useOfflineScoringStore.getState().sessions['session-1']).toBeUndefined();
  });

  it('addScore appends to the per-class score list', () => {
    useOfflineScoringStore.getState().addScore('class-1', makeScore());
    useOfflineScoringStore
      .getState()
      .addScore('class-1', makeScore({ id: 'score-2', entryId: 'entry-2' }));

    expect(useOfflineScoringStore.getState().scores['class-1']).toHaveLength(2);
  });

  it('updateScore updates a single score by id without touching others', () => {
    useOfflineScoringStore.getState().addScore('class-1', makeScore());
    useOfflineScoringStore
      .getState()
      .addScore('class-1', makeScore({ id: 'score-2', entryId: 'entry-2' }));

    useOfflineScoringStore
      .getState()
      .updateScore('class-1', 'score-1', { qualification: 'Not Qualified' });

    const scores = useOfflineScoringStore.getState().scores['class-1'];
    expect(scores.find(s => s.id === 'score-1')?.qualification).toBe('Not Qualified');
    expect(scores.find(s => s.id === 'score-2')?.qualification).toBe('Qualified');
  });

  it('deleteScore removes only the targeted score', () => {
    useOfflineScoringStore.getState().addScore('class-1', makeScore());
    useOfflineScoringStore
      .getState()
      .addScore('class-1', makeScore({ id: 'score-2', entryId: 'entry-2' }));

    useOfflineScoringStore.getState().deleteScore('class-1', 'score-1');

    const scores = useOfflineScoringStore.getState().scores['class-1'];
    expect(scores).toHaveLength(1);
    expect(scores[0].id).toBe('score-2');
  });

  it('sync queue: add / update / remove operate on individual items', () => {
    useOfflineScoringStore.getState().addToSyncQueue(makeSyncItem());
    expect(useOfflineScoringStore.getState().syncQueue).toHaveLength(1);

    useOfflineScoringStore.getState().updateSyncQueueItem('sync-1', { status: 'completed' });
    expect(useOfflineScoringStore.getState().syncQueue[0].status).toBe('completed');

    useOfflineScoringStore.getState().removeFromSyncQueue('sync-1');
    expect(useOfflineScoringStore.getState().syncQueue).toHaveLength(0);
  });

  it('getPendingSyncItems filters to pending status only', () => {
    useOfflineScoringStore.getState().addToSyncQueue(makeSyncItem({ id: 'a', status: 'pending' }));
    useOfflineScoringStore
      .getState()
      .addToSyncQueue(makeSyncItem({ id: 'b', status: 'completed' }));

    expect(
      useOfflineScoringStore
        .getState()
        .getPendingSyncItems()
        .map(i => i.id)
    ).toEqual(['a']);
  });

  it('getSessionsByJudge filters sessions to the given judge', () => {
    useOfflineScoringStore.getState().createSession(makeSession({ id: 's1', judgeId: 'judge-1' }));
    useOfflineScoringStore.getState().createSession(makeSession({ id: 's2', judgeId: 'judge-2' }));

    expect(
      useOfflineScoringStore
        .getState()
        .getSessionsByJudge('judge-1')
        .map(s => s.id)
    ).toEqual(['s1']);
  });

  it('startJudgingSession creates a new active session for the judge/class', () => {
    useOfflineScoringStore.getState().startJudgingSession('class-1', 'judge-1');

    const sessions = Object.values(useOfflineScoringStore.getState().sessions);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      classId: 'class-1',
      judgeId: 'judge-1',
      status: 'active',
      isActive: true,
    });
  });

  it('endJudgingSession marks the session completed and inactive', () => {
    useOfflineScoringStore.getState().createSession(makeSession());
    useOfflineScoringStore.getState().endJudgingSession('session-1');

    const session = useOfflineScoringStore.getState().sessions['session-1'];
    expect(session.status).toBe('completed');
    expect(session.isActive).toBe(false);
    expect(session.endTime).toBeInstanceOf(Date);
  });

  it('advanceWorkflowStep steps through the workflow in order and clamps at the end', () => {
    useOfflineScoringStore
      .getState()
      .createSession(makeSession({ workflowStep: 'setup' } as Partial<ScoringSession>));

    useOfflineScoringStore.getState().advanceWorkflowStep('session-1');
    expect(useOfflineScoringStore.getState().sessions['session-1'].workflowStep).toBe('entry_list');

    // Advance through the rest and confirm it clamps at "completed"
    for (let i = 0; i < 10; i++) {
      useOfflineScoringStore.getState().advanceWorkflowStep('session-1');
    }
    expect(useOfflineScoringStore.getState().sessions['session-1'].workflowStep).toBe('completed');
  });

  it('setCurrentEntry updates currentEntryId on the session', () => {
    useOfflineScoringStore.getState().createSession(makeSession());
    useOfflineScoringStore.getState().setCurrentEntry('session-1', 'entry-9');

    expect(useOfflineScoringStore.getState().sessions['session-1'].currentEntryId).toBe('entry-9');
  });

  it('getNextEntry returns the following entry in entryOrder, or null at the end / when missing', () => {
    useOfflineScoringStore.getState().setEntryOrder(['e1', 'e2', 'e3']);

    expect(useOfflineScoringStore.getState().getNextEntry('e1')).toBe('e2');
    expect(useOfflineScoringStore.getState().getNextEntry('e3')).toBeNull();
    expect(useOfflineScoringStore.getState().getNextEntry('not-in-order')).toBeNull();
  });

  it('getNextEntry returns null when entryOrder is empty', () => {
    expect(useOfflineScoringStore.getState().getNextEntry('e1')).toBeNull();
  });

  it('submitScore records the score and marks the entry completed on the active session', () => {
    useOfflineScoringStore.getState().createSession(makeSession({ status: 'active' }));
    useOfflineScoringStore.getState().submitScore('class-1', makeScore());

    expect(useOfflineScoringStore.getState().scores['class-1']).toHaveLength(1);
    expect(useOfflineScoringStore.getState().sessions['session-1'].completedEntries).toContain(
      'entry-1'
    );
  });

  it('submitScore does not duplicate an already-completed entry', () => {
    useOfflineScoringStore
      .getState()
      .createSession(makeSession({ status: 'active', completedEntries: ['entry-1'] }));
    useOfflineScoringStore.getState().submitScore('class-1', makeScore());

    expect(useOfflineScoringStore.getState().sessions['session-1'].completedEntries).toEqual([
      'entry-1',
    ]);
  });

  it('error and warnings: setError / addWarning / clearWarnings', () => {
    useOfflineScoringStore.getState().setError('sync failed');
    expect(useOfflineScoringStore.getState().error).toBe('sync failed');

    useOfflineScoringStore.getState().addWarning('warning one');
    useOfflineScoringStore.getState().addWarning('warning two');
    expect(useOfflineScoringStore.getState().warnings).toEqual(['warning one', 'warning two']);

    useOfflineScoringStore.getState().clearWarnings();
    expect(useOfflineScoringStore.getState().warnings).toEqual([]);
  });

  it('clearAllData resets the store to its initial state', () => {
    useOfflineScoringStore.getState().createSession(makeSession());
    useOfflineScoringStore.getState().addScore('class-1', makeScore());
    useOfflineScoringStore.getState().setError('oops');

    useOfflineScoringStore.getState().clearAllData();

    const state = useOfflineScoringStore.getState();
    expect(state.sessions).toEqual({});
    expect(state.scores).toEqual({});
    expect(state.syncQueue).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.warnings).toEqual([]);
  });

  describe('useCurrentScoringSession', () => {
    it('returns the active session, or null when none is active', () => {
      const { result, rerender } = renderHook(() => useCurrentScoringSession());
      expect(result.current).toBeNull();

      useOfflineScoringStore.getState().createSession(makeSession({ status: 'active' }));
      rerender();

      expect(result.current?.id).toBe('session-1');
    });
  });
});
