import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionManager } from '../SubscriptionManager';
import type { EffectiveEntitlement } from '@/features/entitlement/types';

/**
 * 2026-06-10 walkthrough finding: the component queried
 * stripe_subscriptions.customer_id (a stripe_customers row uuid) with the
 * AUTH user id, which never matches — every premium subscriber saw
 * "No active subscription". It must resolve its own stripe_customers row
 * first (RLS scopes that table to the signed-in person).
 *
 * 2026-07-23 refactor: access display now comes from useEntitlement()'s
 * effective entitlement (design.md Decision 6), not by inferring status from
 * a Stripe row. Billing detail lookups (period/amount/portal) still happen
 * for the 'paid' source only.
 */

type QueryResult = { data: unknown; error: null };

const { builders, fromMock, loggerErrorMock, entitlementHolder, refetchMock } = vi.hoisted(() => {
  function makeBuilder() {
    const b: Record<string, unknown> & { result: QueryResult } = {
      result: { data: null, error: null },
    };
    for (const m of ['select', 'eq', 'order', 'limit']) {
      b[m] = vi.fn(() => b);
    }
    b.maybeSingle = vi.fn(() => Promise.resolve(b.result));
    return b;
  }
  const builders = {
    people: makeBuilder(),
    stripe_customers: makeBuilder(),
    stripe_subscriptions: makeBuilder(),
  };
  return {
    builders,
    fromMock: vi.fn((table: string) => builders[table as keyof typeof builders]),
    loggerErrorMock: vi.fn(),
    entitlementHolder: {
      value: null as Record<string, unknown> | null,
      loading: undefined as boolean | undefined,
      error: false,
    },
    refetchMock: vi.fn(),
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'auth-user-uuid' },
    loading: false,
  }),
}));

vi.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock, functions: { invoke: vi.fn() } },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: loggerErrorMock },
}));

vi.mock('@/stripe-config', () => ({
  products: { premium: { priceId: 'price_month' } },
  annualPriceId: 'price_year',
}));

vi.mock('@/features/entitlement/useEntitlement', () => ({
  useEntitlement: () => ({
    effective: entitlementHolder.value,
    isTrusted: true,
    canAuthorizePremium: entitlementHolder.value?.tier === 'premium',
    isLoading: entitlementHolder.loading === true,
    isError: entitlementHolder.error === true,
    refetch: refetchMock,
  }),
}));

const now = new Date();
const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
const past = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

function freeEntitlement(
  analyticsTrial: EffectiveEntitlement['analyticsTrial'] = {
    status: 'unavailable',
    scoredShowCount: null,
    showLimit: 3,
  }
) {
  return {
    tier: 'free',
    status: 'free',
    source: 'none',
    endsAt: null,
    evaluatedAt: now.toISOString(),
    trustedUntil: future,
    analyticsTrial,
  };
}

function activeEntitlement(source: 'paid' | 'founding' | 'complimentary') {
  return {
    tier: 'premium',
    status: 'active',
    source,
    endsAt: future,
    evaluatedAt: now.toISOString(),
    trustedUntil: future,
    canManageBilling: source === 'paid',
    analyticsTrial: { status: 'unavailable', scoredShowCount: null, showLimit: 3 },
  };
}

function expiredEntitlement() {
  return {
    tier: 'free',
    status: 'expired',
    source: 'none',
    endsAt: past,
    evaluatedAt: now.toISOString(),
    trustedUntil: future,
    canManageBilling: false,
    analyticsTrial: { status: 'unavailable', scoredShowCount: null, showLimit: 3 },
  };
}

