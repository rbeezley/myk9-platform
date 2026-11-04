import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import type { HospitalityPlanDay } from '@/features/lunch-orders/hospitalityPlan';
import type { ReportProps } from '@/lib/reports/types';
import { HospitalityPlanReport } from '../HospitalityPlanReport';

const trials: NonNullable<ReportProps['allTrials']> = [
  { id: 'sun', date: '2026-11-08', trialNumber: '2' },
  { id: 'sat', date: '2026-11-07', trialNumber: '1' },
];

const days: HospitalityPlanDay[] = [
  {
    trialId: 'sat',
    total: 3,
    roles: [
      { role: 'judge', label: 'Judge', count: 1, names: ['Ann Adams'] },
      { role: 'volunteer', label: 'Volunteer', count: 2, names: ['Vic Vance', 'Wes West'] },
    ],
    orders: [
      {
        key: 'p:j-ann',
        savedId: 'r1',
        personId: 'j-ann',
        name: 'Ann Adams',
        role: 'judge',
        lunchOrder: 'Chicken salad',
        dietaryNote: 'No nuts',
        assigned: true,
      },
    ],
  },
  { trialId: 'sun', total: 0, roles: [], orders: [] },
];

function renderReport(hospitalityPlan: ReportProps['hospitalityPlan']) {
  const props = {
    showId: 'show-1',
    showName: 'Fall Trial',
    entries: [],
    sortOrder: '',
    allTrials: trials,
    ...(hospitalityPlan ? { hospitalityPlan } : {}),
  } as ReportProps;
  return render(<HospitalityPlanReport {...props} />);
}

describe('HospitalityPlanReport', () => {
  it('prints one page per day in date order, with headcount, total, orders and notes', () => {
    renderReport({ data: days, isLoading: false, isError: false });

    const pages = screen.getAllByTestId(/^hospitality-day-/);
    expect(pages.map(p => p.getAttribute('data-testid'))).toEqual([
      'hospitality-day-sat',
      'hospitality-day-sun',
    ]);

    const sat = within(pages[0]!);
    expect(sat.getByText('Headcount: 3 people')).toBeInTheDocument();
    expect(sat.getByText('Vic Vance, Wes West')).toBeInTheDocument();
    expect(sat.getByText('Chicken salad')).toBeInTheDocument();
    expect(sat.getByText('No nuts')).toBeInTheDocument();
  });

  it('still prints a useful headcount when no one has a lunch order', () => {
    renderReport({ data: [{ ...days[0]!, orders: [] }], isLoading: false, isError: false });

    const sat = within(screen.getByTestId('hospitality-day-sat'));
    expect(sat.getByText('Ann Adams')).toBeInTheDocument();
    expect(sat.getByText('No lunch orders yet.')).toBeInTheDocument();
  });

  it('says so when a day has no one assigned', () => {
    renderReport({ data: days, isLoading: false, isError: false });

    expect(
      within(screen.getByTestId('hospitality-day-sun')).getByText(
        'No one is assigned to this day yet.'
      )
    ).toBeInTheDocument();
  });

  it('shows an error instead of an empty plan when the read failed', () => {
    renderReport({ data: [], isLoading: false, isError: true });

    expect(screen.getByText(/could not load/)).toBeInTheDocument();
  });
});
