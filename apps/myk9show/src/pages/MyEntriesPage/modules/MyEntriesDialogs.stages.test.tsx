/**
 * The dialog stages a multi-order show adds (MYK9-482, tasks 3.2, 4.1, 4.2).
 *
 * A show now renders once, so "Orders & receipts" and "Edit entry" can each be
 * asked about several orders at a time. Both answer with the SAME list stage,
 * and both still open directly when there is only one order to open — the two
 * branches are what these tests pin, along with the deep link that must keep
 * bypassing the list entirely.
 *
 * Lives beside `MyEntriesDialogs.test.tsx` rather than inside it because the
 * edit stage needs `EntryEditDialog` mocked, and a file-scoped `vi.mock` there
 * would reach the receipt tests too.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { formatShortCalendarDate } from '@/lib/format/dates';
import { heartlandRows, toOrders } from '@/test/fixtures/myShowsFixtures';

const { useEntryReceiptOrdersMock, refetch } = vi.hoisted(() => ({
  useEntryReceiptOrdersMock: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/features/payments/entryReceiptOrder', () => ({
  useEntryReceiptOrders: useEntryReceiptOrdersMock,
}));

vi.mock('@/components/entries/EntryEditDialog', () => ({
  EntryEditDialog: ({ entry }: { entry: { id: string; dogName: string } }) => (
    <div data-testid="entry-edit-dialog">Editing {entry.id}</div>
  ),
}));

vi.mock('@/features/show-presence/ShowPresenceProvider', () => ({
  ShowPresenceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { CheckInDialog, EditEntryDialog, ReceiptEntryDialog } from './MyEntriesDialogs';
import { groupEntriesByShow } from './groupEntriesByShow';
import { useMyEntriesDialogs } from './useMyEntriesDialogs';
import { renderHook, act } from '@testing-library/react';

/** Heartland's three order cards: Juni+Willow, Scout, Ranger (partial refund). */
const orders = toOrders(heartlandRows());
const scoutOrder = orders.find(order => order.id === 'e-scout')!;

const IDLE_QUERY = {
  data: undefined,
  isPending: true,
  fetchStatus: 'idle',
  isError: false,
  refetch,
};

function noStripeOrders() {
  return { data: [], isPending: false, fetchStatus: 'idle', isError: false, refetch };
}

beforeEach(() => {
  vi.clearAllMocks();
  useEntryReceiptOrdersMock.mockReturnValue(IDLE_QUERY);
});

describe('ReceiptEntryDialog — the orders list stage (task 4.1)', () => {
  it('opens the receipt directly when the show has one order', () => {
    useEntryReceiptOrdersMock.mockReturnValue(noStripeOrders());

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: null, orders: [scoutOrder] }}
        user={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Entry Receipt')).toBeInTheDocument();
    expect(screen.queryByText('Orders and receipts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to orders' })).not.toBeInTheDocument();
  });

  it('lists every order, with its date, confirmation, dogs, amount and refund', () => {
    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: null, orders }}
        user={null}
        onClose={vi.fn()}
      />
    );

    // The list stage renders without a payment query: nothing here needs Stripe.
    expect(screen.getByText('Orders and receipts')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // The row's own text: submitted date, confirmation number, dogs.
    // `submittedAt` is an INSTANT, so its calendar day depends on the runner's
    // zone (CI runs in UTC; this Mac in Chicago). Expect what the row's own
    // formatter renders, not a hard-coded day.
    const submitted = formatShortCalendarDate(orders[0].submittedAt);
    expect(rows[0]).toHaveTextContent(`${submitted} · HSC-1001 · Juni, Willow`);
    expect(rows[1]).toHaveTextContent(`${submitted} · HSC-1002 · Scout`);
    // Money in words, no chip: exhibitor-money-on-exception.
    expect(within(rows[1]).getByText('$50.00')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Paid')).toBeInTheDocument();
    // Ranger's order carries a partial refund, noted beneath its own row.
    expect(
      within(rows[2]).getByText('Partial refund of $15.00 on Oct 8, 2026')
    ).toBeInTheDocument();
    expect(screen.queryByText('Entry Receipt')).not.toBeInTheDocument();
  });

  it('opens the picked order’s receipt and offers a way back to the list', async () => {
    const user = userEvent.setup();
    useEntryReceiptOrdersMock.mockReturnValue(noStripeOrders());

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: null, orders }}
        user={null}
        onClose={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /Receipt for order HSC-1002/ }));

    expect(screen.getByText('Entry Receipt')).toBeInTheDocument();
    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
    expect(screen.queryByText('Exterior Excellent')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to orders' }));
    expect(screen.getByText('Orders and receipts')).toBeInTheDocument();
  });

  it('still opens the order the ?orderId= deep link names, skipping the list', () => {
    // My Payments' Receipt link lands here with the order in the URL. It must
    // resolve straight to the card that paid for it, however many were passed.
    useEntryReceiptOrdersMock.mockReturnValue({
      data: [
        {
          id: 'order-scout',
          createdAt: '2026-09-02T12:00:00Z',
          paidOn: '2026-09-02T12:00:00Z',
          amountCents: 5500,
          currency: 'usd',
          reference: 'pi_scout',
          status: 'succeeded',
          entryIds: ['c-scout-1', 'c-scout-2'],
          entrySubtotalCents: 5000,
          platformFeeCents: 500,
          refundedCents: 0,
          makeWholeRefundedCents: 0,
          refundedAt: null,
          entryRefundedCents: 0,
        },
      ],
      isPending: false,
      fetchStatus: 'idle',
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: null, orders }}
        user={null}
        onClose={vi.fn()}
      />,
      { initialRoute: '/exhibitor/entries?orderId=order-scout' }
    );

    expect(screen.queryByText('Orders and receipts')).not.toBeInTheDocument();
    expect(screen.getByText('Entry Receipt')).toBeInTheDocument();
    expect(screen.getByText('order-scout')).toBeInTheDocument();
    expect(screen.getByText('$55.00')).toBeInTheDocument();
  });
});

