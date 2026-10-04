/**
 * MYK9-979: the status pill mirrors enforce_show_publish_gate's rule —
 * publishing needs the club's Stripe payouts ONLY when the show takes online
 * entries, and the gate runs on a move that makes the show public, not on a
 * move between two public statuses.
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
  CLUB_UNAUTHORIZED_MESSAGE,
  PUBLISH_BLOCKED_MESSAGE,
} from '@/features/payments/onlineEntryGate';
import { toast } from 'sonner';

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

const WINDOW = {
  entryOpenDate: '2026-10-01T12:00:00.000Z',
  entryCloseDate: '2026-10-20T04:59:00.000Z',
};

function mockStripe(state: { data: { payouts_enabled: boolean } | null; isError?: boolean }) {
  vi.mocked(useClubStripeAccount).mockReturnValue({
    data: state.data,
    isLoading: false,
    isError: state.isError ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useClubStripeAccount>);
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

describe('ShowStatusPill — online entries switch (MYK9-979)', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateShowMutation).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
    mockAuthorized('2026-01-01T00:00:00Z');
  });

  it('publishes a mail-in show (online entries off) for a club with no payment account', async () => {
    mockStripe({ data: null });
    render(
      <ShowStatusPill
        {...WINDOW}
        showId="show-1"
        status="draft"
        clubId="club-1"
        onlineEntriesEnabled={false}
      />
    );

    await choose(/draft/i, /publish show/i);

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does not wait on, or fail for, an unreadable payment account when online entries are off', async () => {
    mockStripe({ data: null, isError: true });
    render(
      <ShowStatusPill
        {...WINDOW}
        showId="show-1"
        status="draft"
        clubId="club-1"
        onlineEntriesEnabled={false}
      />
    );

    await choose(/draft/i, /publish show/i);

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
  });

  it('refuses to publish a show with online entries on when the club has no payouts', async () => {
    mockStripe({ data: null });
    render(
      <ShowStatusPill
        {...WINDOW}
        showId="show-1"
        status="draft"
        clubId="club-1"
        onlineEntriesEnabled
      />
    );

    await choose(/draft/i, /publish show/i);

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      PUBLISH_BLOCKED_MESSAGE,
      expect.objectContaining({ action: expect.objectContaining({ label: 'Open Payments' }) })
    );
  });

  it('still needs club authorization with online entries off', async () => {
    mockStripe({ data: null });
    mockAuthorized(null);
    render(
      <ShowStatusPill
        {...WINDOW}
        showId="show-1"
        status="draft"
        clubId="club-1"
        onlineEntriesEnabled={false}
      />
    );

    await choose(/draft/i, /publish show/i);

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(CLUB_UNAUTHORIZED_MESSAGE);
  });

  it('does not re-gate a move between two public statuses (upcoming -> published)', async () => {
    // The show is already public; the DB trigger does not re-check it either.
    mockStripe({ data: null });
    mockAuthorized(null);
    render(
      <ShowStatusPill
        {...WINDOW}
        showId="show-1"
        status="upcoming"
        clubId="club-1"
        onlineEntriesEnabled
      />
    );

    await choose(/upcoming/i, /publish show/i);

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
  });
});
