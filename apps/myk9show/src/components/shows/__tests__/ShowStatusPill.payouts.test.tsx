/**
 * MYK9-2164: online entries are always on, so publishing always needs the club's payouts (a
 * demo club excepted, as on the server). The refusal reads the same reason, and links to the
 * same club Payments tab, as the readiness line. The gate still runs on a move that makes the
 * show public, not on a move between two public statuses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowStatusPill } from '../ShowStatusPill';
import {
  useClubStripeAccount,
  useClubAuthorization,
} from '@/features/payments/useClubStripeAccount';
import { useClubIsDemo } from '@/features/payments/useClubIsDemo';
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import {
  CLUB_UNAUTHORIZED_MESSAGE,
  PUBLISH_BLOCKED_MESSAGE,
} from '@/features/payments/onlineEntryGate';
import { clubPayoutsMessage } from '@/features/payments/clubPayoutsState';
import { toast } from 'sonner';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

const canOpen = vi.hoisted(() => ({ value: true }));
vi.mock('@/features/payments/useCanOpenClubPayments', () => ({
  useCanOpenClubPayments: () => canOpen.value,
}));
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripeAccount: vi.fn(),
  useClubAuthorization: vi.fn(),
}));
vi.mock('@/features/payments/useClubIsDemo', () => ({
  useClubIsDemo: vi.fn(),
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useUpdateShowMutation: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const WINDOW = {
  entryOpenDate: '2026-10-01T12:00:00.000Z',
  entryCloseDate: '2026-10-20T04:59:00.000Z',
};

type Account = { onboarding_complete: boolean; payouts_enabled: boolean } | null;

function mockStripe(state: { data: Account; isError?: boolean }) {
  vi.mocked(useClubStripeAccount).mockReturnValue({
    data: state.data,
    isLoading: false,
    isError: state.isError ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useClubStripeAccount>);
}

function mockDemo(isDemo: boolean | undefined) {
  vi.mocked(useClubIsDemo).mockReturnValue({
    data: isDemo,
    isLoading: false,
  } as unknown as ReturnType<typeof useClubIsDemo>);
}

function mockAuthorized(authorizedAt: string | null) {
  vi.mocked(useClubAuthorization).mockReturnValue({
    data: { authorized_at: authorizedAt },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useClubAuthorization>);
}

async function choose(trigger: RegExp, item: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: trigger }));
  await user.click(await screen.findByText(item));
}

function paymentsAction() {
  const call = vi.mocked(toast.error).mock.calls.at(-1);
  return (call?.[1] as { action: { label: string; onClick: () => void } }).action;
}

describe('ShowStatusPill: publishing needs the club payouts (MYK9-2164)', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateShowMutation).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
    mockAuthorized('2026-01-01T00:00:00Z');
    mockDemo(false);
    canOpen.value = true;
  });

  it('refuses a club with no bank account, with the reason and a link to its Payments tab', async () => {
    mockStripe({ data: null });
    render(<ShowStatusPill {...WINDOW} showId="show-1" status="draft" clubId="club-1" />);

    await choose(/draft/i, /publish show/i);

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      clubPayoutsMessage('not-connected'),
      expect.objectContaining({ action: expect.objectContaining({ label: 'Open Payments' }) })
    );
    paymentsAction().onClick();
    expect(navigate).toHaveBeenCalledWith('/clubs/club-1?tab=payments');
  });

  it('says a club under review is waiting, usually a day or two', async () => {
    mockStripe({ data: { onboarding_complete: true, payouts_enabled: false } });
    render(<ShowStatusPill {...WINDOW} showId="show-1" status="draft" clubId="club-1" />);

    await choose(/draft/i, /publish show/i);

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/reviewing your club's bank account, usually a day or two/i),
      expect.anything()
    );
  });

  it('publishes a demo club with no bank account, as the server does', async () => {
    mockStripe({ data: null });
    mockDemo(true);
    render(<ShowStatusPill {...WINDOW} showId="show-1" status="draft" clubId="club-1" />);

    await choose(/draft/i, /publish show/i);

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('leaves it to the server when the demo flag cannot be read for a club without payouts', async () => {
    mockStripe({ data: null });
    mockDemo(undefined);
    render(<ShowStatusPill {...WINDOW} showId="show-1" status="draft" clubId="club-1" />);

    await choose(/draft/i, /publish show/i);

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
  });

  it('publishes when payouts are enabled', async () => {
    mockStripe({ data: { onboarding_complete: true, payouts_enabled: true } });
    render(<ShowStatusPill {...WINDOW} showId="show-1" status="draft" clubId="club-1" />);

    await choose(/draft/i, /publish show/i);

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
  });

  it('shows the reason without a link to someone who cannot open the club Payments tab', async () => {
    canOpen.value = false;
    mockStripe({ data: null });
    render(<ShowStatusPill {...WINDOW} showId="show-1" status="draft" clubId="club-1" />);

    await choose(/draft/i, /publish show/i);

    expect(toast.error).toHaveBeenCalledWith(clubPayoutsMessage('not-connected'), undefined);
  });

  it('keeps the server text, with the link, for a payouts refusal when the state looks ready', async () => {
    mockStripe({ data: { onboarding_complete: true, payouts_enabled: true } });
    mutateAsync.mockRejectedValueOnce({ code: 'MK003', message: PUBLISH_BLOCKED_MESSAGE });
    render(<ShowStatusPill {...WINDOW} showId="show-1" status="draft" clubId="club-1" />);

    await choose(/draft/i, /publish show/i);

    expect(toast.error).toHaveBeenCalledWith(
      PUBLISH_BLOCKED_MESSAGE,
      expect.objectContaining({ action: expect.objectContaining({ label: 'Open Payments' }) })
    );
  });

  it('shows another MK003 refusal as the server wrote it, with no Payments link', async () => {
    mockStripe({ data: { onboarding_complete: true, payouts_enabled: true } });
    const other =
      'A published show always takes online entries. Turn online entries on, or keep this show as a draft.';
    mutateAsync.mockRejectedValueOnce({ code: 'MK003', message: other });
    render(<ShowStatusPill {...WINDOW} showId="show-1" status="draft" clubId="club-1" />);

    await choose(/draft/i, /publish show/i);

    expect(toast.error).toHaveBeenCalledWith(other);
  });

  it('still needs club authorization first', async () => {
    mockStripe({ data: null });
    mockAuthorized(null);
    render(<ShowStatusPill {...WINDOW} showId="show-1" status="draft" clubId="club-1" />);

    await userEvent.setup().click(screen.getByRole('button', { name: /draft/i }));
    const item = await screen.findByRole('menuitem', { name: /publish show/i });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(CLUB_UNAUTHORIZED_MESSAGE)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('does not re-gate a move between two public statuses (upcoming -> published)', async () => {
    mockStripe({ data: null });
    render(<ShowStatusPill {...WINDOW} showId="show-1" status="upcoming" clubId="club-1" />);

    await choose(/upcoming/i, /publish show/i);

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
  });
});
