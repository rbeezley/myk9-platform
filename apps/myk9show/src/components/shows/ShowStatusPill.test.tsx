import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowStatusPill } from './ShowStatusPill';
import {
  useClubStripeAccount,
  useClubAuthorization,
} from '@/features/payments/useClubStripeAccount';
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import { toast } from 'sonner';

vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripeAccount: vi.fn(),
  useClubAuthorization: vi.fn(),
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useUpdateShowMutation: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockedUseAccount = vi.mocked(useClubStripeAccount);
const mockedUseAuth = vi.mocked(useClubAuthorization);
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

// MYK9-572: defaults every test to an authorized club so the pre-existing
// Stripe-only gate tests below are unaffected; the dedicated describe block
// further down overrides this per-test to exercise the new branch.
function mockAuthorization(authorizedAt: string | null) {
  mockedUseAuth.mockReturnValue({
    data: { authorized_at: authorizedAt },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useClubAuthorization>);
}

describe('ShowStatusPill publish gate', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
    mockAuthorization('2026-01-01T00:00:00Z');
  });

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

  it('without a clubId the gate fails CLOSED (clubless shows cannot be paid out)', async () => {
    // Round-8 review: fail-open here meant a lost clubId prop (it happened in
    // the #615 merge) silently disabled the gate. A clubless show also cannot
    // receive payouts, so publishing it would collect money with nowhere to go.
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

  it('surfaces the DB publish-gate trigger refusal (MYK9-579 backstop) with its own copy', async () => {
    // The client-side check above passed (payouts enabled here), but a stale
    // cache or race let the write reach enforce_show_publish_gate() anyway.
    // Its SQLSTATE (MK003) must map to the trigger's own friendly text, not
    // the generic "Failed to update show status" fallback.
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
});

describe('ShowStatusPill club-authorization gate (MYK9-572)', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;
  let refetchAuth: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
    mockAccount(true);
    refetchAuth = vi.fn();
  });

  it('blocks publishing an unauthorized club before checking Stripe readiness', async () => {
    mockAuthorization(null);
    const user = userEvent.setup();
    render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /draft/i }));
    await user.click(await screen.findByText(/publish show/i));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/hasn't been authorized/i));
  });

  // P2-5/P3-A: fail CLOSED when the club row is unreadable (RLS-hidden,
  // undefined data despite a "successful" query) — not just when
  // authorized_at is explicitly null — and kick off a refetch so a retry
  // right after a site admin authorizes the club can succeed.
  it('fails closed and refetches when the authorization query has no data', async () => {
    mockedUseAuth.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: refetchAuth,
    } as unknown as ReturnType<typeof useClubAuthorization>);
    const user = userEvent.setup();
    render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /draft/i }));
    await user.click(await screen.findByText(/publish show/i));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/hasn't been authorized/i));
    expect(refetchAuth).toHaveBeenCalled();
  });

  it('publishes once the club is authorized and Stripe-ready', async () => {
    mockAuthorization('2026-01-01T00:00:00Z');
    const user = userEvent.setup();
    render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /draft/i }));
    await user.click(await screen.findByText(/publish show/i));

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
  });

  it('surfaces the DB publish-gate trigger MK004 refusal with its own copy', async () => {
    mockAuthorization('2026-01-01T00:00:00Z');
    mutateAsync.mockRejectedValueOnce({
      code: 'MK004',
      message:
        "This club hasn't been authorized by myK9 yet. Shows can be built now and published once the club is approved.",
    });
    const user = userEvent.setup();
    render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /draft/i }));
    await user.click(await screen.findByText(/publish show/i));

    // P2-D: MK004 (club not authorized) has no Stripe setup to send the
    // admin to, so the toast must NOT carry the "Open Payments" action —
    // unlike MK003 (payment-account gate), which still does.
    expect(toast.error).toHaveBeenCalledWith(
      "This club hasn't been authorized by myK9 yet. Shows can be built now and published once the club is approved."
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: expect.anything() })
    );
  });
});
