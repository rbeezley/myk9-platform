import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import PricingPage from '../PricingPage';
import { createCheckoutSession } from '@/lib/stripe';

// Mutable holder so individual tests can toggle the annual price's existence.
const configHolder: { annual: string | undefined } = { annual: 'price_annual_test' };

vi.mock('@/stripe-config', () => ({
  products: {
    premium: {
      priceId: 'price_monthly_test',
      name: 'myK9Show Premium Subscription',
      description: 'test',
      mode: 'subscription',
    },
  },
  get annualPriceId() {
    return configHolder.annual;
  },
}));
vi.mock('@/lib/stripe', () => ({ createCheckoutSession: vi.fn() }));
// Mutable holder so tests can exercise the signed-out subscribe path.
const authHolder: { user: { id: string } | null } = { user: { id: 'user-1' } };
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: authHolder.user }),
}));
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('@/components/layout/AppHeader', () => ({
  default: () => <div data-testid="duplicate-app-header" />,
}));
vi.mock('@/components/layout/Footer', () => ({ default: () => null }));

// Mutable holder so tests can exercise active-access current-action states.
const entitlementHolder: { effective: Record<string, unknown> | null } = { effective: null };
vi.mock('@/features/entitlement/useEntitlement', () => ({
  useEntitlement: () => ({
    effective: entitlementHolder.effective,
    isTrusted: true,
    canAuthorizePremium: false,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const mockedCheckout = vi.mocked(createCheckoutSession);

beforeEach(() => {
  vi.clearAllMocks();
  configHolder.annual = 'price_annual_test';
  authHolder.user = { id: 'user-1' };
  entitlementHolder.effective = {
    tier: 'free',
    status: 'free',
    source: 'none',
    endsAt: null,
    evaluatedAt: new Date().toISOString(),
    trustedUntil: new Date(Date.now() + 60_000).toISOString(),
    analyticsTrial: { status: 'unavailable', scoredShowCount: null, showLimit: 3 },
  };
});

describe('PricingPage billing interval', () => {
  it('relies on the app shell instead of mounting a second header', () => {
    render(<PricingPage />);

    expect(screen.queryByTestId('duplicate-app-header')).not.toBeInTheDocument();
  });

  it('defaults to monthly: subscribe sends the monthly price id', async () => {
    const user = userEvent.setup();
    render(<PricingPage />);

    await user.click(screen.getByRole('button', { name: /subscribe now/i }));

    await waitFor(() => {
      expect(mockedCheckout).toHaveBeenCalledWith('price_monthly_test', 'subscription');
    });
    expect(screen.getByText('$4.99')).toBeInTheDocument();
  });

  it('annual toggle switches the displayed price and the checkout price id', async () => {
    const user = userEvent.setup();
    render(<PricingPage />);

    await user.click(screen.getByRole('button', { name: /annual/i }));
    expect(screen.getByText('$49')).toBeInTheDocument();
    expect(screen.getByText('/year')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /subscribe now/i }));

    await waitFor(() => {
      expect(mockedCheckout).toHaveBeenCalledWith('price_annual_test', 'subscription');
    });
  });

  it('sends a signed-out subscriber to the registered /sign-in route', async () => {
    authHolder.user = null;
    const user = userEvent.setup();
    render(<PricingPage />);

    await user.click(screen.getByRole('button', { name: /subscribe now/i }));

    // App.tsx registers "/sign-in" (plus a "/login" alias) — "/signin" 404s.
    expect(mockNavigate).toHaveBeenCalledWith('/sign-in');
    expect(mockedCheckout).not.toHaveBeenCalled();
  });

  it('hides the toggle entirely when no annual price is configured', () => {
    configHolder.annual = undefined;
    render(<PricingPage />);

    expect(screen.queryByRole('button', { name: /annual/i })).not.toBeInTheDocument();
    expect(screen.getByText('$4.99')).toBeInTheDocument();
  });
});

describe('PricingPage entitlement-aware action', () => {
  function activeEntitlement(source: 'paid' | 'founding' | 'complimentary') {
    return {
      tier: 'premium',
      status: 'active',
      source,
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      evaluatedAt: new Date().toISOString(),
      trustedUntil: new Date(Date.now() + 60_000).toISOString(),
      canManageBilling: source === 'paid',
      analyticsTrial: { status: 'unavailable', scoredShowCount: null, showLimit: 3 },
    };
  }

  it('shows current-access action instead of a purchase button for an active paid source', async () => {
    entitlementHolder.effective = activeEntitlement('paid');
    const user = userEvent.setup();
    render(<PricingPage />);

    expect(screen.getByRole('button', { name: /you have premium/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /subscribe now/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /you have premium/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/subscription');
    expect(mockedCheckout).not.toHaveBeenCalled();
  });

  it('shows current-access action for an active founding source', () => {
    entitlementHolder.effective = activeEntitlement('founding');
    render(<PricingPage />);

    expect(
      screen.getByRole('button', { name: /you have founding member premium/i })
    ).toBeInTheDocument();
  });

  it('shows current-access action for an active complimentary source', () => {
    entitlementHolder.effective = activeEntitlement('complimentary');
    render(<PricingPage />);

    expect(
      screen.getByRole('button', { name: /you have complimentary premium/i })
    ).toBeInTheDocument();
  });

  it('keeps the real checkout path for an expired user', async () => {
    entitlementHolder.effective = {
      tier: 'free',
      status: 'expired',
      source: 'none',
      endsAt: new Date(Date.now() - 86_400_000).toISOString(),
      evaluatedAt: new Date().toISOString(),
      trustedUntil: new Date(Date.now() + 60_000).toISOString(),
      canManageBilling: false,
      analyticsTrial: { status: 'unavailable', scoredShowCount: null, showLimit: 3 },
    };
    const user = userEvent.setup();
    render(<PricingPage />);

    await user.click(screen.getByRole('button', { name: /subscribe now/i }));

    await waitFor(() => {
      expect(mockedCheckout).toHaveBeenCalledWith('price_monthly_test', 'subscription');
    });
  });

  it('keeps the real checkout path for a free user', async () => {
    const user = userEvent.setup();
    render(<PricingPage />);

    await user.click(screen.getByRole('button', { name: /subscribe now/i }));

    await waitFor(() => {
      expect(mockedCheckout).toHaveBeenCalledWith('price_monthly_test', 'subscription');
    });
  });
});
