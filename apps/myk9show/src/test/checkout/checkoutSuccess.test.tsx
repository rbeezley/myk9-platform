/**
 * Unit tests: confirmation number on CheckoutSuccessPage
 *
 * Covers:
 *   - verifyCheckoutSession returns confirmationNumber when enrollment exists
 *   - verifyCheckoutSession returns success without confirmationNumber when no enrollment yet
 *   - CheckoutSuccessPage renders MK9-XXXXXX when present
 *   - CheckoutSuccessPage renders without confirmation block when absent
 *   - CheckoutSuccessPage shows the already-assigned armband number + accurate copy
 *   - CheckoutSuccessPage falls back to secretary-confirmation copy when armband missing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';

// ---------------------------------------------------------------------------
// Hoisted mock refs (must be hoisted so vi.mock factory can reference them)
// ---------------------------------------------------------------------------

const { mockSingle, mockRpc, mockGetSession, mockEntries } = vi.hoisted(() => ({
  mockSingle: vi.fn(),
  mockRpc: vi.fn(),
  mockGetSession: vi.fn(),
  // Rows returned from the entries fetch (`.select().in('id', ...)`). The
  // armband is read straight off the entry row (denormalized column).
  mockEntries: { rows: [] as unknown[] },
}));

vi.mock('@/lib/supabase', () => {
  // Chainable builder supports the entry-details fetch on the page. Checkout
  // verification itself uses the owner-scoped RPC (MYK9-294).
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => Promise.resolve({ data: mockEntries.rows, error: null })),
    single: mockSingle,
  };
  return {
    supabase: {
      from: vi.fn(() => builder),
      rpc: mockRpc,
      auth: { getSession: mockGetSession },
    },
  };
});

import { type CheckoutVerificationResult, verifyCheckoutSession } from '@/lib/stripe';
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

function mockCheckoutRpcFromSingle() {
  mockRpc.mockImplementation(async () => {
    const result = await mockSingle();
    const data = result.data
      ? [
          {
            ...result.data,
            show_name: result.data.shows?.name ?? null,
            confirmation_number: result.data.enrollment?.confirmation_number ?? null,
          },
        ]
      : result.data;
    return { data, error: result.error };
  });
}

function expectSuccessfulVerification(
  result: CheckoutVerificationResult
): asserts result is Extract<CheckoutVerificationResult, { success: true }> {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(`Expected success, received ${result.verificationStatus}`);
}

function expectUnsuccessfulVerification(
  result: CheckoutVerificationResult
): asserts result is Extract<CheckoutVerificationResult, { success: false }> {
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected an unsuccessful verification result');
}

// ---------------------------------------------------------------------------
// verifyCheckoutSession unit tests
// ---------------------------------------------------------------------------

describe('verifyCheckoutSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntries.rows = [];
    mockAuthSession();
    mockCheckoutRpcFromSingle();
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
        metadata: { cart_id: 'cart-uuid' },
        shows: { name: 'Spring Invitational' },
        enrollment: { confirmation_number: 'MK9-000042' },
      },
      error: null,
    });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expect(mockRpc).toHaveBeenCalledWith('get_my_checkout_order', {
      p_session_id: 'cs_test_abc123',
    });
    expectSuccessfulVerification(result);
    expect(result.confirmationNumber).toBe('MK9-000042');
    expect(result.showName).toBe('Spring Invitational');
    expect(result.cartId).toBe('cart-uuid');
    expect(result.totalAmountCents).toBe(7500);
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

    expectSuccessfulVerification(result);
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

    expectSuccessfulVerification(result);
    expect(result.confirmationNumber).toBeUndefined();
  });

  it('classifies a pending order as still processing', async () => {
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

    expectUnsuccessfulVerification(result);
    expect(result.verificationStatus).toBe('processing');
    expect(result.error).toMatch(/still processing/i);
  });

  it('classifies a failed order as a terminal payment failure', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'failed',
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

    expectUnsuccessfulVerification(result);
    expect(result.verificationStatus).toBe('failed');
    expect(result.error).toMatch(/not completed/i);
  });

  it('classifies a refunded order separately from an unpaid failure', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-refunded',
        status: 'refunded',
        amount_cents: 7500,
        entry_ids: [],
        show_id: 'show-uuid',
        paid_at: '2026-04-13T10:00:00Z',
        refunded_at: '2026-04-13T10:05:00Z',
        metadata: {},
        shows: { name: 'Spring Invitational' },
        enrollment: null,
      },
      error: null,
    });

    const result = await verifyCheckoutSession('cs_refunded');

    expectUnsuccessfulVerification(result);
    expect(result.verificationStatus).toBe('refunded');
    expect(result.error).toMatch(/was refunded/i);
  });

  it('returns a full overflow refund outcome after the order is marked refunded', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'refunded',
        amount_cents: 0,
        entry_ids: [],
        show_id: 'show-uuid',
        paid_at: '2026-04-13T10:00:00Z',
        refunded_at: '2026-04-13T10:01:00Z',
        stripe_payment_intent_id: 'pi_3TgoK2AIej2Q9UtX3HSHZh3M',
        metadata: {
          overflow_refund: {
            action: 'refund',
            reason: 'full_make_whole',
            amount_cents: 7500,
          },
        },
        shows: { name: 'Spring Invitational' },
        enrollment: null,
      },
      error: null,
    });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expectSuccessfulVerification(result);
    expect(result.checkoutOutcome).toBe('full_overflow_refund');
    expect(result.refundAmount).toBe(7500);
    expect(result.refundStatus).toBe('issued');
    expect(result.entryIds).toEqual([]);
  });

  it('returns a processing refund outcome during the full overflow refund race window', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'succeeded',
        amount_cents: 0,
        entry_ids: [],
        show_id: 'show-uuid',
        paid_at: '2026-04-13T10:00:00Z',
        refunded_at: null,
        stripe_payment_intent_id: 'pi_3TgoK2AIej2Q9UtX3HSHZh3M',
        metadata: {
          overflow_refund: {
            action: 'refund',
            reason: 'full_make_whole',
            amount_cents: 7500,
          },
        },
        shows: { name: 'Spring Invitational' },
        enrollment: null,
      },
      error: null,
    });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expectSuccessfulVerification(result);
    expect(result.checkoutOutcome).toBe('full_overflow_refund');
    expect(result.refundStatus).toBe('processing');
  });

  it('classifies a missing order row as not_found, never as processing (MYK9-207)', async () => {
    // No visible row covers three cases — not written yet, hidden by RLS from
    // a different account, or a bogus session id. Two of those are permanent,
    // so calling them "processing" would be untruthful.
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expectUnsuccessfulVerification(result);
    expect(result.verificationStatus).toBe('not_found');
    expect(result.error).toMatch(/can't find this payment on this account/i);
  });

  it('classifies an unexpected order query failure as verification unavailable', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'Database unavailable' },
    });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expectUnsuccessfulVerification(result);
    expect(result.verificationStatus).toBe('unavailable');
    expect(result.error).toMatch(/could not check/i);
  });

  it('classifies a missing auth session as verification unavailable', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const result = await verifyCheckoutSession('cs_test_abc123');

    expectUnsuccessfulVerification(result);
    expect(result.verificationStatus).toBe('unavailable');
  });
});

// ---------------------------------------------------------------------------
// CheckoutSuccessPage rendering tests
// ---------------------------------------------------------------------------

describe('CheckoutSuccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntries.rows = [];
    mockAuthSession();
    mockCheckoutRpcFromSingle();
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
    expect(screen.getByText('Confirmation #')).toBeInTheDocument();
    expect(screen.queryByText('Entry #')).not.toBeInTheDocument();
    expect(screen.queryByText('Registration #')).not.toBeInTheDocument();
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
    expect(screen.getByText('Confirmation #')).toBeInTheDocument();
  });

  it('shows the already-assigned armband number and accurate next-step copy', async () => {
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
    mockEntries.rows = [
      {
        id: 'entry-1',
        armband: '142',
        dogs: { name: 'Scout', call_name: 'Scout' },
        classes: { name: 'Container', level: 'Novice' },
      },
    ];

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByText('Armband #142')).toBeInTheDocument();
    });
    // Copy must NOT claim the number is assigned later; it already exists.
    expect(screen.queryByText(/will be assigned at check-in/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Bring your armband number/i)).toBeInTheDocument();
  });

  it('falls back to secretary-confirmation copy when an armband is missing', async () => {
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
    mockEntries.rows = [
      {
        id: 'entry-1',
        armband: null,
        dogs: { name: 'Scout', call_name: 'Scout' },
        classes: { name: 'Container', level: 'Novice' },
      },
    ];
    // No armband on the entry — claim failed or not yet denormalized.

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByText('Scout')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Armband #/i)).not.toBeInTheDocument();
    expect(screen.getByText(/confirmed by the show secretary/i)).toBeInTheDocument();
  });

  it('does not claim armbands are ready when no entry rows loaded', async () => {
    // Order succeeded but the entry rows did not load (entries.length === 0).
    // The "bring your armband number(s)" copy must NOT show — there is nothing
    // to bring — so we fall back to the secretary-confirmation copy.
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
    mockEntries.rows = [];

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByText('Entry Submitted Successfully!')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Bring your armband number/i)).not.toBeInTheDocument();
    expect(screen.getByText(/confirmed by the show secretary/i)).toBeInTheDocument();
  });

  it('renders full overflow refunds without claiming entries were submitted', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'order-uuid',
        status: 'refunded',
        amount_cents: 0,
        entry_ids: [],
        show_id: 'show-uuid',
        paid_at: '2026-04-13T10:00:00Z',
        refunded_at: '2026-04-13T10:01:00Z',
        stripe_payment_intent_id: 'pi_3TgoK2AIej2Q9UtX3HSHZh3M',
        metadata: {
          overflow_refund: {
            action: 'refund',
            reason: 'full_make_whole',
            amount_cents: 7500,
          },
        },
        shows: { name: 'Spring Invitational' },
        enrollment: null,
      },
      error: null,
    });

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByText('Payment Refunded')).toBeInTheDocument();
    });
    expect(screen.queryByText('Entry Submitted Successfully!')).not.toBeInTheDocument();
    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByText(/No paid entries were created/i)).toBeInTheDocument();
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
    expect(screen.queryByText('Confirmation #')).not.toBeInTheDocument();
  });
});
