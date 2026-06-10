import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowStatusPill } from './ShowStatusPill';
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

describe('ShowStatusPill publish gate', () => {
  let mutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShowMutation>);
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

  it('without a clubId (legacy call sites) the gate is inert', async () => {
    mockAccount(null);
    const user = userEvent.setup();
    render(<ShowStatusPill showId="show-1" status="draft" />);

    await user.click(screen.getByRole('button', { name: /draft/i }));
    await user.click(await screen.findByText(/publish show/i));

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'published' } });
  });

  it('moving a published show back to draft is never gated', async () => {
    mockAccount(null);
    const user = userEvent.setup();
    render(<ShowStatusPill showId="show-1" status="published" clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /published/i }));
    await user.click(await screen.findByText(/move to draft/i));

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'draft' } });
  });
});
