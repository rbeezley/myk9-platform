import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { CheckInExhibitorCard } from '../CheckInExhibitorCard';
import type { ExhibitorCheckInGroup } from '@/hooks/queries/useCheckInReport';

const makeGroup = (overrides: Partial<ExhibitorCheckInGroup> = {}): ExhibitorCheckInGroup => ({
  key: 'dog-1:handler-1',
  armbandNumber: 142,
  handlerName: 'Sarah Mitchell',
  dogName: 'Buddy',
  dogBreed: 'Golden Retriever',
  entries: [
    {
      entryId: 'e1',
      classId: 'c1',
      className: 'Sat T1: Buried Novice',
      checkInStatus: 'no-status',
      trialId: 't1',
    },
    {
      entryId: 'e2',
      classId: 'c2',
      className: 'Sat T1: Interior Novice',
      checkInStatus: 'no-status',
      trialId: 't1',
    },
    {
      entryId: 'e3',
      classId: 'c3',
      className: 'Sat T2: Buried Novice',
      checkInStatus: 'no-status',
      trialId: 't2',
    },
  ],
  totalEntries: 3,
  checkedInCount: 0,
  summaryStatus: 'none',
  ...overrides,
});

describe('CheckInExhibitorCard', () => {
  it('renders armband, handler name, and dog name', () => {
    render(<CheckInExhibitorCard group={makeGroup()} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    expect(screen.getByText('#142')).toBeInTheDocument();
    expect(screen.getByText('Sarah Mitchell')).toBeInTheDocument();
    expect(screen.getByText(/Buddy/)).toBeInTheDocument();
  });

  it('shows "Check In All" button when no entries are checked in', () => {
    render(<CheckInExhibitorCard group={makeGroup()} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    expect(screen.getByRole('button', { name: /check in all/i })).toBeInTheDocument();
  });

  it('shows "Check In Rest" button when partially checked in', () => {
    const group = makeGroup({
      checkedInCount: 1,
      summaryStatus: 'partial',
      entries: [
        {
          entryId: 'e1',
          classId: 'c1',
          className: 'Sat T1: Buried Nov',
          checkInStatus: 'checked-in',
          trialId: 't1',
        },
        {
          entryId: 'e2',
          classId: 'c2',
          className: 'Sat T1: Interior Nov',
          checkInStatus: 'no-status',
          trialId: 't1',
        },
      ],
      totalEntries: 2,
    });
    render(<CheckInExhibitorCard group={group} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    expect(screen.getByRole('button', { name: /check in rest/i })).toBeInTheDocument();
  });

  it('shows checkmark when fully checked in', () => {
    const group = makeGroup({
      checkedInCount: 3,
      summaryStatus: 'checked-in',
      entries: [
        {
          entryId: 'e1',
          classId: 'c1',
          className: 'Sat T1: Buried Nov',
          checkInStatus: 'checked-in',
          trialId: 't1',
        },
        {
          entryId: 'e2',
          classId: 'c2',
          className: 'Sat T1: Interior Nov',
          checkInStatus: 'checked-in',
          trialId: 't1',
        },
        {
          entryId: 'e3',
          classId: 'c3',
          className: 'Sat T2: Buried Nov',
          checkInStatus: 'completed',
          trialId: 't2',
        },
      ],
      totalEntries: 3,
    });
    render(<CheckInExhibitorCard group={group} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
  });

  it('expands to show class rows on click', async () => {
    const { user } = render(
      <CheckInExhibitorCard group={makeGroup()} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />
    );
    expect(screen.queryByText('Sat T1: Buried Novice')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('exhibitor-card-header'));
    expect(screen.getByText('Sat T1: Buried Novice')).toBeInTheDocument();
    expect(screen.getByText('Sat T1: Interior Novice')).toBeInTheDocument();
    expect(screen.getByText('Sat T2: Buried Novice')).toBeInTheDocument();
  });

  it('calls onCheckInAll with unchecked entry IDs when button clicked', async () => {
    const onCheckInAll = vi.fn();
    const { user } = render(
      <CheckInExhibitorCard group={makeGroup()} onCheckIn={vi.fn()} onCheckInAll={onCheckInAll} />
    );
    await user.click(screen.getByRole('button', { name: /check in all/i }));
    expect(onCheckInAll).toHaveBeenCalledWith(['e1', 'e2', 'e3']);
  });

  it('shows checked-in count in subtitle', () => {
    render(<CheckInExhibitorCard group={makeGroup()} onCheckIn={vi.fn()} onCheckInAll={vi.fn()} />);
    expect(screen.getByText(/0\/3 checked in/)).toBeInTheDocument();
  });
});
