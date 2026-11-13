/**
 * MYK9-1896: paying by card does not accept an entry. The standing "paid stays
 * pending" decision keeps a paid entry awaiting the secretary's review until she
 * presses Accept, so the success page says the payment is recorded and the
 * entries are submitted for review. It says "confirmed" only when every entry it
 * reports is in fact accepted, the same test the wizard's receipt step uses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';

const { mockRpc, mockGetSession, mockEntries } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockGetSession: vi.fn(),
  mockEntries: { rows: [] as unknown[] },
}));

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => Promise.resolve({ data: mockEntries.rows, error: null })),
  };
  return {
    supabase: {
      from: vi.fn(() => builder),
      rpc: mockRpc,
      auth: {
        getSession: mockGetSession,
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
    },
  };
});

vi.mock('@/hooks/pruneWizardDraftsForFiledEntries', () => ({
  pruneWizardDraftsForFiledEntries: vi.fn(),
}));

import CheckoutSuccessPage from '@/pages/CheckoutSuccessPage';

const REVIEW_COPY = 'Your payment has been recorded. The show secretary will review your entries.';
const CONFIRMED_COPY = 'Your payment has been recorded and your entries are confirmed.';

function mockPaidOrder() {
  mockRpc.mockResolvedValue({
    data: [
      {
        id: 'order-1',
        status: 'succeeded',
        amount_cents: 3000,
        entry_ids: ['entry-1'],
        show_id: 'show-1',
        paid_at: '2026-11-13T10:00:00Z',
        refunded_at: null,
        stripe_payment_intent_id: 'pi_1',
        metadata: {},
        show_name: 'Fall Trial',
        confirmation_number: 'MK9-000042',
      },
    ],
    error: null,
  });
}

function entryRow(entryStatus: string) {
  return {
    id: 'entry-1',
    armband: '142',
    entry_status: entryStatus,
    dogs: { name: 'Scout', call_name: 'Scout' },
    classes: { name: 'Container', level: 'Novice' },
  };
}

function renderPage() {
  render(<CheckoutSuccessPage />, { initialRoute: '/checkout/success?session_id=cs_1' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
  mockPaidOrder();
});

describe('checkout success copy follows the entry, not the payment', () => {
  it('a paid entry still awaiting review reads as submitted for review', async () => {
    mockEntries.rows = [entryRow('paid')];
    renderPage();

    await waitFor(() => expect(screen.getByText('Armband #142')).toBeInTheDocument());
    expect(screen.getByText(REVIEW_COPY)).toBeInTheDocument();
    expect(screen.queryByText(/confirmed\./i)).not.toBeInTheDocument();
  });

  it('says "confirmed" only once every reported entry is accepted', async () => {
    mockEntries.rows = [entryRow('accepted')];
    renderPage();

    await waitFor(() => expect(screen.getByText(CONFIRMED_COPY)).toBeInTheDocument());
    expect(screen.queryByText(REVIEW_COPY)).not.toBeInTheDocument();
  });
});
