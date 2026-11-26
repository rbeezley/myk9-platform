import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClubPaymentsCard } from '../ClubPaymentsCard';
import * as accountModule from '../useClubStripeAccount';
import type { ClubStripeAccount } from '../useClubStripeAccount';
import { useClubFinancialReconciliation } from '@/features/financial/useClubFinancialReconciliation';
import { useClubShowPayoutFigures } from '../useClubShowPayoutFigures';
import { payoutFigures, payoutFiguresWith } from '../clubShowPayoutFiguresFixtures';

vi.mock('../useClubStripeAccount', async importOriginal => {
  const original = await importOriginal<typeof accountModule>();
  return {
    ...original,
    useClubStripeAccount: vi.fn(),
    startConnectOnboarding: vi.fn(),
  };
});

// The reconciliation card (MYK9-54 task 3.1) makes its own React Query calls
// through the shared financial service and the payout-figures RPC. This suite is
// about the bank-account connect/status flow, so both hooks are stubbed to an
// empty, settled result — the card's own behavior is covered by
// ClubFinancialReconciliationCard.test.tsx.
vi.mock('@/features/financial/useClubFinancialReconciliation', () => ({
  useClubFinancialReconciliation: vi.fn(() => ({
    rows: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}));

vi.mock('../useClubShowPayoutFigures', () => ({
  useClubShowPayoutFigures: vi.fn(),
}));

const mockedUseAccount = vi.mocked(accountModule.useClubStripeAccount);
const mockedStartOnboarding = vi.mocked(accountModule.startConnectOnboarding);
const mockedReconciliation = vi.mocked(useClubFinancialReconciliation);
const mockedFigures = vi.mocked(useClubShowPayoutFigures);

function mockFigureRows(rows: ReturnType<typeof payoutFigures>[]) {
  mockedFigures.mockReturnValue({
    data: rows,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useClubShowPayoutFigures>);
}

/** One show still owed $50.00 whose payout is in `status`, as the figures RPC returns it. */
function showRow(status: string | null, failureReason: string | null = null) {
  mockFigureRows([
    status ? payoutFiguresWith(status, { payout_failure_reason: failureReason }) : payoutFigures(),
  ]);
}

function mockAccountState(data: ClubStripeAccount | null, overrides: Record<string, unknown> = {}) {
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
  // A row set by one test must not reach the next (CI shuffles).
  mockedReconciliation.mockReturnValue({
    rows: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockFigureRows([]);
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: vi.fn(), search: '' },
    writable: true,
  });
});

describe('ClubPaymentsCard', () => {
  it('not connected: shows the connect button, NOT the checklist, NOT a redirect', () => {
    mockAccountState(null);
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByRole('button', { name: /connect bank account/i })).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: /connect bank account/i }));

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

    await user.click(screen.getByRole('button', { name: /connect bank account/i }));
    const notNow = screen.getByRole('button', { name: 'Not now' });
    notNow.focus();
    await user.keyboard('{Enter}');

    expect(screen.queryByText(/before you start/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect bank account/i })).toBeInTheDocument();
    expect(mockedStartOnboarding).not.toHaveBeenCalled();
  });

  it('Continue to Stripe calls the onboard function with the club id and return path', async () => {
    mockAccountState(null);
    mockedStartOnboarding.mockResolvedValue('https://connect.stripe.com/setup/x');
    const user = userEvent.setup();
    render(<ClubPaymentsCard clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /connect bank account/i }));
    await user.click(screen.getByRole('button', { name: /continue to stripe/i }));

    await waitFor(() => {
      expect(mockedStartOnboarding).toHaveBeenCalledWith('club-1', '/club-admin/payments/club-1');
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://connect.stripe.com/setup/x');
  });

  it('onboard failure shows an inline error with retry — never a dead button', async () => {
    mockAccountState(null);
    mockedStartOnboarding.mockRejectedValue(new Error('Stripe is unavailable'));
    const user = userEvent.setup();
    render(<ClubPaymentsCard clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /connect bank account/i }));
    await user.click(screen.getByRole('button', { name: /continue to stripe/i }));

    expect(await screen.findByText(/stripe is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('onboarding incomplete: offers resume without the checklist', () => {
    mockAccountState(connectedAccount({ onboarding_complete: false }));
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByRole('button', { name: /finish setting up/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect bank account/i })).not.toBeInTheDocument();
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
      expect(mockedStartOnboarding).toHaveBeenCalledWith('club-1', '/club-admin/payments/club-1');
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://connect.stripe.com/setup/resume');
  });

  it('payouts enabled: shows the green badge and no setup actions', () => {
    mockAccountState(connectedAccount({ onboarding_complete: true, payouts_enabled: true }));
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByText(/payouts enabled/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect bank account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finish setting up/i })).not.toBeInTheDocument();
  });

  it('query error: shows load failure with retry', () => {
    const refetch = vi.fn();
    mockAccountState(null, { isError: true, refetch });
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByText(/couldn't load your bank account status/i)).toBeInTheDocument();
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

  it('the box says when entry fees are sent, and never "automatically"', () => {
    mockAccountState(connectedAccount({ onboarding_complete: true, payouts_enabled: true }));
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(
      screen.getByText(
        'Entry fees are sent to your club’s bank account within five business days of each show.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/automatic/i)).not.toBeInTheDocument();
  });

  it('an account under review never says "automatically" either', () => {
    mockAccountState(connectedAccount({ onboarding_complete: true, payouts_enabled: false }));
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.queryByText(/automatic/i)).not.toBeInTheDocument();
  });

  it("a show waiting on the bank account links to the Bank account card's checklist", async () => {
    mockAccountState(null);
    showRow(null);
    const user = userEvent.setup();
    render(<ClubPaymentsCard clubId="club-1" />);

    expect(screen.getByText("Waiting for your club's bank account.")).toBeInTheDocument();
    const [bankCardButton, rowButton] = screen.getAllByRole('button', {
      name: 'Connect bank account',
    });
    expect(bankCardButton).toBeDefined();
    await user.click(rowButton!);

    // The checklist the INTENT keeps in front of Stripe, never a direct redirect.
    expect(screen.getByText(/before you start/i)).toBeInTheDocument();
    expect(mockedStartOnboarding).not.toHaveBeenCalled();
  });

  it("Fix it on a club failure opens Stripe for the club's account", async () => {
    mockAccountState(connectedAccount({ onboarding_complete: true, payouts_enabled: true }));
    showRow('failed', 'club_account:account_closed: The bank account is closed');
    mockedStartOnboarding.mockResolvedValue('https://connect.stripe.com/setup/fix');
    const user = userEvent.setup();
    render(<ClubPaymentsCard clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: 'Fix it' }));

    await waitFor(() => {
      expect(mockedStartOnboarding).toHaveBeenCalledWith('club-1', '/club-admin/payments/club-1');
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://connect.stripe.com/setup/fix');
  });

  it('a Fix it that fails brings the error into view and focus, never a silent no-op', async () => {
    mockAccountState(connectedAccount({ onboarding_complete: true, payouts_enabled: true }));
    showRow('failed', 'club_account:account_closed: The bank account is closed');
    mockedStartOnboarding.mockRejectedValue(new Error('Confirm your password to continue.'));
    const user = userEvent.setup();
    render(<ClubPaymentsCard clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: 'Fix it' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Confirm your password to continue.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
