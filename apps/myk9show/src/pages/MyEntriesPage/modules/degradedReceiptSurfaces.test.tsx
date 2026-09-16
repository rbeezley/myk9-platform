/**
 * MYK9-563 review P2: the receipt surfaces that still render amounts while the
 * account read is degraded must say so.
 *
 * The card's "Receipt" affordance is withheld outright while degraded
 * (`myEntryCardState.test.ts`), but that is not the only door. The show
 * header's orders list and a `?orderId=` deep link both reach these dialogs
 * directly, and what they print — "Paid", a total, a per-order amount — is a
 * financial claim built from rows the authoritative view never confirmed.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { OrdersPickerDialog } from './OrdersReceiptsList';
import { CardDerivedReceipt } from './CardDerivedReceipt';
import { UNCONFIRMED_RECEIPT_NOTICE } from '@/features/payments/unconfirmedBalanceCopy';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry } from './my-entries-types';

function order(id: string): MyEntry {
  return {
    id,
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
  } as MyEntry;
}

describe('OrdersPickerDialog while the account read is degraded', () => {
  it('says the amounts could not be confirmed', () => {
    render(
      <OrdersPickerDialog
        open
        mode="receipt"
        orders={[order('order-1'), order('order-2')]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        notice={UNCONFIRMED_RECEIPT_NOTICE}
      />
    );

    expect(screen.getByText(UNCONFIRMED_RECEIPT_NOTICE)).toBeInTheDocument();
  });

  it('says nothing when the read was confirmed', () => {
    render(
      <OrdersPickerDialog
        open
        mode="receipt"
        orders={[order('order-1'), order('order-2')]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText(/couldn't reach the server to confirm these amounts/i)).toBeNull();
  });
});

describe('CardDerivedReceipt while the account read is degraded', () => {
  it('prints the unconfirmed-amounts notice on the receipt itself', () => {
    render(
      <CardDerivedReceipt
        dialog={{ open: true, entry: order('order-1') }}
        entry={order('order-1')}
        user={{ email: 'exhibitor@test.com' }}
        onClose={vi.fn()}
        notice={UNCONFIRMED_RECEIPT_NOTICE}
      />
    );

    expect(screen.getByText(UNCONFIRMED_RECEIPT_NOTICE)).toBeInTheDocument();
  });
});
