import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminDeleteUserDialog } from './AdminDeleteUserDialog';

// Control the owns-dogs guard query directly; default = owns nothing.
const mockOwnedDogs = vi.fn(() => ({ data: [] as { id: string; name: string }[], isLoading: false }));
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useOwnedLiveDogsByPersonQuery: (...args: unknown[]) => mockOwnedDogs(...(args as [])),
}));

describe('AdminDeleteUserDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSoftDelete: vi.fn(),
    onPermanentDelete: vi.fn(),
    entityName: 'John Doe',
    isDeleting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOwnedDogs.mockReturnValue({ data: [], isLoading: false });
  });

  it('renders with deactivate selected by default', () => {
    render(<AdminDeleteUserDialog {...defaultProps} />);

    expect(screen.getByText(/Delete User/)).toBeInTheDocument();
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Deactivate/)).toBeChecked();
  });

  it('shows soft delete description when deactivate is selected', () => {
    render(<AdminDeleteUserDialog {...defaultProps} />);

    expect(screen.getByText(/can be restored later/i)).toBeInTheDocument();
  });

  it('shows permanent delete warning when permanently delete is selected', () => {
    render(<AdminDeleteUserDialog {...defaultProps} />);

    const permanentRadio = screen.getByLabelText(/Permanently delete/);
    fireEvent.click(permanentRadio);

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByText(/removes.*login account/i)).toBeInTheDocument();
  });

  it('calls onSoftDelete when deactivate is confirmed', () => {
    render(<AdminDeleteUserDialog {...defaultProps} />);

    const confirmButton = screen.getByRole('button', { name: /deactivate/i });
    fireEvent.click(confirmButton);

    expect(defaultProps.onSoftDelete).toHaveBeenCalledOnce();
    expect(defaultProps.onPermanentDelete).not.toHaveBeenCalled();
  });

  it('calls onPermanentDelete when permanent delete is confirmed', () => {
    render(<AdminDeleteUserDialog {...defaultProps} />);

    const permanentRadio = screen.getByLabelText(/Permanently delete/);
    fireEvent.click(permanentRadio);

    const confirmButton = screen.getByRole('button', { name: /permanently delete/i });
    fireEvent.click(confirmButton);

    expect(defaultProps.onPermanentDelete).toHaveBeenCalledOnce();
    expect(defaultProps.onSoftDelete).not.toHaveBeenCalled();
  });

  it('shows loading state during deletion', () => {
    render(<AdminDeleteUserDialog {...defaultProps} isDeleting={true} />);

    const confirmButton = screen.getByRole('button', { name: /deleting/i });
    expect(confirmButton).toBeDisabled();
  });

  it('does not render when open is false', () => {
    render(<AdminDeleteUserDialog {...defaultProps} open={false} />);

    expect(screen.queryByText(/Delete User/)).not.toBeInTheDocument();
  });

  it('resets to deactivate mode when dialog reopens', () => {
    const { rerender } = render(<AdminDeleteUserDialog {...defaultProps} />);

    // Select permanent delete
    const permanentRadio = screen.getByLabelText(/Permanently delete/);
    fireEvent.click(permanentRadio);
    expect(permanentRadio).toBeChecked();

    // Close and reopen
    rerender(<AdminDeleteUserDialog {...defaultProps} open={false} />);
    rerender(<AdminDeleteUserDialog {...defaultProps} open={true} />);

    // Should reset to deactivate
    expect(screen.getByLabelText(/Deactivate/)).toBeChecked();
  });

  it('supports bulk mode with count', () => {
    render(<AdminDeleteUserDialog {...defaultProps} entityName="3 users" bulkCount={3} />);

    expect(screen.getByText(/3 users/)).toBeInTheDocument();
  });

  describe('owns-dogs guard', () => {
    it('blocks deletion and lists the owned dogs when the person owns live dogs', () => {
      mockOwnedDogs.mockReturnValue({
        data: [
          { id: 'd1', name: 'Bravo' },
          { id: 'd2', name: 'Alpha 1' },
        ],
        isLoading: false,
      });
      render(<AdminDeleteUserDialog {...defaultProps} personId="p1" />);

      expect(screen.getByText(/Can't delete John Doe/)).toBeInTheDocument();
      expect(screen.getByText(/still owns 2 live dogs/i)).toBeInTheDocument();
      expect(screen.getByText('Bravo')).toBeInTheDocument();
      expect(screen.getByText('Alpha 1')).toBeInTheDocument();

      // The delete actions must NOT be reachable while blocked.
      expect(screen.queryByLabelText(/Deactivate/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /permanently delete/i })).not.toBeInTheDocument();
    });

    it('truncates a long owned-dog list with a "and N more" line', () => {
      mockOwnedDogs.mockReturnValue({
        data: Array.from({ length: 11 }, (_, i) => ({ id: `d${i}`, name: `Dog ${i}` })),
        isLoading: false,
      });
      render(<AdminDeleteUserDialog {...defaultProps} personId="p1" />);

      expect(screen.getByText(/and 3 more/i)).toBeInTheDocument();
    });

    it('shows the normal delete chooser when the person owns no live dogs', () => {
      mockOwnedDogs.mockReturnValue({ data: [], isLoading: false });
      render(<AdminDeleteUserDialog {...defaultProps} personId="p1" />);

      expect(screen.queryByText(/Can't delete/)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Deactivate/)).toBeChecked();
    });

    it('does not block while the owned-dogs check is still loading', () => {
      mockOwnedDogs.mockReturnValue({ data: undefined as never, isLoading: true });
      render(<AdminDeleteUserDialog {...defaultProps} personId="p1" />);

      expect(screen.queryByText(/Can't delete/)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Deactivate/)).toBeInTheDocument();
    });
  });
});
