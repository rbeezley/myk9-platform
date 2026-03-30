import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ShowStatsSubTab } from '../ShowStatsSubTab';
import type { StatsEntry } from '../analytics-utils';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;

vi.mock('@/hooks/queries/useShowStats', () => ({
  useShowStats: vi.fn(),
}));

import { useShowStats } from '@/hooks/queries/useShowStats';
const mockUseShowStats = vi.mocked(useShowStats);

function makeEntry(overrides: Partial<StatsEntry> = {}): StatsEntry {
  return {
    id: 'entry-1',
    dogId: 'dog-1',
    dogCallName: 'Rex',
    showId: 'show-1',
    showName: '',
    showDate: '',
    classId: 'class-1',
    className: 'Containers Novice',
    classElement: 'Containers',
    classLevel: 'Novice',
    resultText: 'Q',
    searchTimeSeconds: 42.5,
    totalFaults: 0,
    finalPlacement: 1,
    ...overrides,
  };
}

describe('ShowStatsSubTab', () => {
  it('shows skeleton while loading', () => {
    mockUseShowStats.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useShowStats>);

    render(<ShowStatsSubTab showId="show-1" />);

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when no scored entries', () => {
    mockUseShowStats.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShowStats>);

    render(<ShowStatsSubTab showId="show-1" />);

    expect(screen.getByText('No Scored Entries')).toBeInTheDocument();
  });

  it('renders all analytics sections when scored entries exist', () => {
    const entries: StatsEntry[] = [
      makeEntry({ id: 'e1', resultText: 'Q', searchTimeSeconds: 35 }),
      makeEntry({
        id: 'e2',
        dogId: 'd2',
        dogCallName: 'Bella',
        resultText: 'NQ',
        searchTimeSeconds: 55,
      }),
    ];

    mockUseShowStats.mockReturnValue({
      data: entries,
      isLoading: false,
    } as ReturnType<typeof useShowStats>);

    render(<ShowStatsSubTab showId="show-1" />);

    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('Result Distribution')).toBeInTheDocument();
    expect(screen.getByText('Performance by Dog')).toBeInTheDocument();
  });
});
