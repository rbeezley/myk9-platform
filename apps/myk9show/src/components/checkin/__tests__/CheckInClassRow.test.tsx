import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { CheckInClassRow } from '../CheckInClassRow';

describe('CheckInClassRow', () => {
  const defaultProps = {
    entryId: 'entry-1',
    className: 'Sat T1: Buried Novice',
    checkInStatus: 'no-status' as const,
    onCheckIn: vi.fn(),
  };

  it('renders class name', () => {
    render(<CheckInClassRow {...defaultProps} />);
    expect(screen.getByText('Sat T1: Buried Novice')).toBeInTheDocument();
  });

  it('shows Check In button when status is no-status', () => {
    render(<CheckInClassRow {...defaultProps} />);
    expect(screen.getByRole('button', { name: /check in/i })).toBeInTheDocument();
  });

  it('shows "Self check-in" attribution when checked in by exhibitor', () => {
    render(<CheckInClassRow {...defaultProps} checkInStatus="checked-in" />);
    expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Self check-in/)).toBeInTheDocument();
  });

  it('shows "Secretary" attribution when checked in by secretary', () => {
    render(<CheckInClassRow {...defaultProps} checkInStatus="checked-in" checkedBySecretary />);
    expect(screen.getByText(/Secretary/)).toBeInTheDocument();
  });

  it('shows status label for other statuses (at-gate, in-ring, etc)', () => {
    render(<CheckInClassRow {...defaultProps} checkInStatus="in-ring" />);
    expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
    expect(screen.getByText('In Ring')).toBeInTheDocument();
  });

  it('calls onCheckIn when Check In button is clicked', async () => {
    const onCheckIn = vi.fn();
    const { user } = render(<CheckInClassRow {...defaultProps} onCheckIn={onCheckIn} />);
    await user.click(screen.getByRole('button', { name: /check in/i }));
    expect(onCheckIn).toHaveBeenCalledWith('entry-1');
  });

  it('renders status dot with correct color variable', () => {
    const { container } = render(<CheckInClassRow {...defaultProps} checkInStatus="checked-in" />);
    const dot = container.querySelector('[data-testid="status-dot"]');
    expect(dot).toHaveStyle({ backgroundColor: 'var(--checkin-checked-in)' });
  });
});
