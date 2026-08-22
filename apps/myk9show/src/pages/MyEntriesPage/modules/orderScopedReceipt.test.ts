import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryReceiptOrder } from '@/features/payments/entryReceiptOrder';
import type { MyEntry } from './my-entries-types';
import { buildOrderScopedReceipt, orderHasRefund } from './orderScopedReceipt';

const registration: MyEntry = {
  id: 'entry-a',
  registrationId: 'registration-split',
  showId: 'show-1',
  showName: 'Two-Day Trial',
  showDate: new Date('2026-09-01T12:00:00Z'),
  location: { venue: 'Fairgrounds', city: 'Tulsa', state: 'OK' },
  dogName: 'Cooper',
  dogId: 'dog-1',
  classes: [
    { id: 'entry-a', name: 'Novice', number: '101', fee: 60, status: 'entered' },
    { id: 'entry-b', name: 'Advanced', number: '201', fee: 70, status: 'entered' },
  ],
  dogs: [],
  totalFee: 130,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date('2026-08-01T12:00:00Z'),
  lastUpdated: new Date('2026-08-02T12:00:00Z'),
};

function order(overrides: Partial<EntryReceiptOrder> = {}): EntryReceiptOrder {
  return {
    id: 'order-1',
    createdAt: '2026-08-01T12:00:00Z',
    amountCents: 6420,
    currency: 'usd',
    reference: 'pi_order_1',
    status: 'succeeded',
    entryIds: ['entry-a'],
    entrySubtotalCents: 6000,
    platformFeeCents: 420,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
    refundedAt: null,
    ...overrides,
  };
}

describe('buildOrderScopedReceipt', () => {
  it('makes one receipt per order for a registration split across two orders', () => {
    const first = buildOrderScopedReceipt(registration, order());
    const second = buildOrderScopedReceipt(
      registration,
      order({
        id: 'order-2',
        reference: 'pi_order_2',
        entryIds: ['entry-b'],
        entrySubtotalCents: 7000,
        platformFeeCents: 490,
        amountCents: 7490,
      })
    );

    expect(first).toMatchObject({
      orderId: 'order-1',
      paymentReference: 'pi_order_1',
      classes: [{ id: 'entry-a', name: 'Novice' }],
    });
    expect(second).toMatchObject({
      orderId: 'order-2',
      paymentReference: 'pi_order_2',
      classes: [{ id: 'entry-b', name: 'Advanced' }],
    });
    // Neither receipt carries the other order's row or the card-wide $130.
    expect(first?.classes).toHaveLength(1);
    expect(second?.classes).toHaveLength(1);
  });

  it('produces figures that add up — the whole point of a receipt', () => {
    // The defect this replaces: amount_cents is the gross INCLUDING a platform
    // fee billed as its own Stripe line, so printing it against class rows that
    // sum to the subtotal produced a document $4.20 out of balance.
    const receipt = buildOrderScopedReceipt(registration, order());

    expect(receipt?.entrySubtotal).toBe(60);
    expect(receipt?.platformFee).toBeCloseTo(4.2, 2);
    expect(receipt?.amountCharged).toBeCloseTo(64.2, 2);
    expect(receipt!.entrySubtotal + receipt!.platformFee).toBeCloseTo(receipt!.amountCharged, 2);
    // The class rows sum to the entry subtotal, not to the amount charged.
    const rowSum = receipt!.classes.reduce((sum, c) => sum + c.fee, 0);
    expect(rowSum).toBeCloseTo(receipt!.entrySubtotal, 2);
  });

  it('nets the cart-overflow auto-refund out of what the exhibitor paid', () => {
    // A capacity split refunds the overflow immediately, and amount_cents is
    // deliberately NOT netted by it. Ignoring make_whole_refunded_cents
    // overstates the receipt by exactly the money handed straight back — in the
    // very scenario this issue is about.
    const receipt = buildOrderScopedReceipt(
      registration,
      order({
        amountCents: 21400,
        entrySubtotalCents: 20000,
        platformFeeCents: 1400,
        makeWholeRefundedCents: 10000,
      })
    );

    expect(receipt?.amountCharged).toBe(214);
    expect(receipt?.refunded).toBe(100);
    expect(receipt?.netPaid).toBe(114);
  });

  it('nets a post-hoc partial refund', () => {
    const receipt = buildOrderScopedReceipt(registration, order({ refundedCents: 2000 }));

    expect(receipt?.refunded).toBe(20);
    expect(receipt?.netPaid).toBeCloseTo(44.2, 2);
  });

  it('narrows the dogs and the dog name to the order, not the whole card', () => {
    // Without this a two-dog split prints the other dog's name on both receipts.
    const twoDogs: MyEntry = {
      ...registration,
      dogs: [
        { dogId: 'dog-1', dogName: 'Cooper', classes: [registration.classes[0]] },
        { dogId: 'dog-2', dogName: 'Scout', classes: [registration.classes[1]] },
      ] as MyEntry['dogs'],
    };

    expect(buildOrderScopedReceipt(twoDogs, order())).toMatchObject({
      dogName: 'Cooper',
      dogs: [{ dogName: 'Cooper' }],
    });
    expect(buildOrderScopedReceipt(twoDogs, order({ entryIds: ['entry-b'] }))).toMatchObject({
      dogName: 'Scout',
      dogs: [{ dogName: 'Scout' }],
    });
  });

  it('refuses until every order entry id is replicated', () => {
    expect(
      buildOrderScopedReceipt(registration, order({ entryIds: ['entry-a', 'entry-not-replicated'] }))
    ).toBeNull();
  });

  it('refuses a row that is present but still an unresolved placeholder', () => {
    // Such a row replicates with name "Unknown Class" and a real fee — enough
    // to satisfy a bare id check, and useless on a printed receipt.
    const unresolved: MyEntry = {
      ...registration,
      classes: [
        { ...registration.classes[0], name: 'Unknown Class', unresolved: true },
        registration.classes[1],
      ],
    };

    expect(buildOrderScopedReceipt(unresolved, order())).toBeNull();
  });

  it('refuses to print a card-wide receipt when no exact order was resolved', () => {
    expect(buildOrderScopedReceipt(registration, null)).toBeNull();
  });

  it('falls back to summing rows when an order predates the snapshot columns', () => {
    const receipt = buildOrderScopedReceipt(
      registration,
      order({ entrySubtotalCents: null, platformFeeCents: null, amountCents: 6000 })
    );

    expect(receipt?.entrySubtotal).toBe(60);
    expect(receipt?.platformFee).toBe(0);
    expect(receipt?.amountCharged).toBe(60);
  });
});

describe('orderHasRefund', () => {
  it('reads the refund columns, never the status', () => {
    // orderSnapshot.ts: a PARTIALLY refunded order keeps status 'succeeded'.
    expect(orderHasRefund(order({ status: 'succeeded', refundedCents: 500 }))).toBe(true);
    expect(orderHasRefund(order({ status: 'succeeded', makeWholeRefundedCents: 500 }))).toBe(true);
    expect(orderHasRefund(order({ status: 'succeeded' }))).toBe(false);
  });
});
