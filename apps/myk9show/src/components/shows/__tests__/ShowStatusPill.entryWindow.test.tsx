/**
 * MYK9-716: a draft may have no entry window, but publishing requires one.
 * The status pill is the only surface that publishes a show, so it refuses a
 * windowless publish before the write, names the problem, and links to the
 * Edit panel's Basic Info tab where the entry dates live. The DB trigger
 * (enforce_show_publish_gate, SQLSTATE MK005) is the backstop.
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
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import {
  ENTRY_WINDOW_ORDER_MESSAGE,
  ENTRY_WINDOW_REQUIRED_MESSAGE,
} from '@/features/payments/onlineEntryGate';
import { toast } from 'sonner';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
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

const OPEN = '2026-10-01T12:00:00.000Z';
const CLOSE = '2026-10-20T04:59:00.000Z';

type ToastAction = { label: string; onClick: () => void };

describe('ShowStatusPill entry-window publish gate (MYK9-716)', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateShowMutation).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
    // Authorized and Stripe-ready: the entry window is the only thing missing.
    vi.mocked(useClubStripeAccount).mockReturnValue({
      data: { payouts_enabled: true },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useClubStripeAccount>);
    vi.mocked(useClubAuthorization).mockReturnValue({
      data: { authorized_at: '2026-01-01T00:00:00Z' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useClubAuthorization>);
  });

  async function clickPublish() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /draft/i }));
    await user.click(await screen.findByText(/publish show/i));
  }

  function lastToastAction(): ToastAction {
    const call = vi.mocked(toast.error).mock.calls.at(-1);
    return (call?.[1] as { action: ToastAction }).action;
  }

  it('blocks publishing a show with no entry window, and links to the entry dates', async () => {
    render(
      <ShowStatusPill
        showId="show-1"
        status="draft"
        clubId="club-1"
        entryOpenDate=""
        entryCloseDate={null}
      />
    );

    await clickPublish();

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      ENTRY_WINDOW_REQUIRED_MESSAGE,
      expect.objectContaining({ action: expect.objectContaining({ label: 'Set entry window' }) })
    );
    lastToastAction().onClick();
    expect(navigate).toHaveBeenCalledWith('/shows/show-1?edit=true');
  });

  it('blocks publishing a window that closes before it opens', async () => {
    render(
      <ShowStatusPill
        showId="show-1"
        status="draft"
        clubId="club-1"
        entryOpenDate={CLOSE}
        entryCloseDate={OPEN}
      />
    );

    await clickPublish();

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(ENTRY_WINDOW_ORDER_MESSAGE, expect.anything());
  });

  it('publishes once the entry window is set', async () => {
    render(
      <ShowStatusPill
        showId="show-1"
        status="draft"
        clubId="club-1"
        entryOpenDate={OPEN}
        entryCloseDate={CLOSE}
      />
    );

    await clickPublish();

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
    expect(toast.success).toHaveBeenCalledWith('Show published.');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('moving a published show back to draft never asks for a window', async () => {
    render(
      <ShowStatusPill
        showId="show-1"
        status="published"
        clubId="club-1"
        entryOpenDate={null}
        entryCloseDate={null}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /published/i }));
    await user.click(await screen.findByText(/move to draft/i));

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'draft' } });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('surfaces the DB trigger refusal (MK005) with the entry-window link, not Open Payments', async () => {
    // A stale cache let a windowless show past the client check.
    mutateAsync.mockRejectedValueOnce({ code: 'MK005', message: ENTRY_WINDOW_REQUIRED_MESSAGE });
    render(
      <ShowStatusPill
        showId="show-1"
        status="draft"
        clubId="club-1"
        entryOpenDate={OPEN}
        entryCloseDate={CLOSE}
      />
    );

    await clickPublish();

    expect(toast.error).toHaveBeenCalledWith(
      ENTRY_WINDOW_REQUIRED_MESSAGE,
      expect.objectContaining({ action: expect.objectContaining({ label: 'Set entry window' }) })
    );
    lastToastAction().onClick();
    expect(navigate).toHaveBeenCalledWith('/shows/show-1?edit=true');
  });
});
