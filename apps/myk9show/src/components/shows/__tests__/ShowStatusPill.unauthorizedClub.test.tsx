import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowStatusPill } from '../ShowStatusPill';
import {
  useClubStripeAccount,
  useClubAuthorization,
} from '@/features/payments/useClubStripeAccount';
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import { CLUB_UNAUTHORIZED_MESSAGE } from '@/features/payments/onlineEntryGate';

vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripeAccount: vi.fn(),
  useClubAuthorization: vi.fn(),
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useUpdateShowMutation: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// MYK9-1387: while the host club is unauthorized the Publish item reads as
// unavailable, with the reason on screen beside it (not a transient toast).
const WINDOW = {
  entryOpenDate: '2026-10-01T12:00:00.000Z',
  entryCloseDate: '2026-10-20T04:59:00.000Z',
  onlineEntriesEnabled: true,
};

function mockAuth(state: 'unauthorized' | 'authorized' | 'loading') {
  vi.mocked(useClubAuthorization).mockReturnValue({
    data:
      state === 'loading'
        ? undefined
        : { authorized_at: state === 'authorized' ? '2026-01-01T00:00:00Z' : null },
    isLoading: state === 'loading',
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useClubAuthorization>);
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Draft' }));
  const item = await screen.findByRole('menuitem', { name: /Publish Show/ });
  return { user, item };
}

describe('ShowStatusPill — unauthorized club (MYK9-1387)', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateShowMutation).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
    vi.mocked(useClubStripeAccount).mockReturnValue({
      data: { payouts_enabled: true, onboarding_complete: true },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useClubStripeAccount>);
  });

  it('disables Publish Show and shows the authorization reason in the open menu', async () => {
    mockAuth('unauthorized');
    render(<ShowStatusPill {...WINDOW} showId="s1" status="draft" clubId="club-1" />);
    const { user, item } = await openMenu();

    expect(item).toHaveAttribute('aria-disabled', 'true');
    // The reason is described by, but not inside, the half-opacity disabled item.
    const reason = screen.getByText(CLUB_UNAUTHORIZED_MESSAGE);
    expect(item).not.toContainElement(reason);
    expect(item).toHaveAttribute('aria-describedby', reason.id);

    await user.click(item);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('re-checks the authorization each time the menu opens, since the disabled item cannot', async () => {
    mockAuth('unauthorized');
    render(<ShowStatusPill {...WINDOW} showId="s1" status="draft" clubId="club-1" />);
    await openMenu();

    expect(vi.mocked(useClubAuthorization).mock.results[0]?.value.refetch).toHaveBeenCalledTimes(1);
  });

  it('leaves Publish Show enabled with no reason for an authorized club', async () => {
    mockAuth('authorized');
    render(<ShowStatusPill {...WINDOW} showId="s1" status="draft" clubId="club-1" />);
    const { item } = await openMenu();

    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText(CLUB_UNAUTHORIZED_MESSAGE)).not.toBeInTheDocument();
  });

  it('leaves Publish Show enabled while the authorization is still loading', async () => {
    mockAuth('loading');
    render(<ShowStatusPill {...WINDOW} showId="s1" status="draft" clubId="club-1" />);
    const { item } = await openMenu();

    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText(CLUB_UNAUTHORIZED_MESSAGE)).not.toBeInTheDocument();
  });

  // Moved from ShowStatusPill.test.tsx (MYK9-572): authorization wins over Stripe readiness.
  it('names the authorization wait, not the Stripe one, when the club is both unauthorized and not Stripe-ready', async () => {
    mockAuth('unauthorized');
    vi.mocked(useClubStripeAccount).mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useClubStripeAccount>);
    render(<ShowStatusPill {...WINDOW} showId="s1" status="draft" clubId="club-1" />);
    const { user, item } = await openMenu();

    expect(screen.getByText(CLUB_UNAUTHORIZED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/payment account/i)).not.toBeInTheDocument();
    await user.click(item);
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
