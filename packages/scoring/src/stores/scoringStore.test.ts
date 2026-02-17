import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createScoringStore } from './scoringStore';
import type { CompetitionType, QualifyingResult, Score } from '../types';

describe('scoringStore', () => {
  // Create a fresh store for each test to avoid state leakage
  let store: ReturnType<typeof createScoringStore>;

  beforeEach(() => {
    // Clear localStorage to prevent persist middleware from leaking state between tests
    localStorage.clear();
    store = createScoringStore();
    // Silence console logs in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      store
        .getState()
        .startScoringSession(
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

  describe('Persistence & Rehydration', () => {
    it('should persist currentSession to localStorage', () => {
      store.getState().startScoringSession(1, 'Novice', 'AKC_SCENT_WORK', 'judge1', 10);
      store.getState().submitScore({ entryId: 101, armband: 201, qualifying: 'Q' });

      // Create a new store instance - should rehydrate from localStorage
      const newStore = createScoringStore();
      const state = newStore.getState();

      expect(state.currentSession).not.toBeNull();
      expect(state.currentSession!.classId).toBe(1);
      expect(state.currentSession!.scores).toHaveLength(1);
      expect(state.currentSession!.scores[0]!.entryId).toBe(101);
    });

    it('should persist lastScoredEntry to localStorage', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);
      store.getState().submitScore({ entryId: 42, armband: 100, qualifying: 'NQ' });

      const newStore = createScoringStore();
      const state = newStore.getState();

      expect(state.lastScoredEntry).not.toBeNull();
      expect(state.lastScoredEntry!.entryId).toBe(42);
    });

    it('should not persist isScoring flag', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);
      expect(store.getState().isScoring).toBe(true);

      // New store should not have isScoring = true (not persisted)
      const newStore = createScoringStore();
      expect(newStore.getState().isScoring).toBe(false);
    });

    it('should handle corrupted localStorage gracefully', () => {
      localStorage.setItem('myk9-scoring-storage', 'invalid-json{{{');

      // Should create a new store with default state
      const newStore = createScoringStore();
      const state = newStore.getState();

      expect(state.currentSession).toBeNull();
      expect(state.isScoring).toBe(false);
      expect(state.lastScoredEntry).toBeNull();
    });
  });

  describe('State Transitions & Invariants', () => {
    it('should maintain currentEntryIndex invariant after undoLastScore', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);

      // Move to index 2
      store.getState().moveToNextEntry();
      store.getState().moveToNextEntry();
      expect(store.getState().currentSession!.currentEntryIndex).toBe(2);

      // Submit score and undo
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });
      store.getState().undoLastScore();

      // Index should be decremented but not below 0
      expect(store.getState().currentSession!.currentEntryIndex).toBe(1);
    });

    it('should not allow negative currentEntryIndex', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);

      // Try to go before index 0
      for (let i = 0; i < 5; i++) {
        store.getState().moveToPreviousEntry();
      }

      expect(store.getState().currentSession!.currentEntryIndex).toBe(0);
    });

    it('should handle undo when currentEntryIndex is 0', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });
      store.getState().undoLastScore();

      expect(store.getState().currentSession!.currentEntryIndex).toBe(0);
    });

    it('should maintain scores array immutability', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);

      const score1: Omit<Score, 'scoredAt' | 'syncStatus'> = {
        entryId: 1,
        armband: 1,
        qualifying: 'Q',
      };

      store.getState().submitScore(score1);
      const firstScoresRef = store.getState().currentSession!.scores;

      store.getState().submitScore({ entryId: 2, armband: 2, qualifying: 'NQ' });
      const secondScoresRef = store.getState().currentSession!.scores;

      // References should be different (new array created)
      expect(firstScoresRef).not.toBe(secondScoresRef);
    });
  });

  describe('Complex Score Scenarios', () => {
    beforeEach(() => {
      store.getState().startScoringSession(1, 'Advanced', 'AKC_SCENT_WORK', 'j1', 10);
    });

    it('should handle scent work multi-area scores', () => {
      store.getState().submitScore({
        entryId: 101,
        armband: 201,
        qualifying: 'Q',
        time: '2:45.50',
        areas: {
          container: '0:45.10',
          interior: '1:02.30',
          exterior: '0:58.10',
        },
      });

      const score = store.getState().currentSession!.scores[0]!;
      expect(score.areas).toBeDefined();
      expect(score.areas!.container).toBe('0:45.10');
      expect(score.areas!.interior).toBe('1:02.30');
      expect(score.areas!.exterior).toBe('0:58.10');
    });

    it('should handle Fast CAT scores with health check', () => {
      store.getState().submitScore({
        entryId: 102,
        armband: 202,
        qualifying: 'Q',
        time: '6.23',
        mph: 28.95,
        healthCheckPassed: true,
      });

      const score = store.getState().currentSession!.scores[0]!;
      expect(score.healthCheckPassed).toBe(true);
      expect(score.mph).toBe(28.95);
    });

    it('should handle Rally scores with deductions', () => {
      store.getState().submitScore({
        entryId: 103,
        armband: 203,
        qualifying: 'Q',
        score: 97,
        deductions: 3,
        points: 97,
      });

      const score = store.getState().currentSession!.scores[0]!;
      expect(score.score).toBe(97);
      expect(score.deductions).toBe(3);
    });

    it('should handle Nationals scores with correct/incorrect counts', () => {
      store.getState().submitScore({
        entryId: 104,
        armband: 204,
        qualifying: 'Q',
        correctCount: 4,
        incorrectCount: 1,
        finishCallErrors: 0,
      });

      const score = store.getState().currentSession!.scores[0]!;
      expect(score.correctCount).toBe(4);
      expect(score.incorrectCount).toBe(1);
      expect(score.finishCallErrors).toBe(0);
    });

    it('should handle non-qualifying scores with reasons', () => {
      store.getState().submitScore({
        entryId: 105,
        armband: 205,
        qualifying: 'NQ',
        nonQualifyingReason: 'Exceeded maximum time',
        time: '3:15.00',
      });

      const score = store.getState().currentSession!.scores[0]!;
      expect(score.qualifying).toBe('NQ');
      expect(score.nonQualifyingReason).toBe('Exceeded maximum time');
    });

    it('should handle absent/withdrawn entries', () => {
      const absentScore: Omit<Score, 'scoredAt' | 'syncStatus'> = {
        entryId: 106,
        armband: 206,
        qualifying: 'ABS',
      };

      store.getState().submitScore(absentScore);
      const score = store.getState().currentSession!.scores[0]!;

      expect(score.qualifying).toBe('ABS');
      expect(score.syncStatus).toBe('pending');
    });
  });

  describe('Multi-Score Sync Management', () => {
    beforeEach(() => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 10);
    });

    it('should handle multiple pending scores', () => {
      for (let i = 1; i <= 5; i++) {
        store.getState().submitScore({
          entryId: i,
          armband: i + 100,
          qualifying: 'Q',
        });
      }

      const scores = store.getState().currentSession!.scores;
      expect(scores).toHaveLength(5);
      scores.forEach(score => {
        expect(score.syncStatus).toBe('pending');
      });
    });

    it('should update sync status for specific entry', () => {
      // Submit 3 scores
      store.getState().submitScore({ entryId: 1, armband: 101, qualifying: 'Q' });
      store.getState().submitScore({ entryId: 2, armband: 102, qualifying: 'NQ' });
      store.getState().submitScore({ entryId: 3, armband: 103, qualifying: 'Q' });

      // Mark entry 2 as synced
      store.getState().updateScoreSync(2, 'synced');

      const scores = store.getState().currentSession!.scores;
      expect(scores[0]!.syncStatus).toBe('pending');
      expect(scores[1]!.syncStatus).toBe('synced');
      expect(scores[2]!.syncStatus).toBe('pending');
    });

    it('should handle sync errors for specific entry', () => {
      store.getState().submitScore({ entryId: 1, armband: 101, qualifying: 'Q' });
      store.getState().updateScoreSync(1, 'error');

      expect(store.getState().currentSession!.scores[0]!.syncStatus).toBe('error');
    });

    it('should handle sync status update when no session exists', () => {
      localStorage.clear();
      const freshStore = createScoringStore();

      // Should not throw
      freshStore.getState().updateScoreSync(999, 'synced');
      expect(freshStore.getState().currentSession).toBeNull();
    });

    it('should handle sync status update for non-existent entry', () => {
      store.getState().submitScore({ entryId: 1, armband: 101, qualifying: 'Q' });

      // Update a different entry ID
      store.getState().updateScoreSync(999, 'synced');

      // Original score should still be pending
      expect(store.getState().currentSession!.scores[0]!.syncStatus).toBe('pending');
    });

    it('should handle multiple sync status updates for same entry', () => {
      store.getState().submitScore({ entryId: 1, armband: 101, qualifying: 'Q' });

      // pending -> synced -> error -> synced
      store.getState().updateScoreSync(1, 'synced');
      expect(store.getState().currentSession!.scores[0]!.syncStatus).toBe('synced');

      store.getState().updateScoreSync(1, 'error');
      expect(store.getState().currentSession!.scores[0]!.syncStatus).toBe('error');

      store.getState().updateScoreSync(1, 'synced');
      expect(store.getState().currentSession!.scores[0]!.syncStatus).toBe('synced');
    });
  });

  describe('Session Lifecycle Edge Cases', () => {
    it('should handle starting a new session while one is active', () => {
      // Start first session
      store.getState().startScoringSession(1, 'Class A', 'AKC_SCENT_WORK', 'judge1', 5);
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });

      // Start new session (should replace)
      store.getState().startScoringSession(2, 'Class B', 'UKC_RALLY', 'judge2', 10);

      const state = store.getState();
      expect(state.currentSession!.classId).toBe(2);
      expect(state.currentSession!.className).toBe('Class B');
      expect(state.currentSession!.competitionType).toBe('UKC_RALLY');
      expect(state.currentSession!.scores).toHaveLength(0);
      expect(state.lastScoredEntry).toBeNull();
    });

    it('should handle end session followed by clear session', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });

      store.getState().endScoringSession();
      expect(store.getState().isScoring).toBe(false);
      expect(store.getState().currentSession).not.toBeNull();

      store.getState().clearSession();
      expect(store.getState().currentSession).toBeNull();
    });

    it('should handle multiple calls to endScoringSession', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);

      store.getState().endScoringSession();
      store.getState().endScoringSession();
      store.getState().endScoringSession();

      expect(store.getState().isScoring).toBe(false);
      expect(store.getState().currentSession).not.toBeNull();
    });

    it('should handle multiple calls to clearSession', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);

      store.getState().clearSession();
      store.getState().clearSession();
      store.getState().clearSession();

      expect(store.getState().currentSession).toBeNull();
      expect(store.getState().isScoring).toBe(false);
    });

    it('should handle all competition types', () => {
      const competitionTypes: CompetitionType[] = [
        'UKC_OBEDIENCE',
        'UKC_RALLY',
        'UKC_NOSEWORK',
        'AKC_SCENT_WORK',
        'AKC_SCENT_WORK_NATIONAL',
        'AKC_FASTCAT',
        'ASCA_SCENT_DETECTION',
      ];

      competitionTypes.forEach(type => {
        localStorage.clear();
        const testStore = createScoringStore();

        testStore.getState().startScoringSession(1, 'Test', type, 'j1', 5);
        expect(testStore.getState().currentSession!.competitionType).toBe(type);
      });
    });
  });

  describe('Entry Navigation Edge Cases', () => {
    beforeEach(() => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 3);
    });

    it('should handle navigation with only 1 entry', () => {
      localStorage.clear();
      const singleEntryStore = createScoringStore();
      singleEntryStore.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 1);

      singleEntryStore.getState().moveToNextEntry();
      expect(singleEntryStore.getState().currentSession!.currentEntryIndex).toBe(0);

      singleEntryStore.getState().moveToPreviousEntry();
      expect(singleEntryStore.getState().currentSession!.currentEntryIndex).toBe(0);
    });

    it('should handle navigation when no session exists', () => {
      localStorage.clear();
      const freshStore = createScoringStore();

      // Should not throw
      freshStore.getState().moveToNextEntry();
      freshStore.getState().moveToPreviousEntry();

      expect(freshStore.getState().currentSession).toBeNull();
    });

    it('should handle rapid navigation', () => {
      // Rapidly move next
      for (let i = 0; i < 100; i++) {
        store.getState().moveToNextEntry();
      }
      expect(store.getState().currentSession!.currentEntryIndex).toBe(2); // max is 2 (totalEntries - 1)

      // Rapidly move previous
      for (let i = 0; i < 100; i++) {
        store.getState().moveToPreviousEntry();
      }
      expect(store.getState().currentSession!.currentEntryIndex).toBe(0);
    });

    it('should handle alternating navigation', () => {
      store.getState().moveToNextEntry();
      expect(store.getState().currentSession!.currentEntryIndex).toBe(1);

      store.getState().moveToPreviousEntry();
      expect(store.getState().currentSession!.currentEntryIndex).toBe(0);

      store.getState().moveToNextEntry();
      expect(store.getState().currentSession!.currentEntryIndex).toBe(1);

      store.getState().moveToNextEntry();
      expect(store.getState().currentSession!.currentEntryIndex).toBe(2);

      store.getState().moveToPreviousEntry();
      expect(store.getState().currentSession!.currentEntryIndex).toBe(1);
    });
  });

  describe('Timestamp Validation', () => {
    beforeEach(() => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);
    });

    it('should add scoredAt timestamp to submitted scores', () => {
      const beforeSubmit = new Date().toISOString();

      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });

      const afterSubmit = new Date().toISOString();
      const score = store.getState().currentSession!.scores[0]!;

      expect(score.scoredAt).toBeDefined();
      expect(score.scoredAt >= beforeSubmit).toBe(true);
      expect(score.scoredAt <= afterSubmit).toBe(true);
    });

    it('should add startedAt timestamp to new sessions', () => {
      const beforeStart = new Date().toISOString();

      localStorage.clear();
      const newStore = createScoringStore();
      newStore.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 5);

      const afterStart = new Date().toISOString();
      const session = newStore.getState().currentSession!;

      expect(session.startedAt).toBeDefined();
      expect(session.startedAt >= beforeStart).toBe(true);
      expect(session.startedAt <= afterStart).toBe(true);
    });

    it('should preserve scoredAt timestamp through sync updates', () => {
      store.getState().submitScore({ entryId: 1, armband: 1, qualifying: 'Q' });
      const originalTimestamp = store.getState().currentSession!.scores[0]!.scoredAt;

      store.getState().updateScoreSync(1, 'synced');

      const updatedTimestamp = store.getState().currentSession!.scores[0]!.scoredAt;
      expect(updatedTimestamp).toBe(originalTimestamp);
    });
  });

  describe('DevTools Integration', () => {
    it('should create store with devtools disabled by default', () => {
      const defaultStore = createScoringStore();
      expect(defaultStore).toBeDefined();
    });

    it('should create store with devtools enabled', () => {
      const devStore = createScoringStore(true);
      expect(devStore).toBeDefined();
    });

    it('should maintain independence between devtools and non-devtools stores', () => {
      localStorage.clear();

      const normalStore = createScoringStore(false);
      const devStore = createScoringStore(true);

      normalStore.getState().startScoringSession(1, 'Normal', 'AKC_SCENT_WORK', 'j1', 5);
      devStore.getState().startScoringSession(2, 'Dev', 'UKC_RALLY', 'j2', 10);

      expect(normalStore.getState().currentSession!.classId).toBe(1);
      expect(devStore.getState().currentSession!.classId).toBe(2);
    });
  });

  describe('Qualifying Result Variations', () => {
    beforeEach(() => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 10);
    });

    it('should handle all qualifying result codes', () => {
      const results: QualifyingResult[] = ['Q', 'NQ', 'EX', 'DQ', 'E', 'ABS', 'WD'];

      results.forEach((result, index) => {
        store.getState().submitScore({
          entryId: index + 1,
          armband: index + 100,
          qualifying: result,
        });
      });

      expect(store.getState().currentSession!.scores).toHaveLength(results.length);
    });

    it('should handle verbose qualifying results', () => {
      const verboseResults: QualifyingResult[] = [
        'Qualified',
        'Excused',
        'Withdrawn',
        'Eliminated',
        'Absent',
      ];

      verboseResults.forEach((result, index) => {
        store.getState().submitScore({
          entryId: index + 1,
          armband: index + 100,
          qualifying: result,
        });
      });

      expect(store.getState().currentSession!.scores).toHaveLength(verboseResults.length);
    });

    it('should handle null qualifying result', () => {
      store.getState().submitScore({
        entryId: 1,
        armband: 1,
        qualifying: null,
      });

      const score = store.getState().currentSession!.scores[0]!;
      expect(score.qualifying).toBeNull();
    });
  });

  describe('Large Session Scenarios', () => {
    it('should handle session with many entries', () => {
      store.getState().startScoringSession(1, 'Large Class', 'AKC_SCENT_WORK', 'j1', 100);

      for (let i = 1; i <= 50; i++) {
        store.getState().submitScore({
          entryId: i,
          armband: i + 1000,
          qualifying: i % 2 === 0 ? 'Q' : 'NQ',
          time: `${i}.00`,
        });
      }

      const session = store.getState().currentSession!;
      expect(session.scores).toHaveLength(50);
      expect(session.totalEntries).toBe(100);
    });

    it('should handle multiple undos in large session', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 20);

      // Add 10 scores
      for (let i = 1; i <= 10; i++) {
        store.getState().submitScore({ entryId: i, armband: i, qualifying: 'Q' });
      }

      // Undo 5 times
      for (let i = 0; i < 5; i++) {
        store.getState().undoLastScore();
      }

      expect(store.getState().currentSession!.scores).toHaveLength(5);
    });

    it('should handle score updates in large dataset', () => {
      store.getState().startScoringSession(1, 'Test', 'AKC_SCENT_WORK', 'j1', 50);

      // Add 30 scores
      for (let i = 1; i <= 30; i++) {
        store.getState().submitScore({ entryId: i, armband: i, qualifying: 'Q' });
      }

      // Update sync status for entry in the middle
      store.getState().updateScoreSync(15, 'synced');

      const scores = store.getState().currentSession!.scores;
      const targetScore = scores.find(s => s.entryId === 15);
      expect(targetScore!.syncStatus).toBe('synced');

      // All other scores should still be pending
      const pendingCount = scores.filter(s => s.syncStatus === 'pending').length;
      expect(pendingCount).toBe(29);
    });
  });
});
