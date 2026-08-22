import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry } from './my-entries-types';
import { buildOrderScopedReceipt } from './orderScopedReceipt';

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

describe('buildOrderScopedReceipt', () => {
  it('makes one accurate receipt per order for one registration split across two orders', () => {
    const first = buildOrderScopedReceipt(registration, {
      id: 'order-1',
      amountCents: 6500,
      currency: 'usd',
      reference: 'pi_order_1',
      status: 'succeeded',
      entryIds: ['entry-a'],
    });
    const second = buildOrderScopedReceipt(registration, {
      id: 'order-2',
      amountCents: 7500,
      currency: 'usd',
      reference: 'pi_order_2',
      status: 'succeeded',
      entryIds: ['entry-b'],
    });

    expect(first).toMatchObject({
      id: 'entry-a',
      orderId: 'order-1',
      totalFee: 65,
      currency: 'usd',
      paymentReference: 'pi_order_1',
      classes: [{ id: 'entry-a', name: 'Novice' }],
    });
    expect(second).toMatchObject({
      id: 'entry-a',
      orderId: 'order-2',
      totalFee: 75,
      currency: 'usd',
      paymentReference: 'pi_order_2',
      classes: [{ id: 'entry-b', name: 'Advanced' }],
    });
  });

  it('refuses the full order amount until every order entry id is replicated', () => {
    expect(
      buildOrderScopedReceipt(registration, {
        id: 'order-partial',
        amountCents: 14000,
        currency: 'usd',
        reference: 'pi_partial',
        status: 'succeeded',
        entryIds: ['entry-a', 'entry-not-replicated'],
      })
    ).toBeNull();
  });

  it('refuses to print a card-wide receipt when no exact order was resolved', () => {
    expect(buildOrderScopedReceipt(registration, null)).toBeNull();
  });
});
