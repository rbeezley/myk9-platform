/**
 * MYK9-1275 — My Shows and My Payments must tell one money story.
 *
 * The report: My Shows said "Paid $210.00 ... Receipt sent to your email"
 * while My Payments said "No payments yet", and the fee strip read "$90.00
 * due of $38,360.00 entered". This file pins both pages on ONE account with
 * one settled online order and one open balance, driven through the real
 * hooks each page uses:
 *
 *  - balance due: My Shows' `useMyEntriesData` and My Payments'
 *    `useMyEntryBalanceSummary` both read `getUserEntries` and fold it through
 *    `summarizeEntryBalancesFromSource`, so the two figures must be equal;
 *  - the paid strip quotes the amount and date of the order My Payments lists,
 *    and a paid row no online order covers gets no "Receipt sent" claim.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { render } from '@/test/utils/testUtils';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { formatPaymentCents, formatPaymentDate } from '@/features/payments/moneyPresentation';
import { useMyEntryBalanceSummary } from '@/features/payments/useMyEntryBalanceSummary';
import type { MyPayment } from '@/features/payments/useMyPayments';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useMyEntriesData } from '@/pages/MyEntriesPage/modules/useMyEntriesData';
import { MyShowsList } from '@/pages/MyEntriesPage/modules/MyShowsList';
import { getUserEntries } from '@/services/database/entries';
import ExhibitorPaymentsPage from './ExhibitorPaymentsPage';

const ledger = vi.hoisted(() => ({ current: [] as MyPayment[] }));

vi.mock('@/features/payments/useMyPayments', () => ({
  useMyPayments: () => ({
    data: ledger.current,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useMyPaymentYears: () => ({
    data: undefined,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext');
vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
  AuditAction: { READ: 'READ', UPDATE: 'UPDATE' },
}));
vi.mock('@/services/LoggingService', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() };
  return { logger, LoggingService: { getInstance: () => logger } };
});

const SHOW_ID = 'show-heartland';
const SHOW_NAME = 'Heartland Scent Work Week';

/** Two days ago at local noon: inside the strip's window, clear of any date edge. */
const PAID_AT = (() => {
  const at = new Date();
  at.setDate(at.getDate() - 2);
  at.setHours(12, 0, 0, 0);
  return at.toISOString();
})();

const show = {
  id: SHOW_ID,
  name: SHOW_NAME,
  // Far future, so neither balance is reclassified as a past show.
  start_date: '2099-01-10',
  end_date: '2099-01-11',
  entry_close_date: '2099-01-04',
  venue_name: 'Expo Hall',
  city: 'Tulsa',
  state: 'OK',
};

function row(
  id: string,
  dog: { id: string; name: string },
  registration: { id: string; payment_status: string },
  payment: { status: string; method: string | null; fee: number }
) {
  return {
    id,
    show_id: SHOW_ID,
    registration_id: registration.id,
    dog_id: dog.id,
    class_id: `class-${id}`,
    trial_id: 'trial-1',
    entry_status: 'accepted',
    payment_status: payment.status,
    payment_method: payment.method,
    entry_fee: payment.fee,
    check_in_status: 'no-status',
    is_scored: false,
    submitted_at: PAID_AT,
    created_at: PAID_AT,
    updated_at: PAID_AT,
    dog: { ...dog, call_name: dog.name },
    show,
    trial: { id: 'trial-1', trial_type: 'Scent Work' },
    class: { id: `class-${id}`, name: `Class ${id}`, class_number: '1' },
    registration: { ...registration, confirmation_number: `CN-${registration.id}` },
  };
}

const willow = { id: 'dog-willow', name: 'Willow' };
const scout = { id: 'dog-scout', name: 'Scout' };
const juni = { id: 'dog-juni', name: 'Juni' };

/** Paid online through checkout: the webhook stamps `payment_method: 'online'`. */
const paidOnlineRow = () =>
  row(
    'entry-willow',
    willow,
    { id: 'reg-paid', payment_status: 'paid' },
    { status: 'paid', method: 'online', fee: 30 }
  );
/** Still owed, payable online. */
const openRow = () =>
  row(
    'entry-scout',
    scout,
    { id: 'reg-open', payment_status: 'pending' },
    { status: 'pending', method: 'online', fee: 90 }
  );
