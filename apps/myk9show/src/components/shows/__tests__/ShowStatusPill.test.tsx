import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowStatusPill } from '../ShowStatusPill';
import { useClubStripeAccount } from '@/features/payments/useClubStripeAccount';
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import { toast } from 'sonner';

vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripeAccount: vi.fn(),
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useUpdateShowMutation: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockedUseAccount = vi.mocked(useClubStripeAccount);
const mockedUseMutation = vi.mocked(useUpdateShowMutation);

function mockAccount(payoutsEnabled: boolean | null) {
  mockedUseAccount.mockReturnValue({
    data:
      payoutsEnabled === null
        ? null
        : {
            id: 'csa-1',
            club_id: 'club-1',
            stripe_account_id: 'acct_x',
            onboarding_complete: payoutsEnabled,
            payouts_enabled: payoutsEnabled,
          },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useClubStripeAccount>);
}

describe('ShowStatusPill', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
    // Default: payouts enabled so tests that don't care about the gate
    // (labels, non-publish transitions) don't have to mock it themselves.
    mockAccount(true);
  });

  describe('labels', () => {
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

    it('renders unknown status string as label with muted styling', () => {
      render(<ShowStatusPill showId="show-1" status="unknown_future_status" />);
      expect(screen.getByText('unknown_future_status')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('available transitions', () => {
    it('renders a button (dropdown trigger) for draft status', () => {
      render(<ShowStatusPill showId="show-1" status="draft" />);
      expect(screen.getByRole('button', { name: /draft/i })).toBeInTheDocument();
    });

    it('renders a button (dropdown trigger) for published status', () => {
      render(<ShowStatusPill showId="show-1" status="published" />);
      expect(screen.getByRole('button', { name: /published/i })).toBeInTheDocument();
    });

    it('renders a button (dropdown trigger) for upcoming status', () => {
      render(<ShowStatusPill showId="show-1" status="upcoming" />);
      expect(screen.getByRole('button', { name: /upcoming/i })).toBeInTheDocument();
    });

    it('renders a button (dropdown trigger) for in_progress status', () => {
      render(<ShowStatusPill showId="show-1" status="in_progress" />);
      expect(screen.getByRole('button', { name: /in progress/i })).toBeInTheDocument();
    });

    // MYK9-579 round 6: completed and cancelled are terminal from the pill --
    // re-opening public entry on a completed or cancelled show is not a
    // one-click action here, so neither offers a transition (no dropdown at
    // all, just the static pill).
    it('renders completed status with no dropdown trigger (no transitions)', () => {
      render(<ShowStatusPill showId="show-1" status="completed" />);
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('cancelled renders no publish action', () => {
      render(<ShowStatusPill showId="show-1" status="cancelled" />);
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByText('Publish Show')).not.toBeInTheDocument();
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

    it('disables the trigger button while mutation is pending', () => {
      mockedUseMutation.mockReturnValue({
        mutateAsync,
        isPending: true,
      } as unknown as ReturnType<typeof useUpdateShowMutation>);
      render(<ShowStatusPill showId="show-1" status="draft" />);
      expect(screen.getByRole('button', { name: /draft/i })).toBeDisabled();
    });
  });

  describe('publish gate', () => {
    it('blocks publishing when the club has no payout-enabled account', async () => {
      mockAccount(null);
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

      await user.click(screen.getByRole('button', { name: /draft/i }));
      await user.click(await screen.findByText(/publish show/i));

      expect(mutateAsync).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/payment account/i),
        expect.objectContaining({ action: expect.anything() })
      );
    });

    it('publishes when payouts are enabled', async () => {
      mockAccount(true);
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

      await user.click(screen.getByRole('button', { name: /draft/i }));
      await user.click(await screen.findByText(/publish show/i));

      expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
    });

    it('calls updateShow with published when "Publish Show" is clicked', async () => {
      render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);
      fireEvent.click(screen.getByRole('button', { name: /draft/i }));
      fireEvent.click(await screen.findByText('Publish Show'));
      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({
          id: 'show-1',
          updates: { status: 'published' },
        })
      );
    });

    it('an upcoming show publishes when Stripe-ready', async () => {
      mockAccount(true);
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="upcoming" clubId="club-1" />);

      await user.click(screen.getByRole('button', { name: /upcoming/i }));
      await user.click(await screen.findByText(/publish show/i));

      expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
    });

    it('without a clubId the gate fails CLOSED (clubless shows cannot be paid out)', async () => {
      // Round-8 review: fail-open here meant a lost clubId prop (it happened
      // in the #615 merge) silently disabled the gate. A clubless show also
      // cannot receive payouts, so publishing it would collect money with
      // nowhere to go.
      mockAccount(null);
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="draft" />);

      await user.click(screen.getByRole('button', { name: /draft/i }));
      await user.click(await screen.findByText(/publish show/i));

      expect(mutateAsync).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/assign a club/i));
    });

    it('moving a published show back to draft is never gated', async () => {
      mockAccount(null);
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="published" clubId="club-1" />);

      await user.click(screen.getByRole('button', { name: /published/i }));
      await user.click(await screen.findByText(/move to draft/i));

      expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'draft' } });
    });

    it('calls updateShow with draft when "Move to Draft" is clicked', async () => {
      render(<ShowStatusPill showId="show-1" status="published" />);
      fireEvent.click(screen.getByRole('button', { name: /published/i }));
      fireEvent.click(await screen.findByText('Move to Draft'));
      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'draft' } })
      );
    });

    it('surfaces the DB publish-gate trigger refusal (MYK9-579 backstop) with its own copy', async () => {
      // The client-side check above passed (payouts enabled here), but a
      // stale cache or race let the write reach enforce_show_publish_gate()
      // anyway. Its SQLSTATE (MK003) must map to the trigger's own friendly
      // text, not the generic "Failed to update show status" fallback.
      mockAccount(true);
      mutateAsync.mockRejectedValueOnce({
        code: 'MK003',
        message:
          "Connect your club's payment account before publishing — online entry fees need somewhere to go. Find it under My Club → Payments.",
      });
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

      await user.click(screen.getByRole('button', { name: /draft/i }));
      await user.click(await screen.findByText(/publish show/i));

      expect(toast.error).toHaveBeenCalledWith(
        "Connect your club's payment account before publishing — online entry fees need somewhere to go. Find it under My Club → Payments.",
        expect.objectContaining({ action: expect.anything() })
      );
    });

    it('surfaces the DB missing-club refusal WITHOUT an "Open Payments" action (MYK9-579)', async () => {
      // Same SQLSTATE (MK003) as the Stripe-readiness refusal, but a trip to
      // /club-admin/payments does not fix a clubless show -- only assigning a
      // club does. Only the message text tells the two refusals apart.
      mockAccount(true);
      mutateAsync.mockRejectedValueOnce({
        code: 'MK003',
        message:
          'Assign a club to this show before publishing — entry fees are paid out to the club.',
      });
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

      await user.click(screen.getByRole('button', { name: /draft/i }));
      await user.click(await screen.findByText(/publish show/i));

      expect(toast.error).toHaveBeenCalledWith(
        'Assign a club to this show before publishing — entry fees are paid out to the club.'
      );
      const call = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call).toHaveLength(1);
    });

    it('an unrelated mutation failure still shows the generic fallback, not the gate copy', async () => {
      mockAccount(true);
      mutateAsync.mockRejectedValueOnce(new Error('Network error'));
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

      await user.click(screen.getByRole('button', { name: /draft/i }));
      await user.click(await screen.findByText(/publish show/i));

      expect(toast.error).toHaveBeenCalledWith('Failed to update show status. Please try again.');
    });

    it('shows error toast when mutation fails', async () => {
      mutateAsync.mockRejectedValueOnce(new Error('Network error'));
      render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);
      fireEvent.click(screen.getByRole('button', { name: /draft/i }));
      fireEvent.click(await screen.findByText('Publish Show'));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Failed to update show status. Please try again.')
      );
    });
  });
});
