import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MyShowStatsTab } from '../MyShowStatsTab';
import type { StatsEntry } from '../analytics-utils';

// Mock ResizeObserver as a proper constructor for recharts ResponsiveContainer
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;

vi.mock('@/hooks/queries/useMyShowStats', () => ({
  useMyShowStats: vi.fn(),
}));

import { useMyShowStats } from '@/hooks/queries/useMyShowStats';
const mockUseMyShowStats = vi.mocked(useMyShowStats);

function makeMockEntry(overrides: Partial<StatsEntry> = {}): StatsEntry {
  return {
    id: 'entry-1',
    dogId: 'dog-1',
    dogCallName: 'Rex',
    showId: 'show-1',
    showName: 'Spring Trial',
    showDate: '2026-03-01',
    classId: 'class-1',
    className: 'Containers Excellent',
    classElement: 'Containers',
    classLevel: 'Excellent',
    resultText: 'Q',
    searchTimeSeconds: 42.5,
    totalFaults: 0,
    finalPlacement: 1,
    ...overrides,
  };
}

describe('MyShowStatsTab', () => {
  it('shows skeleton while loading', () => {
    mockUseMyShowStats.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useMyShowStats>);

    render(<MyShowStatsTab showId="show-1" />);

    // StatsSummaryCardsSkeleton renders StatCardSkeleton components with pulse animation
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when no scored entries', () => {
    mockUseMyShowStats.mockReturnValue({
      data: [makeMockEntry({ resultText: 'pending' })],
      isLoading: false,
    } as ReturnType<typeof useMyShowStats>);

    render(<MyShowStatsTab showId="show-1" />);

    expect(screen.getByText('No Results Yet')).toBeInTheDocument();
    expect(screen.getByText('Results will appear here once scoring begins.')).toBeInTheDocument();
  });

  it('shows empty state when entries array is empty', () => {
    mockUseMyShowStats.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useMyShowStats>);

    render(<MyShowStatsTab showId="show-1" />);

    expect(screen.getByText('No Results Yet')).toBeInTheDocument();
  });

  it('renders stats components when scored entries exist', () => {
    const entries: StatsEntry[] = [
      makeMockEntry({ id: 'e1', resultText: 'Q', searchTimeSeconds: 35 }),
      makeMockEntry({
        id: 'e2',
        dogId: 'dog-2',
        dogCallName: 'Bella',
        resultText: 'NQ',
        searchTimeSeconds: 55,
        classId: 'class-2',
        className: 'Interiors Novice',
        classElement: 'Interiors',
        classLevel: 'Novice',
      }),
      makeMockEntry({ id: 'e3', resultText: 'Q', searchTimeSeconds: 40 }),
    ];

    mockUseMyShowStats.mockReturnValue({
      data: entries,
      isLoading: false,
    } as ReturnType<typeof useMyShowStats>);

    render(<MyShowStatsTab showId="show-1" />);

    // StatsSummaryCards should render
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getAllByText('Q Rate').length).toBeGreaterThanOrEqual(1);

    // ResultDistributionChart
    expect(screen.getByText('Result Distribution')).toBeInTheDocument();

    // DogBreakdownCards
    expect(screen.getByText('Performance by Dog')).toBeInTheDocument();
    expect(screen.getAllByText('Rex').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bella').length).toBeGreaterThanOrEqual(1);

    // FastestTimesTable (Q entries with times exist)
    expect(screen.getByText('Fastest Times')).toBeInTheDocument();
  });

  it('hides FastestTimesTable when no qualified entries with times', () => {
    const entries: StatsEntry[] = [
      makeMockEntry({ id: 'e1', resultText: 'NQ', searchTimeSeconds: null }),
      makeMockEntry({ id: 'e2', resultText: 'NQ', searchTimeSeconds: null }),
    ];

    mockUseMyShowStats.mockReturnValue({
      data: entries,
      isLoading: false,
    } as ReturnType<typeof useMyShowStats>);

    render(<MyShowStatsTab showId="show-1" />);

    // Should still show summary cards (entries are scored)
    expect(screen.getByText('Entries')).toBeInTheDocument();

    // No fastest times
    expect(screen.queryByText('Fastest Times')).not.toBeInTheDocument();
  });
});
