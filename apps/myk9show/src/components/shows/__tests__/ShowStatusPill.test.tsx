import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowStatusPill } from '../ShowStatusPill';

const mockMutateAsync = vi.fn();
const mockIsPending = { value: false };

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useUpdateShowMutation: () => ({
    mutateAsync: mockMutateAsync,
    get isPending() {
      return mockIsPending.value;
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ShowStatusPill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
    mockIsPending.value = false;
  });

  it('renders "Draft" label for draft status', () => {
    render(<ShowStatusPill showId="show-1" status="draft" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders "Published" label for published status', () => {
    render(<ShowStatusPill showId="show-1" status="published" />);
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('renders "Upcoming" label for upcoming status', () => {
    render(<ShowStatusPill showId="show-1" status="upcoming" />);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });

  it('renders "In Progress" label for in_progress status', () => {
    render(<ShowStatusPill showId="show-1" status="in_progress" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders "Completed" label for completed status', () => {
    render(<ShowStatusPill showId="show-1" status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders "Cancelled" label for cancelled status', () => {
    render(<ShowStatusPill showId="show-1" status="cancelled" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders a button (dropdown trigger) for draft status', () => {
    render(<ShowStatusPill showId="show-1" status="draft" />);
    expect(screen.getByRole('button', { name: /draft/i })).toBeInTheDocument();
  });

  it('renders a button (dropdown trigger) for published status', () => {
    render(<ShowStatusPill showId="show-1" status="published" />);
    expect(screen.getByRole('button', { name: /published/i })).toBeInTheDocument();
  });

  it('does not render a button for upcoming status', () => {
    render(<ShowStatusPill showId="show-1" status="upcoming" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render a button for in_progress status', () => {
    render(<ShowStatusPill showId="show-1" status="in_progress" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render a button for completed status', () => {
    render(<ShowStatusPill showId="show-1" status="completed" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render a button for cancelled status', () => {
    render(<ShowStatusPill showId="show-1" status="cancelled" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows "Publish Show" option when status is draft', async () => {
    render(<ShowStatusPill showId="show-1" status="draft" />);
    fireEvent.click(screen.getByRole('button', { name: /draft/i }));
    expect(await screen.findByText('Publish Show')).toBeInTheDocument();
  });

  it('shows "Move to Draft" option when status is published', async () => {
    render(<ShowStatusPill showId="show-1" status="published" />);
    fireEvent.click(screen.getByRole('button', { name: /published/i }));
    expect(await screen.findByText('Move to Draft')).toBeInTheDocument();
  });

  it('calls updateShow with published when "Publish Show" is clicked', async () => {
    render(<ShowStatusPill showId="show-1" status="draft" />);
    fireEvent.click(screen.getByRole('button', { name: /draft/i }));
    fireEvent.click(await screen.findByText('Publish Show'));
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'show-1',
        updates: { status: 'published' },
      })
    );
  });

  it('calls updateShow with draft when "Move to Draft" is clicked', async () => {
    render(<ShowStatusPill showId="show-1" status="published" />);
    fireEvent.click(screen.getByRole('button', { name: /published/i }));
    fireEvent.click(await screen.findByText('Move to Draft'));
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'draft' } })
    );
  });

  it('shows error toast when mutation fails', async () => {
    const { toast } = await import('sonner');
    mockMutateAsync.mockRejectedValueOnce(new Error('Network error'));
    render(<ShowStatusPill showId="show-1" status="draft" />);
    fireEvent.click(screen.getByRole('button', { name: /draft/i }));
    fireEvent.click(await screen.findByText('Publish Show'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to update show status. Please try again.')
    );
  });

  it('disables the trigger button while mutation is pending', () => {
    mockIsPending.value = true;
    render(<ShowStatusPill showId="show-1" status="draft" />);
    expect(screen.getByRole('button', { name: /draft/i })).toBeDisabled();
  });

  it('renders unknown status string as label with muted styling', () => {
    render(<ShowStatusPill showId="show-1" status="unknown_future_status" />);
    expect(screen.getByText('unknown_future_status')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
