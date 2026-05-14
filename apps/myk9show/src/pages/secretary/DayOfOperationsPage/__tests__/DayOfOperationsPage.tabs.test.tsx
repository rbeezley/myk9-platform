import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import DayOfOperationsPage from '../index';

vi.mock('../useDayOfOperationsData', () => ({
  useDayOfOperationsData: () => ({
    userId: 'u1',
    shows: [{ id: 'show-1', name: 'Test Show', start_date: null }],
    selectedShowId: 'show-1',
    setSelectedShowId: vi.fn(),
    isLoading: false,
    classes: [],
    pullableEntries: [],
    moveUpEntries: [],
    loadData: vi.fn(),
  }),
}));
vi.mock('@/services/database/queries/dayOfOperationsQueries', () => ({ scratchEntry: vi.fn() }));
vi.mock('../../CheckInReportPage', () => ({ default: () => <div>Check-In Content</div> }));

describe('DayOfOperationsPage tab consolidation', () => {
  it('renders all four tabs', () => {
    render(<DayOfOperationsPage />, { initialRoute: '/secretary/day-of' });
    expect(screen.getByRole('tab', { name: /day of show entries/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /check-in/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /move-ups/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /pulled/i })).toBeInTheDocument();
  });

  it('shows Check-In content when ?tab=check-in', () => {
    render(<DayOfOperationsPage />, { initialRoute: '/secretary/day-of?tab=check-in' });
    expect(screen.getByText('Check-In Content')).toBeInTheDocument();
  });
});
