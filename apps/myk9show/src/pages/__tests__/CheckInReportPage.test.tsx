import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import CheckInReportPage from '../secretary/CheckInReportPage';

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

vi.mock('@/hooks/useShowCheckInSubscription', () => ({
  useShowCheckInSubscription: vi.fn(),
}));

describe('CheckInReportPage', () => {
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
});
