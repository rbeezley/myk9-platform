/**
 * Subscription checkout must round-trip to a route that exists.
 *
 * The premium upgrade flow used to send Stripe's success redirect to
 * `/success`, a route that was never registered — every paid subscriber
 * landed on the 404 page (found in the 2026-06-10 sandbox walkthrough).
 * It now lands on /subscription with a confirmation banner.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: mockInvoke },
    auth: { getSession: vi.fn() },
  },
}));

vi.mock('@/components/subscription/SubscriptionManager', () => ({
  SubscriptionManager: () => <div data-testid="subscription-manager" />,
}));

vi.mock('@/hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: () => ({ isEarlyAdopter: false }),
}));

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: null }),
}));

import { createCheckoutSession } from '@/lib/stripe';
import { products } from '@/stripe-config';
import SubscriptionPage from '@/pages/SubscriptionPage';

describe('createCheckoutSession success redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends Stripe back to /subscription?checkout=success (a registered route)', async () => {
    // Empty url makes the helper throw AFTER invoking — avoids jsdom
    // navigation while still letting us assert the request payload.
    mockInvoke.mockResolvedValue({ data: { url: '' }, error: null });

    const priceId = Object.values(products)[0]!.priceId;
    await expect(createCheckoutSession(priceId, 'subscription')).rejects.toThrow();

    expect(mockInvoke).toHaveBeenCalledWith(
      'stripe-checkout',
      expect.objectContaining({
        body: expect.objectContaining({
          success_url: `${window.location.origin}/subscription?checkout=success`,
        }),
      })
    );
  });
});

describe('SubscriptionPage checkout confirmation banner', () => {
  it('shows the payment-received banner when checkout=success is present', () => {
    render(
      <MemoryRouter initialEntries={['/subscription?checkout=success']}>
        <SubscriptionPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/payment received/i)).toBeInTheDocument();
  });

  it('does not show the banner on a normal visit', () => {
    render(
      <MemoryRouter initialEntries={['/subscription']}>
        <SubscriptionPage />
      </MemoryRouter>
    );
    expect(screen.queryByText(/payment received/i)).not.toBeInTheDocument();
  });
});
