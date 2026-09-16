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

// Publish fails closed without a payout-enabled club (round-8 review), so the
// publish-path tests below pass clubId and this mock reports payouts enabled.
// Gate behavior itself is covered in ../ShowStatusPill.test.tsx.
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripeAccount: () => ({
    data: {
      id: 'csa-1',
      club_id: 'club-1',
      stripe_account_id: 'acct_x',
      onboarding_complete: true,
      payouts_enabled: true,
    },
    isLoading: false,
  }),
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

  it('renders a qualified label for published status', () => {
    render(<ShowStatusPill showId="show-1" status="published" />);
    expect(screen.getByText('Published show')).toBeInTheDocument();
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

  // MYK9-579 round 5: publishing must not be a one-way door -- a show that
  // moved to upcoming/in_progress/completed/cancelled can still be published
  // again from the pill.
  it('renders a button (dropdown trigger) for upcoming status', () => {
    render(<ShowStatusPill showId="show-1" status="upcoming" />);
    expect(screen.getByRole('button', { name: /upcoming/i })).toBeInTheDocument();
  });

  it('renders a button (dropdown trigger) for in_progress status', () => {
    render(<ShowStatusPill showId="show-1" status="in_progress" />);
    expect(screen.getByRole('button', { name: /in progress/i })).toBeInTheDocument();
  });

  it('renders a button (dropdown trigger) for completed status', () => {
    render(<ShowStatusPill showId="show-1" status="completed" />);
    expect(screen.getByRole('button', { name: /completed/i })).toBeInTheDocument();
  });

  it('renders a button (dropdown trigger) for cancelled status', () => {
    render(<ShowStatusPill showId="show-1" status="cancelled" />);
    expect(screen.getByRole('button', { name: /cancelled/i })).toBeInTheDocument();
  });

  it('shows "Publish Show" option when status is cancelled', async () => {
    render(<ShowStatusPill showId="show-1" status="cancelled" />);
    fireEvent.click(screen.getByRole('button', { name: /cancelled/i }));
    expect(await screen.findByText('Publish Show')).toBeInTheDocument();
  });

  it('calls updateShow with published when publishing an upcoming show', async () => {
    render(<ShowStatusPill showId="show-1" status="upcoming" clubId="club-1" />);
    fireEvent.click(screen.getByRole('button', { name: /upcoming/i }));
    fireEvent.click(await screen.findByText('Publish Show'));
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'show-1',
        updates: { status: 'published' },
      })
    );
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
    render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);
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
    render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);
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