describe('SubscriptionManager', () => {
  beforeEach(() => {
    fromMock.mockClear();
    loggerErrorMock.mockClear();
    refetchMock.mockClear();
    entitlementHolder.value = null;
    entitlementHolder.loading = undefined;
    entitlementHolder.error = false;
    builders.people.result = { data: { id: 'person-1' }, error: null };
    builders.stripe_customers.result = { data: null, error: null };
    builders.stripe_subscriptions.result = { data: null, error: null };
  });

  it('renders a neutral loading state with no lock/unlock flash', () => {
    entitlementHolder.loading = true;
    render(<SubscriptionManager />);

    expect(screen.queryByText(/free/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/premium/i)).not.toBeInTheDocument();
  });

  it('renders the free-tier upgrade path when no source is active', async () => {
    entitlementHolder.value = freeEntitlement();
    render(<SubscriptionManager />);

    expect(await screen.findByText(/on the free plan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view plans/i })).toBeInTheDocument();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it('shows the Analytics trial as capability-scoped progress, never as account premium', async () => {
    entitlementHolder.value = freeEntitlement({
      status: 'active',
      scoredShowCount: 1,
      showLimit: 3,
    });
    render(<SubscriptionManager />);

    expect(await screen.findByText(/premium analytics trial/i)).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 scored shows used/i)).toBeInTheDocument();
    expect(screen.getByText(/not an account subscription/i)).toBeInTheDocument();
  });

  it('shows expired access with an end date and resubscribe path', async () => {
    entitlementHolder.value = expiredEntitlement();
    render(<SubscriptionManager />);

    expect(
      await screen.findByRole('heading', { name: /premium access ended/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view plans to resubscribe/i })).toBeInTheDocument();
  });

  it('shows founding-member source, end date, and no billing controls', async () => {
    entitlementHolder.value = activeEntitlement('founding');
    render(<SubscriptionManager />);

    expect(
      await screen.findByRole('heading', { name: /founding member premium/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/billing is not applicable/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /manage subscription/i })).not.toBeInTheDocument();
    expect(fromMock).not.toHaveBeenCalledWith('stripe_subscriptions');
  });

  it('shows complimentary source, end date, and no billing controls', async () => {
    entitlementHolder.value = activeEntitlement('complimentary');
    render(<SubscriptionManager />);

    expect(
      await screen.findByRole('heading', { name: /complimentary premium/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/billing is not applicable/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /manage subscription/i })).not.toBeInTheDocument();
  });

  it('looks up and shows Stripe billing details only for the paid source', async () => {
    entitlementHolder.value = activeEntitlement('paid');
    builders.stripe_customers.result = { data: { id: 'cus-row-uuid' }, error: null };
    builders.stripe_subscriptions.result = {
      data: {
        status: 'active',
        stripe_price_id: 'price_year',
        current_period_start: '2026-06-10T18:18:33Z',
        current_period_end: '2027-06-10T18:18:33Z',
        cancel_at_period_end: false,
        customer_id: 'cus-row-uuid',
      },
      error: null,
    };

    render(<SubscriptionManager />);

    await waitFor(() => {
      expect(screen.getByText('$49 / year')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /manage subscription/i })).toBeInTheDocument();

    const subsEq = builders.stripe_subscriptions.eq as ReturnType<typeof vi.fn>;
    expect(subsEq).toHaveBeenCalledWith('customer_id', 'cus-row-uuid');
    expect(subsEq).not.toHaveBeenCalledWith('customer_id', 'auth-user-uuid');

    // Site admins can read every stripe_customers row, so the lookup must be
    // pinned to the caller's person id — newest-visible-row alone would show
    // an admin someone else's subscription (Codex P2).
    const customersEq = builders.stripe_customers.eq as ReturnType<typeof vi.fn>;
    expect(customersEq).toHaveBeenCalledWith('person_id', 'person-1');

    // No hardcoded usage metrics or dead invoice links.
    expect(screen.queryByText(/billing history/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no billing history available/i)).not.toBeInTheDocument();
  });

  it('shows a non-destructive error with retry when entitlement cannot be verified', async () => {
    entitlementHolder.error = true;
    render(<SubscriptionManager />);

    expect(await screen.findByText(/couldn't verify your account access/i)).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /retry/i });
    retryButton.click();
    expect(refetchMock).toHaveBeenCalled();
  });

  it('keeps the last trusted state visible with a non-destructive banner when a refresh fails', async () => {
    entitlementHolder.value = activeEntitlement('paid');
    entitlementHolder.error = true;
    render(<SubscriptionManager />);

    expect(await screen.findByRole('heading', { name: /^premium$/i })).toBeInTheDocument();
    expect(screen.getByText(/couldn't refresh your account access/i)).toBeInTheDocument();
  });
});
