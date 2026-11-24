import { render, screen } from '@/test/utils/testUtils';
import { VolunteerChip } from '../VolunteerChip';

describe('VolunteerChip', () => {
  const defaultProps = {
    name: 'Sarah Miller',
    onRemove: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the formatted display name', () => {
    render(<VolunteerChip {...defaultProps} />);
    expect(screen.getByText('Sarah M.')).toBeInTheDocument();
  });

  it('shows remove button', () => {
    render(<VolunteerChip {...defaultProps} />);
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('calls onRemove when X is clicked', async () => {
    const { user } = render(<VolunteerChip {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(defaultProps.onRemove).toHaveBeenCalledOnce();
  });

  it('extends the remove hit area to about 44 by 44 px', () => {
    render(<VolunteerChip {...defaultProps} />);
    const btn = screen.getByRole('button', { name: /remove/i });
    // 16px button + 14px above/below = 44 tall; 16px + 18px left + 10px right = 44 wide
    expect(btn).toHaveClass(
      'before:-inset-y-[14px]',
      'before:-left-[18px]',
      'before:-right-[10px]'
    );
  });

  it('shows conflict indicator when hasConflict is true', () => {
    render(<VolunteerChip {...defaultProps} hasConflict />);
    expect(screen.getByTitle(/conflict/i)).toBeInTheDocument();
  });

  it('does not show conflict indicator by default', () => {
    render(<VolunteerChip {...defaultProps} />);
    expect(screen.queryByTitle(/conflict/i)).not.toBeInTheDocument();
  });

  it('applies amber styling when hasConflict is true', () => {
    render(<VolunteerChip {...defaultProps} hasConflict />);
    const chip = screen.getByText('Sarah M.').closest('[data-testid="volunteer-chip"]');
    expect(chip?.className).toMatch(/amber|warning/);
  });
});
