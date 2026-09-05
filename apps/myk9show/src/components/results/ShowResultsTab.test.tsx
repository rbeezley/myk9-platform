import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ShowResultsTab } from './ShowResultsTab';
import { useShowResults } from '@/hooks/queries/useShowResults';
import { useShowStats } from '@/hooks/queries/useShowStats';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import type { StatsEntry } from '@/components/analytics/analytics-utils';

vi.mock('@/hooks/queries/useShowResults', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/queries/useShowResults')>(
    '@/hooks/queries/useShowResults'
  );
  return {
    ...actual,
    useShowResults: vi.fn(),
  };
});

vi.mock('@/hooks/queries/useShowStats', () => ({
  useShowStats: vi.fn(),
}));

vi.mock('@/hooks/queries/useShowJudges', () => ({
  useShowJudges: vi.fn(),
}));

const baseStatsEntry: StatsEntry = {
  id: 'entry-1',
  dogId: 'dog-1',
  dogCallName: 'Rex',
  showId: 'show-1',
  showName: 'Spring Trial',
  showDate: '2026-05-01',
  classId: 'class-1',
  className: 'Container Novice',
  classElement: 'Container',
  classLevel: 'Novice',
  resultText: 'pending',
  searchTimeSeconds: null,
  totalFaults: null,
  finalPlacement: null,
};

function mockResultsTab(statsEntries: StatsEntry[]) {
  vi.mocked(useShowResults).mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useShowResults>);
  vi.mocked(useShowStats).mockReturnValue({
    data: statsEntries,
  } as unknown as ReturnType<typeof useShowStats>);
  vi.mocked(useShowJudges).mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof useShowJudges>);
}

describe('ShowResultsTab empty-state clarity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains when entries exist but scoring has not posted yet', () => {
    mockResultsTab([{ ...baseStatsEntry, resultText: 'pending' }]);

    render(<ShowResultsTab showId="show-1" />);

    expect(screen.getByText('Scoring has not posted yet')).toBeInTheDocument();
    expect(
      screen.getByText(/This show has entries, but no scored runs are available yet/i)
    ).toBeInTheDocument();
  });

  it('explains when scoring exists but placements are still under review or unreleased', () => {
    mockResultsTab([
      {
        ...baseStatsEntry,
        resultText: 'Q',
        searchTimeSeconds: 42.3,
        finalPlacement: null,
      },
    ]);

    render(<ShowResultsTab showId="show-1" />);

    expect(screen.getByText('Placements are being reviewed')).toBeInTheDocument();
    expect(screen.getByText(/after the secretary releases them/i)).toBeInTheDocument();
  });
});
