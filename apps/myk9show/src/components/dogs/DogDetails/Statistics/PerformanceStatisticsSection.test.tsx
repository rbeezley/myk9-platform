import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import PerformanceStatisticsSection from './PerformanceStatisticsSection';
import type { PerformanceStats } from '@/services/performanceStatsEngine';

vi.mock('@/hooks/usePerformanceStatistics', () => ({
  usePerformanceStatistics: vi.fn(),
}));

import { usePerformanceStatistics } from '@/hooks/usePerformanceStatistics';

const mockedUseStats = vi.mocked(usePerformanceStatistics);

function mockStats(overrides: Partial<ReturnType<typeof usePerformanceStatistics>>) {
  mockedUseStats.mockReturnValue({
    stats: null,
    isLoading: false,
    isError: false,
    unreleasedCount: 0,
    refetch: vi.fn(),
    ...overrides,
  });
}

const emptyOverall = {
  qualified: 0,
  nq: 0,
  absent: 0,
  excused: 0,
  withdrawn: 0,
  disqualified: 0,
  total: 0,
  qRate: 0,
};

function makeStats(overrides: Partial<PerformanceStats> = {}): PerformanceStats {
  return {
    overall: {
      qualified: 2,
      nq: 0,
      absent: 0,
      excused: 0,
      withdrawn: 0,
      disqualified: 0,
      total: 2,
      qRate: 100,
    },
    byElement: [],
    byLevel: [],
    byJudge: [],
    timeline: [],
    summary: {
      totalCompetitions: 2,
      fastestTime: null,
      avgTime: null,
      firstDate: '2026-01-01',
      latestDate: '2026-02-01',
    },
    ...overrides,
  };
}

describe('PerformanceStatisticsSection', () => {
  it('shows a loading state', () => {
    mockStats({ isLoading: true });
    render(<PerformanceStatisticsSection dogId="dog-1" />);
    expect(
      screen.getByRole('status', { name: /loading performance statistics/i })
    ).toBeInTheDocument();
  });

  it('shows a non-blaming error with Retry that triggers refetch', () => {
    const refetch = vi.fn();
    mockStats({ isError: true, refetch });
    render(<PerformanceStatisticsSection dogId="dog-1" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/couldn.?t load performance statistics/i);
    expect(alert.textContent?.toLowerCase()).not.toMatch(/you (did|caused|made)/);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows feature-specific empty guidance with no demonstration data when there are no scored results', () => {
    mockStats({ stats: makeStats({ overall: emptyOverall }) });
    render(<PerformanceStatisticsSection dogId="dog-1" />);

    expect(screen.getByText(/no scored results yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  it('renders populated state derived only from the mocked hook data (source-grounded)', () => {
    mockStats({ stats: makeStats() });
    render(<PerformanceStatisticsSection dogId="dog-1" />);

    expect(screen.queryByText(/no scored results yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows disqualifications as their own DQ series, not folded into NQ (MYK9-1011)', () => {
    mockStats({
      stats: makeStats({
        overall: {
          qualified: 1,
          nq: 0,
          absent: 0,
          excused: 0,
          withdrawn: 0,
          disqualified: 2,
          total: 3,
          qRate: 33,
        },
      }),
    });
    render(<PerformanceStatisticsSection dogId="dog-1" />);

    expect(screen.getByText('Disqualified (DQ): 2')).toBeInTheDocument();
    expect(screen.queryByText(/^NQ: /)).not.toBeInTheDocument();
  });

  it('says results are waiting, not "No scored results yet", when every result is preliminary', () => {
    mockStats({ stats: makeStats({ overall: emptyOverall }), unreleasedCount: 2 });
    render(<PerformanceStatisticsSection dogId="dog-1" />);
    expect(screen.queryByText(/no scored results yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(
      screen.getByText(/2 results are waiting for the secretary to release them/i)
    ).toBeInTheDocument();
  });

  it('shows stats plus the waiting line when some results are preliminary', () => {
    mockStats({ stats: makeStats(), unreleasedCount: 2 });
    render(<PerformanceStatisticsSection dogId="dog-1" />);
    expect(
      screen.getByText(/2 results are waiting for the secretary to release them/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/no scored results yet/i)).not.toBeInTheDocument();
  });

  it('uses the singular for one waiting result', () => {
    mockStats({ stats: makeStats(), unreleasedCount: 1 });
    render(<PerformanceStatisticsSection dogId="dog-1" />);
    expect(
      screen.getByText(/1 result is waiting for the secretary to release it/i)
    ).toBeInTheDocument();
  });

  it('shows no waiting line when every result is released', () => {
    mockStats({ stats: makeStats(), unreleasedCount: 0 });
    render(<PerformanceStatisticsSection dogId="dog-1" />);
    expect(screen.queryByText(/waiting for the secretary/i)).not.toBeInTheDocument();
  });
});
