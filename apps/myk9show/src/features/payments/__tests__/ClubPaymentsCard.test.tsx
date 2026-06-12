import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClubPaymentsCard } from '../ClubPaymentsCard';
import * as accountModule from '../useClubStripeAccount';
import type { ClubStripeAccount } from '../useClubStripeAccount';

vi.mock('../useClubStripeAccount', async importOriginal => {
  const original = await importOriginal<typeof accountModule>();
  return {
    ...original,
    useClubStripeAccount: vi.fn(),
    useClubPayoutHistory: vi.fn(),
    startConnectOnboarding: vi.fn(),
  };
});

const mockedUseAccount = vi.mocked(accountModule.useClubStripeAccount);
const mockedUsePayoutHistory = vi.mocked(accountModule.useClubPayoutHistory);
const mockedStartOnboarding = vi.mocked(accountModule.startConnectOnboarding);

function mockAccountState(data: ClubStripeAccount | null, overrides: Record<string, unknown> = {}) {
  mockedUseAccount.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof accountModule.useClubStripeAccount>);
  mockedUsePayoutHistory.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof accountModule.useClubPayoutHistory>);
}

const connectedAccount = (flags: Partial<ClubStripeAccount>): ClubStripeAccount => ({
  id: 'csa-1',
  club_id: 'club-1',
  stripe_account_id: 'acct_test',
  onboarding_complete: false,
  payouts_enabled: false,
  ...flags,
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: vi.fn(), search: '' },
    writable: true,
  });
});

describe('ClubPaymentsCard', () => {
  it('not connected: shows the connect button, NOT the checklist, NOT a redirect', () => {
    mockAccountState(null);
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByRole('button', { name: /connect payment account/i })).toBeInTheDocument();
    expect(screen.queryByText(/before you start/i)).not.toBeInTheDocument();
    expect(mockedStartOnboarding).not.toHaveBeenCalled();
  });

  it('clicking connect reveals the checklist with the SSN reassurance — still no redirect', async () => {
    mockAccountState(null);
    const user = userEvent.setup();
    render(<ClubPaymentsCard clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /connect payment account/i }));

    expect(screen.getByText(/before you start/i)).toBeInTheDocument();
    expect(screen.getByText(/federal banking law/i)).toBeInTheDocument();
    expect(screen.getByText(/never sees or stores this information/i)).toBeInTheDocument();
    expect(screen.getByText(/not a personal one/i)).toBeInTheDocument();
    expect(mockedStartOnboarding).not.toHaveBeenCalled();
  });

  it('Continue to Stripe calls the onboard function with the club id and return path', async () => {
    mockAccountState(null);
    mockedStartOnboarding.mockResolvedValue('https://connect.stripe.com/setup/x');
    const user = userEvent.setup();
    render(<ClubPaymentsCard clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /connect payment account/i }));
    await user.click(screen.getByRole('button', { name: /continue to stripe/i }));

    await waitFor(() => {
      expect(mockedStartOnboarding).toHaveBeenCalledWith('club-1', '/club-admin/payments');
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://connect.stripe.com/setup/x');
  });

  it('onboard failure shows an inline error with retry — never a dead button', async () => {
    mockAccountState(null);
    mockedStartOnboarding.mockRejectedValue(new Error('Stripe is unavailable'));
    const user = userEvent.setup();
    render(<ClubPaymentsCard clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /connect payment account/i }));
    await user.click(screen.getByRole('button', { name: /continue to stripe/i }));

    expect(await screen.findByText(/stripe is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('onboarding incomplete: offers resume without the checklist', () => {
    mockAccountState(connectedAccount({ onboarding_complete: false }));
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByRole('button', { name: /finish setting up/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect payment account/i })).not.toBeInTheDocument();
  });

  it('onboarded but payouts pending: under-review state still offers a resume path', () => {
    // 2026-06-10 walkthrough: Stripe can pause an account with "actions
    // required" AFTER details_submitted (11 past-due items). The old copy
    // ("nothing more for you to do") deadlocked the treasurer — Stripe was
    // waiting on THEM and the card offered no way back into onboarding.
    mockAccountState(connectedAccount({ onboarding_complete: true, payouts_enabled: false }));
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByText(/under review by stripe/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add missing information/i })).toBeInTheDocument();
    expect(screen.queryByText(/nothing\s+more for you to do/i)).not.toBeInTheDocument();
  });

  it('under-review resume button calls the onboard function (same resume link)', async () => {
    mockAccountState(connectedAccount({ onboarding_complete: true, payouts_enabled: false }));
    mockedStartOnboarding.mockResolvedValue('https://connect.stripe.com/setup/resume');
    const user = userEvent.setup();
    render(<ClubPaymentsCard clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /add missing information/i }));

    await waitFor(() => {
      expect(mockedStartOnboarding).toHaveBeenCalledWith('club-1', '/club-admin/payments');
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://connect.stripe.com/setup/resume');
  });

  it('payouts enabled: shows the green badge and no setup actions', () => {
    mockAccountState(connectedAccount({ onboarding_complete: true, payouts_enabled: true }));
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByText(/payouts enabled/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect payment account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finish setting up/i })).not.toBeInTheDocument();
  });

  it('query error: shows load failure with retry', () => {
    const refetch = vi.fn();
    mockAccountState(null, { isError: true, refetch });
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByText(/couldn't load your payment account status/i)).toBeInTheDocument();
  });

  it('renders payout history with show, amount, and status', () => {
    mockAccountState(connectedAccount({ onboarding_complete: true, payouts_enabled: true }));
    mockedUsePayoutHistory.mockReturnValue({
      data: [
        {
          id: 'p1',
          amount_cents: 12450,
          status: 'completed',
          completed_at: '2026-06-09T10:00:00Z',
          created_at: '2026-06-09T09:00:00Z',
          show: { name: 'Cedar Valley Classic' },
        },
        {
          id: 'p2',
          amount_cents: 8000,
          status: 'pending',
          completed_at: null,
          created_at: '2026-06-08T09:00:00Z',
          show: { name: 'Spring Trial' },
        },
      ],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof accountModule.useClubPayoutHistory>);
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByText('Cedar Valley Classic')).toBeInTheDocument();
    expect(screen.getByText('$124.50')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    expect(screen.getByText('$80.00')).toBeInTheDocument();
    expect(screen.getByText('Waiting for account')).toBeInTheDocument();
  });
});
