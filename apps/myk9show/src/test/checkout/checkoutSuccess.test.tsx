/**
 * Unit tests: confirmation number on CheckoutSuccessPage
 *
 * Covers:
 *   - verifyCheckoutSession returns confirmationNumber when enrollment exists
 *   - verifyCheckoutSession returns success without confirmationNumber when no enrollment yet
 *   - CheckoutSuccessPage renders MK9-XXXXXX when present
 *   - CheckoutSuccessPage renders without confirmation block when absent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';

// ---------------------------------------------------------------------------
// Hoisted mock refs (must be hoisted so vi.mock factory can reference them)
// ---------------------------------------------------------------------------

const { mockSingle, mockGetSession } = vi.hoisted(() => ({
  mockSingle: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return {
    supabase: {
      from: mockFrom,
      auth: { getSession: mockGetSession },
    },
  };
});

import { verifyCheckoutSession } from '@/lib/stripe';
import CheckoutSuccessPage from '@/pages/CheckoutSuccessPage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSuccessPage(sessionId = 'cs_test_abc123') {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[`/checkout/success?session_id=${sessionId}`]}>
        <CheckoutSuccessPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockAuthSession() {
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'token_xyz' } },
  });
}

// ---------------------------------------------------------------------------
// verifyCheckoutSession unit tests
// ---------------------------------------------------------------------------

describe('verifyCheckoutSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthSession();
  });

  it('returns confirmationNumber when enrollment row exists on the order', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'succeeded',
        amount_cents: 7500,
        entry_ids: ['entry-1'],
        show_id: 'show-uuid',
        paid_at: '2026-04-13T10:00:00Z',
        shows: { name: 'Spring Invitational' },
        enrollment: { confirmation_number: 'MK9-000042' },
      },
      error: null,
    });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expect(result.success).toBe(true);
    expect(result.confirmationNumber).toBe('MK9-000042');
    expect(result.showName).toBe('Spring Invitational');
    expect(result.totalAmount).toBe(7500);
  });

  it('falls back to the payment intent id when no enrollment is linked (online cart path)', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'succeeded',
        amount_cents: 7500,
        entry_ids: ['entry-1'],
        show_id: 'show-uuid',
        paid_at: '2026-04-13T10:00:00Z',
        stripe_payment_intent_id: 'pi_3TgoK2AIej2Q9UtX3HSHZh3M',
        shows: { name: 'Spring Invitational' },
        enrollment: null,
      },
      error: null,
    });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expect(result.success).toBe(true);
    expect(result.confirmationNumber).toBe('pi_3TgoK2AIej2Q9UtX3HSHZh3M');
  });

  it('returns success without confirmationNumber when neither source exists', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'succeeded',
        amount_cents: 7500,
        entry_ids: ['entry-1'],
        show_id: 'show-uuid',
        paid_at: '2026-04-13T10:00:00Z',
        stripe_payment_intent_id: null,
        shows: { name: 'Spring Invitational' },
        enrollment: null,
      },
      error: null,
    });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expect(result.success).toBe(true);
    expect(result.confirmationNumber).toBeUndefined();
  });

  it('returns failure when order status is not succeeded', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'pending',
        amount_cents: 7500,
        entry_ids: [],
        show_id: 'show-uuid',
        paid_at: null,
        shows: { name: 'Spring Invitational' },
        enrollment: null,
      },
      error: null,
    });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/pending/i);
  });

  it('returns failure when order is not found', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CheckoutSuccessPage rendering tests
// ---------------------------------------------------------------------------

describe('CheckoutSuccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthSession();
  });

  it('displays MK9-XXXXXX confirmation number when enrollment is linked', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'succeeded',
        amount_cents: 7500,
        entry_ids: [],
        show_id: 'show-uuid',
        paid_at: '2026-04-13T10:00:00Z',
        shows: { name: 'Spring Invitational' },
        enrollment: { confirmation_number: 'MK9-000042' },
      },
      error: null,
    });

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByText('MK9-000042')).toBeInTheDocument();
    });
    expect(screen.getByText('Confirmation Number')).toBeInTheDocument();
  });

  it('displays the payment intent id as confirmation when no enrollment is linked', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'succeeded',
        amount_cents: 7500,
        entry_ids: [],
        show_id: 'show-uuid',
        paid_at: '2026-04-13T10:00:00Z',
        stripe_payment_intent_id: 'pi_3TgoK2AIej2Q9UtX3HSHZh3M',
        shows: { name: 'Spring Invitational' },
        enrollment: null,
      },
      error: null,
    });

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByText('pi_3TgoK2AIej2Q9UtX3HSHZh3M')).toBeInTheDocument();
    });
    expect(screen.getByText('Confirmation Number')).toBeInTheDocument();
  });

  it('does not render the confirmation block when neither source exists', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'succeeded',
        amount_cents: 7500,
        entry_ids: [],
        show_id: 'show-uuid',
        paid_at: '2026-04-13T10:00:00Z',
        stripe_payment_intent_id: null,
        shows: { name: 'Spring Invitational' },
        enrollment: null,
      },
      error: null,
    });

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByText('Entry Submitted Successfully!')).toBeInTheDocument();
    });
    expect(screen.queryByText('Confirmation Number')).not.toBeInTheDocument();
  });
});
