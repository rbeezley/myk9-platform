import { render, screen } from '@/test/utils/testUtils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityTab from '../ActivityTab';

const useEntriesByDogQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByDogQuery: useEntriesByDogQueryMock,
}));

function scoredRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    entry_status: 'confirmed',
    is_scored: true,
    result_status: 'qualified',
    search_time_seconds: 43.21,
    final_placement: 1,
    class_results_released_at: '2026-09-28T20:00:00Z',
    trial_id: 'trial-1',
    trial: { date: '2026-09-28', timezone: 'America/Chicago' },
    show: { id: 'show-1', name: 'Today Show', start_date: '2026-09-28' },
    class: { id: 'class-1', name: 'Container Novice A' },
    ...overrides,
  };
}

function mockRows(rows: unknown[]) {
  useEntriesByDogQueryMock.mockReturnValue({
    data: { rows, verified: true, resultsVerified: true },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

describe('ActivityTab recent results fault count (MYK9-1108)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T16:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the fault count when a qualified run has faults', () => {
    mockRows([scoredRow({ total_faults: 2 })]);
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);
    expect(screen.getByText('2 faults')).toBeInTheDocument();
  });

  it('uses the singular for one fault', () => {
    mockRows([scoredRow({ total_faults: 1 })]);
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);
    expect(screen.getByText('1 fault')).toBeInTheDocument();
  });

  it('shows nothing for zero or withheld faults', () => {
    mockRows([
      scoredRow({ id: 'a', total_faults: 0 }),
      scoredRow({ id: 'b', total_faults: null }),
      scoredRow({ id: 'c' }),
    ]);
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);
    expect(screen.getByText('Recent results')).toBeInTheDocument();
    expect(screen.queryByText(/fault/)).not.toBeInTheDocument();
  });
});
