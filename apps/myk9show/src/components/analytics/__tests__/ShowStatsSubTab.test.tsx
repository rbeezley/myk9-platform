import { render } from '@/test/utils/testUtils';
import { screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { ShowStatsSubTab } from '../ShowStatsSubTab';
import type { StatsEntry } from '../analytics-utils';
import { fromPartial } from '@total-typescript/shoehorn';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;

vi.mock('@/hooks/queries/useShowStats', () => ({
  useShowStats: vi.fn(),
}));

vi.mock('@/hooks/queries/useShowJudges', () => ({
  useShowJudges: vi.fn(() => ({ data: [{ id: 'j1', name: 'Ann Judge' }] })),
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
    mockUseShowStats.mockReturnValue(
      fromPartial({
        data: [],
        isLoading: false,
      })
    );

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

  describe('filters and breed chart (MYK9-1512)', () => {
    const manyEntries = Array.from({ length: 25 }, (_, i) =>
      makeEntry({
        id: `e${i}`,
        dogId: `d${i}`,
        dogCallName: `Dog${i}`,
        searchTimeSeconds: 30 + i,
        breed: i < 20 ? 'Beagle' : 'Lab',
        classElement: i < 20 ? 'Interior' : 'Exterior',
        judgeIds: i < 20 ? ['j1'] : [],
      })
    );

    function mockEntries(data: StatsEntry[]) {
      mockUseShowStats.mockReturnValue({ data, isLoading: false } as ReturnType<
        typeof useShowStats
      >);
    }

    it('shows the breed performance chart and the Filter button', () => {
      mockEntries(manyEntries);
      render(<ShowStatsSubTab showId="show-1" />);

      expect(screen.getByText('Breed Performance')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Filter/ })).toBeInTheDocument();
    });

    it('lists the 20 fastest times, not 10', () => {
      mockEntries(manyEntries);
      render(<ShowStatsSubTab showId="show-1" />);

      const table = screen.getByRole('table', { name: /fastest/i });
      expect(within(table).getAllByRole('row')).toHaveLength(21); // header + 20
    });

    it.each([
      ['breed=Lab', 5],
      ['element=Exterior', 5],
      ['judge=j1', 20],
    ])('narrows from the URL (%s)', (query, count) => {
      mockEntries(manyEntries);
      render(<ShowStatsSubTab showId="show-1" />, { initialRoute: `/?${query}` });

      const table = screen.getByRole('table', { name: /fastest/i });
      expect(within(table).getAllByRole('row')).toHaveLength(Math.min(count, 20) + 1);
    });

    it('offers a way out when a filter matches nothing scored', async () => {
      mockEntries(manyEntries);
      const { user } = render(<ShowStatsSubTab showId="show-1" />, {
        initialRoute: '/?breed=Poodle',
      });

      expect(screen.getByText('No scored entries match')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(screen.getByText('Breed Performance')).toBeInTheDocument();
    });

    it('still shows the withheld notice when a filter would hide the withheld row', () => {
      mockEntries([...manyEntries, makeEntry({ id: 'w', breed: 'Poodle', resultWithheld: true })]);
      render(<ShowStatsSubTab showId="show-1" />, { initialRoute: '/?breed=Lab' });

      expect(screen.queryByText('Breed Performance')).not.toBeInTheDocument();
      expect(screen.queryByRole('table', { name: /fastest/i })).not.toBeInTheDocument();
    });
  });

  it('renders stats without the judge filter and offers a retry when the lookup failed', async () => {
    const refetch = vi.fn();
    mockUseShowStats.mockReturnValue(
      fromPartial({
        data: [makeEntry()],
        isLoading: false,
        judgeLookupFailed: true,
        refetch,
      })
    );

    const { user } = render(<ShowStatsSubTab showId="show-1" />);

    expect(screen.getByText(/Judge filter unavailable, try again/)).toBeInTheDocument();
    expect(screen.getAllByText('Rex').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
