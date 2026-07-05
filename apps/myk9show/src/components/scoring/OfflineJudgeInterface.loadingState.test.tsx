import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';
import { OfflineJudgeInterface } from './OfflineJudgeInterface';

const startJudgingSession = vi.hoisted(() => vi.fn());

vi.mock('@/store/offlineScoringStore', () => ({
  useJudgeAuth: () => ({
    judgeId: 'judge-1',
    judgeName: 'Judge Judy',
    isAuthenticated: true,
  }),
  useCurrentScoringSession: () => null,
  useClassScoring: () => [],
  useSyncStatus: () => ({
    isOnline: true,
    processingCount: 0,
    failedCount: 0,
    pendingCount: 0,
  }),
  useOfflineScoringStore: () => ({
    startJudgingSession,
    endJudgingSession: vi.fn(),
    advanceWorkflowStep: vi.fn(),
    getNextEntry: vi.fn(),
    submitScore: vi.fn(),
    setError: vi.fn(),
    setEntryOrder: vi.fn(),
    setCurrentEntry: vi.fn(),
    getPendingSyncItems: vi.fn(() => []),
    updateSyncQueueItem: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByClassQuery: () => ({ data: [] }),
}));

vi.mock('@/services/mappers/scoringMappers', () => ({
  mapDbEntryToUnifiedEntry: vi.fn(),
}));

describe('OfflineJudgeInterface loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startJudgingSession.mockImplementation(() => new Promise(() => {}));
  });

  it('uses a skeleton, not a spinner, while the offline judge session starts', async () => {
    render(
      <Routes>
        <Route
          path="/shows/:showId/trials/:trialId/classes/:classId/judge"
          element={<OfflineJudgeInterface />}
        />
      </Routes>,
      { initialRoute: '/shows/show-1/trials/trial-1/classes/class-1/judge' }
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Judging Session' }));

    expect(
      await screen.findByRole('status', { name: 'Loading offline judge workflow' })
    ).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });
});
