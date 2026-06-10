import React from 'react';
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
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/components/layout/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/layout/Footer', () => ({ default: () => null }));

const mockedCheckout = vi.mocked(createCheckoutSession);

beforeEach(() => {
  vi.clearAllMocks();
  configHolder.annual = 'price_annual_test';
});

describe('PricingPage billing interval', () => {
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

  it('hides the toggle entirely when no annual price is configured', () => {
    configHolder.annual = undefined;
    render(<PricingPage />);

    expect(screen.queryByRole('button', { name: /annual/i })).not.toBeInTheDocument();
    expect(screen.getByText('$4.99')).toBeInTheDocument();
  });
});
