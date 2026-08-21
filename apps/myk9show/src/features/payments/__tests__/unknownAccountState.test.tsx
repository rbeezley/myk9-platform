/**
 * The account state is a TRI-state, and this suite exists because it used to be
 * a boolean.
 *
 * `enabled = !!account && account.payouts_enabled` is false while the Stripe
 * account query is loading and while it has errored. That false was handed to
 * the reconciliation card, which renders OUTSIDE the account card's
 * loading/error guard, and came out the other end as a treasurer-facing badge
 * reading "Waiting for account" — telling a fully onboarded club its money was
 * stuck behind a bank account it had already connected.
 *
 * No test could catch it: the prop was typed `boolean`, so the broken state was
 * not expressible. These tests are written against the state that used to be
 * untypeable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ClubPaymentsCard } from '../ClubPaymentsCard';
import { resolvePayoutBadge } from '../payoutBadge';
import { resolvePayoutSettlement } from '@/features/financial/payoutSettlement';
import * as accountModule from '../useClubStripeAccount';
import type { ClubStripeAccount } from '../useClubStripeAccount';
import { useClubFinancialReconciliation } from '@/features/financial/useClubFinancialReconciliation';

vi.mock('../useClubStripeAccount', async importOriginal => {
  const original = await importOriginal<typeof accountModule>();
  return {
    ...original,
    useClubStripeAccount: vi.fn(),
    useClubPayoutHistory: vi.fn(),
    startConnectOnboarding: vi.fn(),
  };
});

vi.mock('@/features/financial/useClubFinancialReconciliation', () => ({
  useClubFinancialReconciliation: vi.fn(() => ({
    rows: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}));

const mockedUseAccount = vi.mocked(accountModule.useClubStripeAccount);
const mockedUsePayoutHistory = vi.mocked(accountModule.useClubPayoutHistory);
const mockedReconciliation = vi.mocked(useClubFinancialReconciliation);

function mockAccount(state: Record<string, unknown>) {
  mockedUseAccount.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof accountModule.useClubStripeAccount>);
  mockedUsePayoutHistory.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof accountModule.useClubPayoutHistory>);
}

/** The account state the card handed the reconciliation card on this render. */
function accountStatePassedDown(): unknown {
  const lastCall = mockedReconciliation.mock.calls.at(-1);
  return lastCall?.[1];
}

const enabledAccount: ClubStripeAccount = {
  id: 'csa-1',
  club_id: 'club-1',
  stripe_account_id: 'acct_test',
  onboarding_complete: true,
  payouts_enabled: true,
};

describe('unknown account state is never reported as "not connected"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('while the account query is LOADING, the reconciliation card is told "unknown"', () => {
    mockAccount({ isLoading: true });
    render(<ClubPaymentsCard clubId="club-1" />);
    expect(accountStatePassedDown()).toBe('unknown');
  });

  it('when the account query ERRORED, the reconciliation card is told "unknown"', () => {
    mockAccount({ isError: true });
    render(<ClubPaymentsCard clubId="club-1" />);
    expect(accountStatePassedDown()).toBe('unknown');
  });

  it('a settled query with no account row is "not-enabled", which IS a fact', () => {
    mockAccount({ isSuccess: true, data: null });
    render(<ClubPaymentsCard clubId="club-1" />);
    expect(accountStatePassedDown()).toBe('not-enabled');
  });

  it('a settled query with payouts on is "enabled"', () => {
    mockAccount({ isSuccess: true, data: enabledAccount });
    render(<ClubPaymentsCard clubId="club-1" />);
    expect(accountStatePassedDown()).toBe('enabled');
  });
});

describe('the badge an unknown account state produces', () => {
  const pending = { status: 'pending' as const, failure_reason: null };

  it('does not claim a missing bank account', () => {
    const badge = resolvePayoutBadge(pending, 'unknown');
    expect(badge.label).toBe('Not sent yet');
    expect(badge.label).not.toBe('Waiting for account');
  });

  it('does not claim the transfer is scheduled either', () => {
    // The opposite failure mode, and the reason this is a nominal union rather
    // than `boolean | 'unknown'`: the string 'unknown' is truthy, so a looser
    // type would have routed every unknown into the enabled branch.
    expect(resolvePayoutBadge(pending, 'unknown').label).not.toBe('Scheduled');
  });

  it('still buckets as in-progress, so attention counts are unchanged', () => {
    const row = resolvePayoutSettlement(
      {
        payoutId: 'po-1',
        status: 'pending',
        amountCents: 12_500,
        stripeTransferId: null,
        failureReason: null,
      },
      'unknown'
    );
    expect(row.badgeLabel).toBe('Not sent yet');
    expect(row.state).toBe('in_progress');
  });

  it('only the two known states make a claim about the bank account', () => {
    expect(resolvePayoutBadge(pending, 'enabled').label).toBe('Scheduled');
    expect(resolvePayoutBadge(pending, 'not-enabled').label).toBe('Waiting for account');
  });
});