describe('EditEntryDialog — one editable order opens directly (task 4.2)', () => {
  it('skips the picker for a single editable order', () => {
    render(
      <EditEntryDialog
        dialog={{ open: true, entry: null, orders: [scoutOrder] }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByTestId('entry-edit-dialog')).toHaveTextContent('Editing e-scout');
    expect(screen.queryByText('Choose an entry to edit')).not.toBeInTheDocument();
  });

  it('picks between several editable orders first, stating no money', async () => {
    const user = userEvent.setup();

    render(
      <EditEntryDialog
        dialog={{ open: true, entry: null, orders }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByText('Choose an entry to edit')).toBeInTheDocument();
    // Editing is not a money act, so the edit picker states no amount at all.
    expect(screen.queryByText('$50.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/Partial refund/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('entry-edit-dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Edit order HSC-1003/ }));

    expect(screen.getByTestId('entry-edit-dialog')).toHaveTextContent('Editing e-ranger');
  });
});

describe('useMyEntriesDialogs — a list of one is just that one', () => {
  it('unwraps a one-order array for both order-scoped dialogs', () => {
    const { result } = renderHook(() =>
      useMyEntriesDialogs({
        updateEntryCheckIn: vi.fn(() => Promise.resolve()),
        refreshEntries: vi.fn(() => Promise.resolve()),
      })
    );

    act(() => result.current.openReceipt([scoutOrder]));
    expect(result.current.receiptDialog).toEqual({ open: true, entry: scoutOrder });

    act(() => result.current.openEdit([scoutOrder]));
    expect(result.current.editDialog).toEqual({ open: true, entry: scoutOrder });

    act(() => result.current.openReceipt(orders));
    expect(result.current.receiptDialog).toEqual({ open: true, entry: null, orders });

    act(() => result.current.openEdit(orders));
    expect(result.current.editDialog).toEqual({ open: true, entry: null, orders });
  });

  it('opens nothing when there is no order to open', () => {
    const { result } = renderHook(() =>
      useMyEntriesDialogs({
        updateEntryCheckIn: vi.fn(() => Promise.resolve()),
        refreshEntries: vi.fn(() => Promise.resolve()),
      })
    );

    act(() => result.current.openReceipt([]));
    expect(result.current.receiptDialog.open).toBe(false);
  });
});

describe('CheckInDialog — "change" preselects the status the class already has', () => {
  it('opens on the current status rather than defaulting to no-status', () => {
    // The dog card's "change" link calls `openCheckIn(order, cls)`; this is the
    // state that produces, rendered. Willow's Interior Advanced is at the gate,
    // so the dialog must open showing "At Gate" — a dialog that defaulted to
    // no-status would silently offer to undo the check-in.
    const group = groupEntriesByShow(orders)[0];
    const willow = group.dogs.find(dog => dog.dogName === 'Willow')!;
    const atGate = willow.classes.find(cls => cls.id === 'c-willow-1')!;
    const order = orders.find(entry => entry.id === atGate.orderId)!;

    const { result } = renderHook(() =>
      useMyEntriesDialogs({
        updateEntryCheckIn: vi.fn(() => Promise.resolve()),
        refreshEntries: vi.fn(() => Promise.resolve()),
      })
    );
    act(() => result.current.openCheckIn(order, atGate));

    render(
      <CheckInDialog
        dialog={result.current.checkInDialog}
        user={{ email: 'handler@example.com' }}
        onClose={vi.fn()}
        onUpdateStatus={vi.fn(() => Promise.resolve())}
      />
    );

    // Exactly one option is selected, and it is the one the class already
    // carries. Asserted through `aria-checked` rather than a name match: two of
    // the exhibitor labels contain the words "checked in".
    const selected = screen
      .getAllByRole('radio')
      .filter(radio => radio.getAttribute('aria-checked') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAttribute('aria-labelledby', 'at-gate-label');
    // And the header states it too, so the preselection is not the only tell.
    expect(screen.getByText('Current Status').parentElement).toHaveTextContent(/at gate/i);
  });
});
