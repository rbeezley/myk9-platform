import { describe, it, expect, beforeEach } from 'vitest';
import { createScoringStore } from './scoringStore';
import type { CompetitionType } from '../types';

describe('scoringStore', () => {
  // Create a fresh store for each test to avoid state leakage
  let store: ReturnType<typeof createScoringStore>;

  beforeEach(() => {
    // Clear localStorage to prevent persist middleware from leaking state between tests
    localStorage.clear();
    store = createScoringStore();
  });

  describe('createScoringStore', () => {
    it('should create a store with correct initial state', () => {
      const state = store.getState();
      expect(state.currentSession).toBeNull();
      expect(state.isScoring).toBe(false);
      expect(state.lastScoredEntry).toBeNull();
    });

    it('should create independent store instances', () => {
      const store2 = createScoringStore();
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'judge1', 5);
      expect(store.getState().currentSession).not.toBeNull();
      expect(store2.getState().currentSession).toBeNull();
    });
  });

  describe('startScoringSession', () => {
    it('should start a session with provided parameters', () => {
      store.getState().startScoringSession(
        42,
        'Novice Container',
        'AKC_SCENT_WORK' as CompetitionType,
        'judge-abc',
        10
      );

      const state = store.getState();
      expect(state.isScoring).toBe(true);
      expect(state.currentSession).not.toBeNull();
      expect(state.currentSession!.classId).toBe(42);
      expect(state.currentSession!.className).toBe('Novice Container');
      expect(state.currentSession!.competitionType).toBe('AKC_SCENT_WORK');
      expect(state.currentSession!.judgeId).toBe('judge-abc');
      expect(state.currentSession!.totalEntries).toBe(10);
      expect(state.currentSession!.currentEntryIndex).toBe(0);
      expect(state.currentSession!.scores).toEqual([]);
      expect(state.currentSession!.startedAt).toBeDefined();
      expect(state.lastScoredEntry).toBeNull();
    });
  });

  describe('submitScore', () => {
    beforeEach(() => {
      store.getState().startScoringSession(1, 'Test Class', 'AKC_SCENT_WORK', 'judge1', 5);
    });

    it('should add a score to the session', () => {
      store.getState().submitScore({
        entryId: 101,
        armband: 201,
        qualifying: 'Q',
        time: '1:23.45',
      });

      const state = store.getState();
      expect(state.currentSession!.scores).toHaveLength(1);
      expect(state.currentSession!.scores[0]!.entryId).toBe(101);
      expect(state.currentSession!.scores[0]!.armband).toBe(201);
      expect(state.currentSession!.scores[0]!.qualifying).toBe('Q');
      expect(state.currentSession!.scores[0]!.syncStatus).toBe('pending');
      expect(state.currentSession!.scores[0]!.scoredAt).toBeDefined();
    });

    it('should update lastScoredEntry', () => {
      store.getState().submitScore({
        entryId: 101,
        armband: 201,
        qualifying: 'Q',
      });

      const state = store.getState();
      expect(state.lastScoredEntry).not.toBeNull();
      expect(state.lastScoredEntry!.entryId).toBe(101);
    });

    it('should append multiple scores', () => {
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });
      store.getState().submitScore({ entryId: 2, armband: 2, qualifying: 'NQ' });
      store.getState().submitScore({ entryId: 3, armband: 3, qualifying: 'ABS' });

      expect(store.getState().currentSession!.scores).toHaveLength(3);
    });

    it('should not add a score when there is no session', () => {
      // Clear localStorage so the new store doesn't rehydrate the session from persist
      localStorage.clear();
      const freshStore = createScoringStore();

      // Verify no session exists
      expect(freshStore.getState().currentSession).toBeNull();

      freshStore.getState().submitScore({
        entryId: 1,
        armband: 1,
        qualifying: 'Q',
      });

      // Session should still be null and no score added
      expect(freshStore.getState().currentSession).toBeNull();
      expect(freshStore.getState().lastScoredEntry).toBeNull();
    });
  });

  describe('updateScoreSync', () => {
    beforeEach(() => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);
      store.getState().submitScore({ entryId: 10, armband: 100, qualifying: 'Q' });
    });

    it('should update sync status to synced', () => {
      store.getState().updateScoreSync(10, 'synced');
      expect(store.getState().currentSession!.scores[0]!.syncStatus).toBe('synced');
    });

    it('should update sync status to error', () => {
      store.getState().updateScoreSync(10, 'error');
      expect(store.getState().currentSession!.scores[0]!.syncStatus).toBe('error');
    });

    it('should not modify scores with different entryId', () => {
      store.getState().submitScore({ entryId: 20, armband: 200, qualifying: 'NQ' });
      store.getState().updateScoreSync(10, 'synced');

      const scores = store.getState().currentSession!.scores;
      expect(scores[0]!.syncStatus).toBe('synced');
      expect(scores[1]!.syncStatus).toBe('pending');
    });
  });

  describe('undoLastScore', () => {
    beforeEach(() => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);
    });

    it('should remove the last score', () => {
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });
      store.getState().submitScore({ entryId: 2, armband: 2, qualifying: 'NQ' });

      store.getState().undoLastScore();

      const scores = store.getState().currentSession!.scores;
      expect(scores).toHaveLength(1);
      expect(scores[0]!.entryId).toBe(1);
    });

    it('should update lastScoredEntry to the previous score', () => {
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });
      store.getState().submitScore({ entryId: 2, armband: 2, qualifying: 'NQ' });

      store.getState().undoLastScore();

      expect(store.getState().lastScoredEntry!.entryId).toBe(1);
    });

    it('should set lastScoredEntry to null when no scores remain', () => {
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });
      store.getState().undoLastScore();

      expect(store.getState().lastScoredEntry).toBeNull();
    });

    it('should decrement currentEntryIndex', () => {
      store.getState().moveToNextEntry(); // index 1
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });
      store.getState().undoLastScore();

      expect(store.getState().currentSession!.currentEntryIndex).toBe(0);
    });

    it('should do nothing when there are no scores', () => {
      store.getState().undoLastScore();
      expect(store.getState().currentSession!.scores).toHaveLength(0);
    });

    it('should do nothing when there is no session', () => {
      // Use a fresh store - undoLastScore should not throw
      const freshStore = createScoringStore();
      freshStore.getState().undoLastScore();
      // lastScoredEntry should still be null
      expect(freshStore.getState().lastScoredEntry).toBeNull();
    });
  });

  describe('moveToNextEntry / moveToPreviousEntry', () => {
    beforeEach(() => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);
    });

    it('should increment currentEntryIndex', () => {
      store.getState().moveToNextEntry();
      expect(store.getState().currentSession!.currentEntryIndex).toBe(1);
    });

    it('should not exceed totalEntries - 1', () => {
      for (let i = 0; i < 10; i++) {
        store.getState().moveToNextEntry();
      }
      expect(store.getState().currentSession!.currentEntryIndex).toBe(4); // max is totalEntries - 1
    });

    it('should decrement currentEntryIndex', () => {
      store.getState().moveToNextEntry();
      store.getState().moveToNextEntry();
      store.getState().moveToPreviousEntry();
      expect(store.getState().currentSession!.currentEntryIndex).toBe(1);
    });

    it('should not go below 0', () => {
      store.getState().moveToPreviousEntry();
      expect(store.getState().currentSession!.currentEntryIndex).toBe(0);
    });
  });

  describe('endScoringSession', () => {
    it('should set isScoring to false but keep session data', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);
      store.getState().endScoringSession();

      const state = store.getState();
      expect(state.isScoring).toBe(false);
      expect(state.currentSession).not.toBeNull();
    });
  });

  describe('clearSession', () => {
    it('should reset all session state', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });
      store.getState().clearSession();

      const state = store.getState();
      expect(state.currentSession).toBeNull();
      expect(state.isScoring).toBe(false);
      expect(state.lastScoredEntry).toBeNull();
    });
  });
});
