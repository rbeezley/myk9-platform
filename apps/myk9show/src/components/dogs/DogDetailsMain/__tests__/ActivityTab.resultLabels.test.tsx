import { render, screen, within } from '@/test/utils/testUtils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityTab from '../ActivityTab';

const useEntriesByDogQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByDogQuery: useEntriesByDogQueryMock,
}));

function scoredRow(id: string, resultStatus: string, className: string) {
  return {
    id,
    entry_status: 'confirmed',
    is_scored: true,
    result_status: resultStatus,
    search_time_seconds: 43.21,
    final_placement: null,
    class_results_released_at: '2026-09-28T20:00:00Z',
    trial_id: 'trial-1',
    trial: { date: '2026-09-28', timezone: 'America/Chicago' },
    show: { id: 'show-1', name: 'Today Show', start_date: '2026-09-28' },
    class: { id: `class-${id}`, name: className },
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

function rowFor(className: string): HTMLElement {
  const row = screen.getByText(className).closest('div.flex.items-start');
  if (!(row instanceof HTMLElement)) throw new Error(`no result row for ${className}`);
  return row;
}

// MYK9-1011: the Recent results badge was a binary Q / NQ, so a disqualified,
// excused, absent or withdrawn run read as NQ on the dog's Overview.
describe('ActivityTab recent results labels (MYK9-1011)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T16:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('labels each result by its own status, never NQ for a run that was not an NQ', () => {
    mockRows([
      scoredRow('q', 'qualified', 'Container Novice A'),
      scoredRow('nq', 'nq', 'Interior Novice A'),
      scoredRow('dq', 'disqualified', 'Exterior Novice A'),
      scoredRow('ex', 'excused', 'Buried Novice A'),
      scoredRow('abs', 'absent', 'Vehicle Novice A'),
      scoredRow('wd', 'withdrawn', 'Handler Discrimination Novice A'),
    ]);
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);

    expect(within(rowFor('Container Novice A')).getByText('Q')).toBeInTheDocument();
    expect(within(rowFor('Interior Novice A')).getByText('NQ')).toBeInTheDocument();
    expect(within(rowFor('Exterior Novice A')).getByText('DQ')).toBeInTheDocument();
    expect(within(rowFor('Buried Novice A')).getByText('EX')).toBeInTheDocument();
    expect(within(rowFor('Vehicle Novice A')).getByText('ABS')).toBeInTheDocument();
    expect(within(rowFor('Handler Discrimination Novice A')).getByText('WD')).toBeInTheDocument();
    expect(screen.getAllByText('NQ')).toHaveLength(1);
  });

  it('counts only runs the dog started: absent and withdrawn are not runs', () => {
    mockRows([
      scoredRow('q', 'qualified', 'Container Novice A'),
      scoredRow('nq', 'nq', 'Interior Novice A'),
      scoredRow('dq', 'disqualified', 'Exterior Novice A'),
      scoredRow('ex', 'excused', 'Buried Novice A'),
      scoredRow('abs', 'absent', 'Vehicle Novice A'),
      scoredRow('wd', 'withdrawn', 'Handler Discrimination Novice A'),
    ]);
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);
    expect(screen.getByText('1/4 qualifying runs')).toBeInTheDocument();
  });

  it('shows no qualifying-run count when the dog never started a run', () => {
    mockRows([
      scoredRow('abs', 'absent', 'Vehicle Novice A'),
      scoredRow('wd', 'withdrawn', 'Handler Discrimination Novice A'),
    ]);
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);
    expect(screen.getByText('Recent results')).toBeInTheDocument();
    expect(screen.queryByText(/qualifying runs/)).not.toBeInTheDocument();
  });
});
