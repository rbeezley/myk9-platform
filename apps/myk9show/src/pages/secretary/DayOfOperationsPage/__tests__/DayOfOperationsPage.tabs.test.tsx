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
// Complete mock for the canonical day-of-operations surface so that any tab
// component mounted by the page (PullManagementTab, MoveUpRequestsTab, the
// dialog children) gets defined functions instead of `undefined`. Vitest
// factory mocks replace the module wholesale.
vi.mock('@/services/database/day-of-operations', () => ({
  // Reads
  getClassesWithCapacity: vi.fn().mockResolvedValue({ data: [], error: null }),
  getScratchableEntries: vi.fn().mockResolvedValue({ data: [], error: null }),
  getMoveUpEligibleEntries: vi.fn().mockResolvedValue({ data: [], error: null }),
  getPendingScratchRequests: vi.fn().mockResolvedValue({ data: [], error: null }),
  getScratchedEntries: vi.fn().mockResolvedValue({ data: [], error: null }),
  getPendingMoveUpRequests: vi.fn().mockResolvedValue({ data: [], error: null }),
  searchDogs: vi.fn().mockResolvedValue({ data: [], error: null }),
  getShowDogs: vi.fn().mockResolvedValue({ data: [], error: null }),
  // Writes
  scratchEntry: vi.fn().mockResolvedValue({ error: null }),
  processMoveUp: vi.fn().mockResolvedValue({ error: null }),
  createDayOfEntry: vi.fn().mockResolvedValue({ error: null }),
  requestScratch: vi.fn().mockResolvedValue({ error: null }),
  approveScratchRequest: vi.fn().mockResolvedValue({ error: null }),
  denyScratchRequest: vi.fn().mockResolvedValue({ error: null }),
  approveMoveUpRequest: vi.fn().mockResolvedValue({ error: null }),
  denyMoveUpRequest: vi.fn().mockResolvedValue({ error: null }),
  updateRefundStatus: vi.fn().mockResolvedValue({ error: null }),
}));
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
