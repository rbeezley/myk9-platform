// CheckInStatusBadge.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { CheckInStatusBadge } from './CheckInStatusBadge';

describe('CheckInStatusBadge', () => {
  it('renders the correct label for each status', () => {
    const { rerender } = render(<CheckInStatusBadge status="checked-in" />);
    expect(screen.getByText('Checked-in')).toBeInTheDocument();

    rerender(<CheckInStatusBadge status="in-ring" />);
    expect(screen.getByText('In Ring')).toBeInTheDocument();

    rerender(<CheckInStatusBadge status="no-status" />);
    expect(screen.getByText('No Status')).toBeInTheDocument();
  });

  it('renders with correct color CSS variable as inline style', () => {
    render(<CheckInStatusBadge status="checked-in" />);
    const badge = screen.getByText('Checked-in').closest('span');
    expect(badge).toHaveStyle({ backgroundColor: 'var(--checkin-checked-in)' });
  });

  it('calls onClick when provided and clicked', async () => {
    const onClick = vi.fn();
    const { user } = render(<CheckInStatusBadge status="checked-in" onClick={onClick} />);
    await user.click(screen.getByText('Checked-in'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render as a button when onClick is not provided', () => {
    render(<CheckInStatusBadge status="checked-in" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders as a button when onClick is provided', () => {
    render(<CheckInStatusBadge status="checked-in" onClick={() => {}} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders small size correctly', () => {
    render(<CheckInStatusBadge status="pulled" size="sm" />);
    const badge = screen.getByText('Pulled').closest('span');
    expect(badge?.className).toContain('text-[10px]');
  });

  it('renders all 8 statuses without error', () => {
    const statuses = [
      'no-status',
      'checked-in',
      'conflict',
      'pulled',
      'at-gate',
      'come-to-gate',
      'in-ring',
      'completed',
    ] as const;
    for (const status of statuses) {
      const { unmount } = render(<CheckInStatusBadge status={status} />);
      unmount();
    }
  });
});
