import { render, screen } from '@/test/utils/testUtils';
import { StatusPickerDialog } from './StatusPickerDialog';
import type { CheckInStatus } from '@myk9/core';

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  entry: {
    entryId: 'entry-1',
    armband: '187',
    dogName: 'Arlo',
    handlerName: 'Anna Lenhart Murray',
  },
  currentStatus: 'no-status' as CheckInStatus,
  onStatusChange: vi.fn(),
  isStaff: false,
};

describe('StatusPickerDialog', () => {
  it('renders entry header with armband, dog name, and handler', () => {
    render(<StatusPickerDialog {...defaultProps} />);
    expect(screen.getByText('187')).toBeInTheDocument();
    expect(screen.getByText('Arlo')).toBeInTheDocument();
    expect(screen.getByText('Anna Lenhart Murray')).toBeInTheDocument();
  });

  it('shows 5 status options for exhibitors', () => {
    render(<StatusPickerDialog {...defaultProps} isStaff={false} />);
    expect(screen.getByText('No Status')).toBeInTheDocument();
    expect(screen.getByText('Checked-in')).toBeInTheDocument();
    expect(screen.getByText('Conflict')).toBeInTheDocument();
    expect(screen.getByText('Pulled')).toBeInTheDocument();
    expect(screen.getByText('At Gate')).toBeInTheDocument();
    // Staff-only statuses should not appear
    expect(screen.queryByText('Come to Gate')).not.toBeInTheDocument();
    expect(screen.queryByText('In Ring')).not.toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('shows all 8 status options for staff', () => {
    render(<StatusPickerDialog {...defaultProps} isStaff={true} />);
    expect(screen.getByText('No Status')).toBeInTheDocument();
    expect(screen.getByText('Checked-in')).toBeInTheDocument();
    expect(screen.getByText('Conflict')).toBeInTheDocument();
    expect(screen.getByText('Pulled')).toBeInTheDocument();
    expect(screen.getByText('At Gate')).toBeInTheDocument();
    expect(screen.getByText('Come to Gate')).toBeInTheDocument();
    expect(screen.getByText('In Ring')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('highlights the current status', () => {
    render(<StatusPickerDialog {...defaultProps} currentStatus="checked-in" />);
    const checkedInCard = screen.getByText('Checked-in').closest('button');
    expect(checkedInCard?.className).toContain('ring-2');
  });

  it('calls onStatusChange and closes when a status is picked', async () => {
    const onStatusChange = vi.fn();
    const onOpenChange = vi.fn();
    const { user } = render(
      <StatusPickerDialog
        {...defaultProps}
        onStatusChange={onStatusChange}
        onOpenChange={onOpenChange}
      />
    );
    await user.click(screen.getByText('Checked-in'));
    expect(onStatusChange).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows description text for each status', () => {
    render(<StatusPickerDialog {...defaultProps} isStaff={true} />);
    expect(screen.getByText('Dog has not checked in yet')).toBeInTheDocument();
    expect(screen.getByText('Dog is ready to compete')).toBeInTheDocument();
    expect(screen.getByText('Dog entered in multiple classes')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<StatusPickerDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Arlo')).not.toBeInTheDocument();
  });
});
