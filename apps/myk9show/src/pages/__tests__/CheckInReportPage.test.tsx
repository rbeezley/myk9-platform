import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import CheckInReportPage from '../secretary/CheckInReportPage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabaseFrom = vi.hoisted(() => vi.fn());
const mockUpdateReplicatedCheckInStatus = vi.hoisted(() => vi.fn());

vi.mock('@/store/showStore', () => ({
  useShowStore: vi.fn(() => ({
    selectedShowId: 'show-1',
    shows: [{ id: 'show-1', name: 'Spring Scent Work Trial' }],
  })),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: vi.fn(() => ({
    trials: [
      {
        id: 't1',
        showId: 'show-1',
        trialDate: '2026-04-12',
        trialNumber: 1,
      },
      {
        id: 't2',
        showId: 'show-1',
        trialDate: '2026-04-12',
        trialNumber: 2,
      },
    ],
  })),
}));

vi.mock('@/hooks/queries/useCheckInReport', () => ({
  DAY_ABBREVS: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  useCheckInReport: vi.fn(() => ({
    data: [
      {
        key: 'dog-1:h-1',
        armbandNumber: 142,
        handlerName: 'Sarah Mitchell',
        dogName: 'Buddy',
        dogBreed: 'Golden Retriever',
        entries: [
          {
            entryId: 'e1',
            classId: 'c1',
            className: 'Sat T1: Buried Nov',
            checkInStatus: 'no-status',
            trialId: 't1',
          },
        ],
        totalEntries: 1,
        checkedInCount: 0,
        summaryStatus: 'none',
      },
      {
        key: 'dog-2:h-2',
        armbandNumber: 200,
        handlerName: 'Jenny Park',
        dogName: 'Luna',
        dogBreed: 'Border Collie',
        entries: [
          {
            entryId: 'e2',
            classId: 'c2',
            className: 'Sat T1: Interior Nov',
            checkInStatus: 'checked-in',
            trialId: 't1',
          },
        ],
        totalEntries: 1,
        checkedInCount: 1,
        summaryStatus: 'checked-in',
      },
    ],
    isLoading: false,
    error: null,
  })),
}));

vi.mock('@/hooks/queries/useShowTrials', () => ({
  useShowTrials: vi.fn(() => ({
    data: [
      {
        id: 't1',
        trialDate: '2026-04-12',
        trialNumber: 1,
      },
      {
        id: 't2',
        trialDate: '2026-04-12',
        trialNumber: 2,
      },
    ],
  })),
}));

vi.mock('@/hooks/useShowCheckInSubscription', () => ({
  useShowCheckInSubscription: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  },
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: (...args: unknown[]) =>
    mockUpdateReplicatedCheckInStatus(...args),
}));

describe('CheckInReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateReplicatedCheckInStatus.mockResolvedValue('mutation-1');
    mockSupabaseFrom.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
      in: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('renders page title', () => {
    render(<CheckInReportPage />);
    expect(screen.getByText('Check-In')).toBeInTheDocument();
  });

  it('renders show name', () => {
    render(<CheckInReportPage />);
    expect(screen.getByText(/Spring Scent Work Trial/)).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    render(<CheckInReportPage />);
    expect(screen.getByText(/Check-In Progress/)).toBeInTheDocument();
  });

  it('renders exhibitor cards', () => {
    render(<CheckInReportPage />);
    expect(screen.getByText('Sarah Mitchell')).toBeInTheDocument();
    // Jenny Park has summaryStatus 'checked-in' and default filter is 'needs-action', so she should be filtered out
  });

  it('renders search bar', () => {
    render(<CheckInReportPage />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('queues a single staff check-in through the replicated entry table', async () => {
    const { user } = render(<CheckInReportPage />);

    await user.click(screen.getByText('Sarah Mitchell'));
    await user.click(screen.getByRole('button', { name: 'Check In' }));

    expect(mockUpdateReplicatedCheckInStatus).toHaveBeenCalledWith('e1', 'checked-in');
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('queues bulk staff check-in through the replicated entry table', async () => {
    const { user } = render(<CheckInReportPage />);

    await user.click(screen.getByRole('button', { name: 'Check In All' }));

    expect(mockUpdateReplicatedCheckInStatus).toHaveBeenCalledWith('e1', 'checked-in');
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });
});
