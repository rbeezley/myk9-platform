/**
 * MYK9-969 review: statistics computed over results some of which are hidden
 * from the viewer are wrong, not partial — a "fastest time" that is not the
 * fastest, a Q rate over a subset. Show Stats omits them instead.
 */
import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { ShowStatsSubTab } from '../ShowStatsSubTab';
import { hasWithheldResults, type StatsEntry } from '../analytics-utils';
import { mapRowToStatsEntry } from '@/hooks/queries/statsEntryMapper';

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

function row(overrides: Record<string, unknown>) {
  return mapRowToStatsEntry({
    id: 'e1',
    dog_id: 'd1',
    dog_call_name: 'Rex',
    show_id: 's1',
    class_id: 'c1',
    class_name: 'Container Novice',
    result_text: 'Q',
    is_scored: true,
    search_time_seconds: 40,
    total_faults: 0,
    final_placement: 2,
    ...overrides,
  });
}

describe('withheld results and statistics (MYK9-969)', () => {
  it('marks a scored row with no visible result as withheld, and nothing else', () => {
    expect(row({ result_text: null, search_time_seconds: null }).resultWithheld).toBe(true);
    expect(row({}).resultWithheld).toBe(false);
    expect(row({ is_scored: false, result_text: null }).resultWithheld).toBe(false);
  });

  it('hasWithheldResults is true when any entry is withheld', () => {
    const visible = row({});
    const hidden = row({ id: 'e2', result_text: null, search_time_seconds: null });
    expect(hasWithheldResults([visible])).toBe(false);
    expect(hasWithheldResults([visible, hidden])).toBe(true);
  });

  it('Show Stats omits the statistics instead of naming a wrong fastest time', () => {
    const entries: StatsEntry[] = [
      row({ id: 'e1', dog_call_name: 'Slowpoke', search_time_seconds: 40 }),
      row({ id: 'e2', dog_call_name: 'Hidden', result_text: null, search_time_seconds: null }),
    ];
    mockUseShowStats.mockReturnValue(fromPartial({ data: entries, isLoading: false }));

    render(<ShowStatsSubTab showId="s1" />);

    expect(screen.getByText('Statistics not shown')).toBeInTheDocument();
    expect(screen.queryByText('Slowpoke')).not.toBeInTheDocument();
  });

  it('Show Stats still renders when every scored result is visible', () => {
    mockUseShowStats.mockReturnValue(
      fromPartial({ data: [row({ dog_call_name: 'Rex' })], isLoading: false })
    );

    render(<ShowStatsSubTab showId="s1" />);

    expect(screen.queryByText('Statistics not shown')).not.toBeInTheDocument();
  });
});
