import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  getSessionsByJudge: vi.fn(() => []),
  getScoresByClass: vi.fn(() => []),
  getPendingSyncItems: vi.fn(() => []),
  forceSyncAll: vi.fn(),
  getSyncQueueStatus: vi.fn(() => ({ queued: 0, pending: 0, failed: 0 })),
}));

vi.mock('@/store/offlineScoringStore', () => ({
  useOfflineScoringStore: () => ({
    isOffline: false,
    getSessionsByJudge: mocks.getSessionsByJudge,
    getScoresByClass: mocks.getScoresByClass,
    getPendingSyncItems: mocks.getPendingSyncItems,
  }),
}));

vi.mock('@/services/scoring/OfflineScoringService', () => ({
  offlineScoringService: {
    forceSyncAll: mocks.forceSyncAll,
    getSyncQueueStatus: mocks.getSyncQueueStatus,
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), debug: vi.fn() },
}));

import JudgeSyncDashboard from './JudgeSyncDashboard';

describe('JudgeSyncDashboard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a lossless queue warning at the threshold', async () => {
    mocks.getSyncQueueStatus.mockReturnValue({ queued: 1000, pending: 1000, failed: 0 });

    const { user } = render(<JudgeSyncDashboard judgeId="judge-1" classId="class-1" />);

    await user.click(screen.getByRole('tab', { name: /Sync Status/ }));
    expect(await screen.findByText(/1,000 sync items are queued/)).toBeInTheDocument();
    expect(screen.getByText(/This warning does not discard queued items/)).toBeInTheDocument();
  });

  it('does not warn below the threshold', () => {
    mocks.getSyncQueueStatus.mockReturnValue({ queued: 999, pending: 999, failed: 0 });

    render(<JudgeSyncDashboard judgeId="judge-1" classId="class-1" />);

    expect(screen.queryByText(/sync items are queued/)).not.toBeInTheDocument();
  });
});
