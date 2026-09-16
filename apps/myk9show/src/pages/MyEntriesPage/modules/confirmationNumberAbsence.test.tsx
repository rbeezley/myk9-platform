/**
 * MYK9-563 item 6: never show a confirmation number the exhibitor was not given.
 *
 * `MyEntry.confirmationNumber` comes from the joined `enrollments` row. When
 * that enrichment is missing — a secretary or mail-in entry that has no online
 * registration at all, or an enrichment timeout on the replica path (reachable
 * since MYK9-536) — three surfaces substituted `id.slice(0,8).toUpperCase()`.
 * That string looks exactly like a confirmation number and matches nothing:
 * it is not what the exhibitor was emailed, and quoting it to a secretary
 * finds no order. An absent line is honest; a fabricated one is not.
 *
 * The root is `transformEntry`, which filled the gap before any of the three
 * call sites could see it — fixing only those would have been unreachable code
 * that a passing test certified as a fix.
 *
 * TWO LEVELS, deliberately. The component cases below hand-build a `MyEntry`,
 * so on their own they would stay green if `transformEntry` started
 * substituting again. `useMyEntriesData.confirmationNumber.test.tsx` covers
 * that root by running a real enrollment-less ROW through the page's data
 * hook; restoring the id slice turns it red. Neither level is sufficient
 * alone.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { OrdersReceiptsList } from './OrdersReceiptsList';
import { EntryReceipt } from '@/components/entries/EntryReceipt';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry } from './my-entries-types';

const ID = 'abcdef12-3456-7890-abcd-ef1234567890';
/** What the old fallback would have rendered for `ID`. */
const FABRICATED = 'ABCDEF12';

function order(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: ID,
    registrationId: null,
    showId: 'show-1',
    showName: 'Heartland',
    isShowCancelled: false,
    showDate: new Date('2099-10-10T12:00:00Z'),
    location: { venue: '', city: '', state: '' },
    dogName: 'Scout',
    dogId: 'dog-1',
    classes: [],
    dogs: [],
    totalFee: 30,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    refundAmount: null,
    submittedAt: new Date('2099-09-01T12:00:00Z'),
    lastUpdated: new Date('2099-09-01T12:00:00Z'),
    ...overrides,
  } as MyEntry;
}

describe('OrdersReceiptsList without an enrollment', () => {
  it('omits the confirmation number rather than substituting an id slice', () => {
    render(<OrdersReceiptsList orders={[order()]} mode="receipt" onSelect={vi.fn()} />);

    expect(screen.queryByText(new RegExp(FABRICATED))).not.toBeInTheDocument();
    // The row still identifies itself by date and dog.
    expect(screen.getByRole('button', { name: /Scout/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Receipt for order/ })).toBeInTheDocument();
  });

  it('still shows a real confirmation number when the enrollment is there', () => {
    render(
      <OrdersReceiptsList
        orders={[order({ confirmationNumber: 'MK9-000042' })]}
        mode="receipt"
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText(/MK9-000042/)).toBeInTheDocument();
  });
});

describe('EntryReceipt without a confirmation number', () => {
  const receiptEntry = {
    id: ID,
    showName: 'Heartland',
    showDate: new Date('2099-10-10T12:00:00Z'),
    location: { venue: 'Fairgrounds', city: 'Ames', state: 'IA' },
    dogName: 'Scout',
    classes: [],
    totalFee: 30,
    submittedAt: new Date('2099-09-01T12:00:00Z'),
    paymentStatus: 'Paid',
  };

  it('omits the confirmation block rather than printing an id slice', () => {
    render(<EntryReceipt open onOpenChange={vi.fn()} entry={receiptEntry} />);

    expect(screen.queryByText(FABRICATED)).not.toBeInTheDocument();
    expect(screen.queryByText('Confirmation #')).not.toBeInTheDocument();
    // The receipt is still a receipt: this is the document cash, check and
    // secretary-recorded entries have always printed.
    expect(screen.getByText('Heartland')).toBeInTheDocument();
  });

  it('prints the confirmation block when there is one', () => {
    render(
      <EntryReceipt
        open
        onOpenChange={vi.fn()}
        entry={{ ...receiptEntry, confirmationNumber: 'MK9-000042' }}
      />
    );

    expect(screen.getByText('MK9-000042')).toBeInTheDocument();
  });
});
