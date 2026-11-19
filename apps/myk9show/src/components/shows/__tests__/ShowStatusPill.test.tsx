import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowStatusPill } from '../ShowStatusPill';
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import { toast } from 'sonner';

vi.mock('@/features/publishing/usePublishBlockers', () => ({
  showPublishBlockersQueryKey: (id: string) => ['shows', id, 'publish-blockers'],
  usePublishBlockers: () => ({ status: 'ready', blockers: [] }),
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useUpdateShowMutation: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockedUseMutation = vi.mocked(useUpdateShowMutation);

describe('ShowStatusPill', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
  });

  describe('labels', () => {
    it('renders "Draft" label for draft status', () => {
      render(<ShowStatusPill showId="show-1" status="draft" />);
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('renders "Published" for published status, the show family label', () => {
      render(<ShowStatusPill showId="show-1" status="published" />);
      expect(screen.getByText('Published')).toBeInTheDocument();
    });

    it('renders "Upcoming" label for upcoming status', () => {
      render(<ShowStatusPill showId="show-1" status="upcoming" />);
      expect(screen.getByText('Upcoming')).toBeInTheDocument();
    });

    it('renders "In progress" label for in_progress status', () => {
      render(<ShowStatusPill showId="show-1" status="in_progress" />);
      expect(screen.getByText('In progress')).toBeInTheDocument();
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

    it('plain variant: text in a line, no pill chrome, 44px target, menu still opens (MYK9-1282)', async () => {
      render(<ShowStatusPill showId="show-1" status="published" plain />);
      const trigger = screen.getByRole('button', { name: /published/i });
      const label = trigger.firstElementChild as HTMLElement;
      expect(label.className).not.toMatch(/\b(bg-|border|rounded-md|px-3)/);
      // The pseudo-element stretches the hit target to 44px without taking layout space.
      expect(trigger.className).toContain('before:-inset-y-3');
      fireEvent.click(trigger);
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
    it('publishes an authorized club', async () => {
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

    it('an upcoming show publishes', async () => {
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
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="draft" />);

      await user.click(screen.getByRole('button', { name: /draft/i }));
      await user.click(await screen.findByText(/publish show/i));

      expect(mutateAsync).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/assign a club/i));
    });

    it('moving a published show back to draft is never gated', async () => {
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

    it('surfaces the DB missing-club refusal WITHOUT an "Open Payments" action (MYK9-579)', async () => {
      // Same SQLSTATE (MK003) as the Stripe-readiness refusal, but a trip to
      // /club-admin/payments does not fix a clubless show -- only assigning a
      // club does. Only the message text tells the two refusals apart.
      mutateAsync.mockRejectedValueOnce({
        code: 'MK003',
        message:
          'Assign a club to this show before publishing. Entry fees are paid out to the club.',
      });
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

      await user.click(screen.getByRole('button', { name: /draft/i }));
      await user.click(await screen.findByText(/publish show/i));

      expect(toast.error).toHaveBeenCalledWith(
        'Assign a club to this show before publishing. Entry fees are paid out to the club.'
      );
      const call = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call).toHaveLength(1);
    });

    it('an unrelated mutation failure still shows the generic fallback, not the gate copy', async () => {
      mutateAsync.mockRejectedValueOnce(new Error('Network error'));
      const user = userEvent.setup();
      render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

      await user.click(screen.getByRole('button', { name: /draft/i }));
      await user.click(await screen.findByText(/publish show/i));

      expect(toast.error).toHaveBeenCalledWith("We couldn't change this show's status. Try again.");
    });

    it('shows error toast when mutation fails', async () => {
      mutateAsync.mockRejectedValueOnce(new Error('Network error'));
      render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);
      fireEvent.click(screen.getByRole('button', { name: /draft/i }));
      fireEvent.click(await screen.findByText('Publish Show'));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "We couldn't change this show's status. Try again."
        )
      );
    });
  });
});

describe('ShowStatusPill server refusal backstop', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
  });

  it('surfaces the DB publish-gate trigger MK004 refusal with its own copy', async () => {
    mutateAsync.mockRejectedValueOnce({
      code: 'MK004',
      message:
        "This club hasn't been authorized by myK9 yet. Shows can be built now and published once the club is approved.",
    });
    const user = userEvent.setup();
    render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /draft/i }));
    await user.click(await screen.findByText(/publish show/i));

    // MK004 (club not authorized) has no Stripe setup to send the admin to, so the toast must
    // NOT carry the "Open Payments" action, unlike MK003 (payment-account gate).
    expect(toast.error).toHaveBeenCalledWith(
      "This club hasn't been authorized by myK9 yet. Shows can be built now and published once the club is approved."
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: expect.anything() })
    );
  });
});
