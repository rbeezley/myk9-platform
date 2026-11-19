/**
 * MYK9-2164: the server decides whether a club's payouts allow Publish (enforce_show_publish_gate,
 * MYK9-2163). The pill sends the move and shows the server's refusal as written, with a link to
 * the club's Payments tab only for someone who can open it. It never reads the Stripe account.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowStatusPill } from '../ShowStatusPill';
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import {
  CLUB_REQUIRED_MESSAGE,
  CLUB_UNAUTHORIZED_MESSAGE,
  ONLINE_ENTRIES_BLOCKED_MESSAGE,
  ONLINE_ENTRIES_REQUIRED_MESSAGE,
  PUBLISH_BLOCKED_MESSAGE,
} from '@/features/payments/onlineEntryGate';
import { toast } from 'sonner';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

const canOpen = vi.hoisted(() => ({ value: true }));
vi.mock('@/features/payments/useCanOpenClubPayments', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/payments/useCanOpenClubPayments')>()),
  useCanOpenClubPayments: () => canOpen.value,
}));
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
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

async function publish() {
  render(<ShowStatusPill showId="show-1" status="draft" clubId="club-1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /draft/i }));
  await user.click(await screen.findByText(/publish show/i));
}

function paymentsAction() {
  const call = vi.mocked(toast.error).mock.calls.at(-1);
  return (call?.[1] as { action: { label: string; onClick: () => void } }).action;
}

describe('ShowStatusPill: the server decides on payouts (MYK9-2164)', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateShowMutation).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
    canOpen.value = true;
  });

  it('sends Publish to the server with no payouts precheck', async () => {
    await publish();

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the server payouts refusal as written, with a link to the Payments tab', async () => {
    mutateAsync.mockRejectedValueOnce({ code: 'MK003', message: PUBLISH_BLOCKED_MESSAGE });

    await publish();

    expect(toast.error).toHaveBeenCalledWith(
      PUBLISH_BLOCKED_MESSAGE,
      expect.objectContaining({ action: expect.objectContaining({ label: 'Open Payments' }) })
    );
    paymentsAction().onClick();
    expect(navigate).toHaveBeenCalledWith('/clubs/club-1?tab=payments');
  });

  it('links the other payouts refusal to the Payments tab too', async () => {
    mutateAsync.mockRejectedValueOnce({ code: 'MK003', message: ONLINE_ENTRIES_BLOCKED_MESSAGE });

    await publish();

    expect(toast.error).toHaveBeenCalledWith(
      ONLINE_ENTRIES_BLOCKED_MESSAGE,
      expect.objectContaining({ action: expect.objectContaining({ label: 'Open Payments' }) })
    );
  });

  it('shows the server payouts refusal with no link to someone who cannot open the Payments tab', async () => {
    canOpen.value = false;
    mutateAsync.mockRejectedValueOnce({ code: 'MK003', message: PUBLISH_BLOCKED_MESSAGE });

    await publish();

    expect(toast.error).toHaveBeenCalledWith(PUBLISH_BLOCKED_MESSAGE, undefined);
  });

  it('shows another MK003 refusal as the server wrote it, with no link', async () => {
    mutateAsync.mockRejectedValueOnce({ code: 'MK003', message: ONLINE_ENTRIES_REQUIRED_MESSAGE });

    await publish();

    expect(toast.error).toHaveBeenCalledWith(ONLINE_ENTRIES_REQUIRED_MESSAGE);
  });

  it('shows the missing-club refusal with no link', async () => {
    mutateAsync.mockRejectedValueOnce({ code: 'MK003', message: CLUB_REQUIRED_MESSAGE });

    await publish();

    expect(toast.error).toHaveBeenCalledWith(CLUB_REQUIRED_MESSAGE);
  });

  it('shows the MK004 refusal with no link', async () => {
    mutateAsync.mockRejectedValueOnce({ code: 'MK004', message: CLUB_UNAUTHORIZED_MESSAGE });

    await publish();

    expect(toast.error).toHaveBeenCalledWith(CLUB_UNAUTHORIZED_MESSAGE);
  });
});