/** A mail-in check the secretary marked paid: generic 'paid', no method, no order. */
const secretaryMarkedPaidRow = () =>
  row(
    'entry-juni',
    juni,
    { id: 'reg-check', payment_status: 'paid' },
    { status: 'paid', method: null, fee: 30 }
  );

/** The one `stripe_orders` row My Payments lists. Gross includes the service fee. */
const onlineOrder: MyPayment = {
  id: 'order-1',
  date: PAID_AT,
  showId: SHOW_ID,
  showName: SHOW_NAME,
  amountCents: 3150,
  netPaidCents: 3150,
  currency: 'usd',
  status: 'succeeded',
  reference: 'pi_1275',
  refundedAt: null,
  entryIds: ['entry-willow'],
  refundedCents: 0,
  makeWholeRefundedCents: 0,
  refunds: [],
};

function setRows(rows: ReturnType<typeof row>[]) {
  (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
    source: 'confirmed',
    data: rows,
    error: null,
  });
}

async function loadMyShows() {
  const { result } = renderHook(() =>
    useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) })
  );
  await waitFor(() => expect(result.current.entries.length).toBeGreaterThan(0));
  return result.current;
}

async function loadMyPaymentsBalance() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMyEntryBalanceSummary(), { wrapper });
  await waitFor(() => expect(result.current.data).toBeDefined());
  return result.current.data!;
}

function renderMyShowsList(entries: Awaited<ReturnType<typeof loadMyShows>>['entries']) {
  return render(
    <MyShowsList
      filteredEntries={entries}
      source="confirmed"
      seenResultReleaseKeys={new Set<string>()}
      onCheckInDay={vi.fn()}
      onOpenCheckIn={vi.fn()}
      onOpenEdit={vi.fn()}
      onOpenReceipts={vi.fn()}
      onLeaveClass={vi.fn()}
    />
  );
}

describe('My Shows and My Payments agree (MYK9-1275)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-exhibitor', email: 'exhibitor@myk9t.com' },
      personId: 'person-exhibitor',
      personIdentityState: 'resolved',
      isAuthenticated: true,
    });
    ledger.current = [onlineOrder];
    setRows([paidOnlineRow(), openRow()]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('states the same balance due on both pages, from the same read', async () => {
    const myShows = await loadMyShows();
    const myPayments = await loadMyPaymentsBalance();

    expect(myShows.balanceSummary.kind).toBe('known');
    expect(myShows.balanceSummary.amountDueCents).toBe(9000);
    expect(myPayments.amountDueCents).toBe(myShows.balanceSummary.amountDueCents);

    // Both rendered figures, side by side.
    const { unmount } = render(
      <CompactStatsRow
        amountDue={myShows.balanceSummary.amountDueCents / 100}
        onNavigate={vi.fn()}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent('You owe$90.00');
    expect(screen.queryByText(/due of/)).not.toBeInTheDocument();
    unmount();

    render(<ExhibitorPaymentsPage />);
    const amountDue = await screen.findByRole('heading', { name: 'Amount due' });
    expect(amountDue.parentElement).toHaveTextContent('$90.00');
  });

  it('names on the paid strip the amount and date My Payments lists for that order', async () => {
    const myShows = await loadMyShows();

    const { unmount } = render(<ExhibitorPaymentsPage />);
    const history = screen.getByRole('table');
    expect(within(history).getByText(formatPaymentCents(3150, 'usd'))).toBeInTheDocument();
    expect(within(history).getByText(formatPaymentDate(PAID_AT))).toBeInTheDocument();
    unmount();

    renderMyShowsList(myShows.entries);
    const strip = screen.getByText(/^Paid \$/);
    expect(strip).toHaveTextContent(
      `Paid ${formatPaymentCents(3150, 'usd')} for Willow's 1 class on ${formatPaymentDate(PAID_AT)}.`
    );
    expect(screen.getByText(/Receipt sent to your email\./)).toBeInTheDocument();
  });

  it('claims no payment and no receipt for a secretary-marked paid entry My Payments does not list', async () => {
    ledger.current = [];
    setRows([secretaryMarkedPaidRow(), openRow()]);
    const myShows = await loadMyShows();

    renderMyShowsList(myShows.entries);

    expect(screen.queryByText(/^Paid \$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Receipt sent to your email/)).not.toBeInTheDocument();
    // The balance is still stated, and still agrees with My Payments.
    const myPayments = await loadMyPaymentsBalance();
    expect(myPayments.amountDueCents).toBe(myShows.balanceSummary.amountDueCents);
  });
});
