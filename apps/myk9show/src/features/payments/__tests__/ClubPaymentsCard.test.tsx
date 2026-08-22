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
    startConnectOnboarding: vi.fn(),
  };
});

// The reconciliation card (MYK9-54 task 3.1) makes its own React Query calls
// through the shared financial service. This suite is about the bank-account
// connect/status flow, so the reconciliation hook is stubbed to an empty,
// settled result — its own behavior (verified/attested/mismatch/pending/
// unavailable states) is covered by ClubFinancialReconciliationCard.test.tsx.
vi.mock('@/features/financial/useClubFinancialReconciliation', () => ({
  useClubFinancialReconciliation: vi.fn(() => ({
    rows: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}));

const mockedUseAccount = vi.mocked(accountModule.useClubStripeAccount);
const mockedStartOnboarding = vi.mocked(accountModule.startConnectOnboarding);

function mockAccountState(
  data: ClubStripeAccount | null,
  overrides: Record<string, unknown> = {}
) {
  const base = { data, isLoading: false, isError: false, refetch: vi.fn(), ...overrides };
  mockedUseAccount.mockReturnValue({
    // `isSuccess` is what the card reads to mean "we have a real answer", so the
    // fixture has to carry it or every settled-state test silently exercises the
    // unknown branch. Derived by default so overriding isLoading/isError stays
    // coherent, and still overridable alone for the never-asked (disabled) case.
    isSuccess: !base.isLoading && !base.isError,
    ...base,
  } as unknown as ReturnType<typeof accountModule.useClubStripeAccount>);
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

  it('not connected: explains the resting state instead of a bare CTA', () => {
    mockAccountState(null);
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByText(/no bank account is connected yet/i)).toBeInTheDocument();
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

  it('Not now closes the checklist without starting Stripe onboarding', async () => {
    mockAccountState(null);
    const user = userEvent.setup();
    render(<ClubPaymentsCard clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /connect payment account/i }));
    const notNow = screen.getByRole('button', { name: 'Not now' });
    notNow.focus();
    await user.keyboard('{Enter}');

    expect(screen.queryByText(/before you start/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect payment account/i })).toBeInTheDocument();
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
    expect(
      screen.queryByRole('button', { name: /connect payment account/i })
    ).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole('button', { name: /connect payment account/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finish setting up/i })).not.toBeInTheDocument();
  });

  it('query error: shows load failure with retry', () => {
    const refetch = vi.fn();
    mockAccountState(null, { isError: true, refetch });
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByText(/couldn't load your payment account status/i)).toBeInTheDocument();
  });

  it('does not add a second checkout/payment action alongside the Stripe onboarding flow (no-duplicate-checkout regression)', () => {
    // MYK9-54 explicitly forbids adding a duplicate checkout/payment action —
    // /exhibitor/payments remains the single canonical checkout surface. The
    // club reconciliation enrichment must only ever show read-only
    // status/copy/link-out affordances.
    mockAccountState(connectedAccount({ onboarding_complete: true, payouts_enabled: true }));
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.queryByRole('button', { name: /pay|checkout|charge/i })).not.toBeInTheDocument();
  });
});
