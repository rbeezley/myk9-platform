import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionManager } from '../SubscriptionManager';

/**
 * 2026-06-10 walkthrough finding: the component queried
 * stripe_subscriptions.customer_id (a stripe_customers row uuid) with the
 * AUTH user id, which never matches — every premium subscriber saw
 * "No active subscription". It must resolve its own stripe_customers row
 * first (RLS scopes that table to the signed-in person).
 */

type QueryResult = { data: unknown; error: null };

const { builders, fromMock, loggerErrorMock } = vi.hoisted(() => {
  function makeBuilder() {
    const b: Record<string, unknown> & { result: QueryResult } = {
      result: { data: null, error: null },
    };
    for (const m of ['select', 'eq', 'order', 'limit']) {
      b[m] = vi.fn(() => b);
    }
    b.maybeSingle = vi.fn(() => Promise.resolve(b.result));
    // The invoices query awaits the chain directly (no maybeSingle).
    b.then = (resolve: (v: QueryResult) => void) => Promise.resolve(b.result).then(resolve);
    return b;
  }
  const builders = {
    stripe_customers: makeBuilder(),
    stripe_subscriptions: makeBuilder(),
    stripe_orders: makeBuilder(),
  };
  return {
    builders,
    fromMock: vi.fn((table: string) => builders[table as keyof typeof builders]),
    loggerErrorMock: vi.fn(),
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

describe('SubscriptionManager', () => {
  beforeEach(() => {
    fromMock.mockClear();
    loggerErrorMock.mockClear();
    builders.stripe_customers.result = { data: null, error: null };
    builders.stripe_subscriptions.result = { data: null, error: null };
    builders.stripe_orders.result = { data: [], error: null };
  });

  it('renders the free-account empty state when no stripe customer exists', async () => {
    render(<SubscriptionManager />);

    expect(await screen.findByText('No active subscription')).toBeInTheDocument();
    expect(screen.getByText('No billing history available')).toBeInTheDocument();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it('looks up the subscription via the stripe_customers row id, not the auth user id', async () => {
    builders.stripe_customers.result = { data: { id: 'cus-row-uuid' }, error: null };
    builders.stripe_subscriptions.result = {
      data: {
        stripe_subscription_id: 'sub_123',
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
      expect(screen.getByText('Premium')).toBeInTheDocument();
    });

    const subsEq = builders.stripe_subscriptions.eq as ReturnType<typeof vi.fn>;
    expect(subsEq).toHaveBeenCalledWith('customer_id', 'cus-row-uuid');
    expect(subsEq).not.toHaveBeenCalledWith('customer_id', 'auth-user-uuid');
  });

  it('shows the annual price and interval for the annual price id', async () => {
    builders.stripe_customers.result = { data: { id: 'cus-row-uuid' }, error: null };
    builders.stripe_subscriptions.result = {
      data: {
        stripe_subscription_id: 'sub_123',
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
  });
});
