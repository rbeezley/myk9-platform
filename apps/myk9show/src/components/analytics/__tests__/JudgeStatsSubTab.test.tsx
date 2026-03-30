import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { JudgeStatsSubTab } from '../JudgeStatsSubTab';
import type { StatsEntry } from '../analytics-utils';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;

vi.mock('@/hooks/queries/useShowJudges', () => ({
  useShowJudges: vi.fn(),
}));
vi.mock('@/hooks/queries/useJudgeShowStats', () => ({
  useJudgeShowStats: vi.fn(),
}));

import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { useJudgeShowStats } from '@/hooks/queries/useJudgeShowStats';
const mockUseShowJudges = vi.mocked(useShowJudges);
const mockUseJudgeShowStats = vi.mocked(useJudgeShowStats);

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
    trialDate: '2026-04-01',
    trialNumber: '1',
    ...overrides,
  };
}

describe('JudgeStatsSubTab', () => {
  it('shows empty state when no judges', () => {
    mockUseShowJudges.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShowJudges>);
    mockUseJudgeShowStats.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useJudgeShowStats>);

    render(<JudgeStatsSubTab showId="show-1" />);

    expect(screen.getByText('No Judge Assignments')).toBeInTheDocument();
  });

  it('renders judge dropdown when judges exist', () => {
    mockUseShowJudges.mockReturnValue({
      data: [
        { id: 'j1', name: 'Alice Smith' },
        { id: 'j2', name: 'Bob Jones' },
      ],
      isLoading: false,
    } as ReturnType<typeof useShowJudges>);
    mockUseJudgeShowStats.mockReturnValue({
      data: [makeEntry()],
      isLoading: false,
    } as ReturnType<typeof useJudgeShowStats>);

    render(<JudgeStatsSubTab showId="show-1" />);

    // The select element should have the first judge selected
    const select = screen.getByLabelText('Select judge');
    expect(select).toBeInTheDocument();
  });

  it('renders stats and class breakdown when judge has scored entries', () => {
    mockUseShowJudges.mockReturnValue({
      data: [{ id: 'j1', name: 'Alice Smith' }],
      isLoading: false,
    } as ReturnType<typeof useShowJudges>);
    mockUseJudgeShowStats.mockReturnValue({
      data: [
        makeEntry({ id: 'e1', resultText: 'Q', searchTimeSeconds: 35 }),
        makeEntry({ id: 'e2', dogId: 'd2', dogCallName: 'Bella', resultText: 'NQ' }),
      ],
      isLoading: false,
    } as ReturnType<typeof useJudgeShowStats>);

    render(<JudgeStatsSubTab showId="show-1" />);

    expect(screen.getAllByText('Entries').length).toBeGreaterThan(0);
    expect(screen.getByText('Class Performance')).toBeInTheDocument();
    expect(screen.getByText('Result Distribution')).toBeInTheDocument();
  });
});
