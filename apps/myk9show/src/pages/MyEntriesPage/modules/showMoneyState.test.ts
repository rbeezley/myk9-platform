import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import { deriveShowMoneyState, refundNotesByDog } from './showMoneyState';
import type { EntryClass, MyEntry } from './my-entries-types';

const NOW = new Date('2026-10-01T12:00:00Z');
const SHOW_DATE = new Date('2026-10-24T00:00:00');
const PAST_SHOW_DATE = new Date('2026-09-05T00:00:00');

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'c1',
    entryStatus: EntryStatus.ACCEPTED,
    classId: 'class-1',
    name: 'Container Search',
    number: '101',
    fee: 45,
    status: 'entered',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    ...overrides,
  };
}

function makeRow(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Heartland Classic',
    showDate: SHOW_DATE,
    showEndDate: SHOW_DATE,
    location: { venue: 'Expo Hall', city: 'Portland', state: 'OR' },
    dogName: 'Rex',
    dogId: 'd1',
    classes: [makeClass()],
    dogs: [],
    totalFee: 45,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-09-01'),
    lastUpdated: new Date('2026-09-02'),
    ...overrides,
  };
}

/** A paid order for one dog. */
function paidOrder(id: string, dogId: string, dogName: string): MyEntry {
  return makeRow({
    id,
    registrationId: `reg-${id}`,
    dogId,
    dogName,
    classes: [makeClass({ id: `cls-${id}` })],
  });
}

/** An unpaid online order for one dog. */
function unpaidOrder(id: string, dogId: string, dogName: string, fee = 45): MyEntry {
  return makeRow({
    id,
    registrationId: `reg-${id}`,
    dogId,
    dogName,
    totalFee: fee,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: 'online',
    classes: [
      makeClass({
        id: `cls-${id}`,
        fee,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: null,
      }),
    ],
  });
}

function orders(rows: MyEntry[], now = NOW) {
  return groupEntriesByOrder(rows, now);
}

describe('deriveShowMoneyState', () => {
  it('reports balance-due with the cart amount and href for the one unpaid order', () => {
    const state = deriveShowMoneyState(
      orders([
        paidOrder('e1', 'd1', 'Rex'),
        paidOrder('e2', 'd2', 'Juno'),
        unpaidOrder('e3', 'd3', 'Scout'),
      ]),
      NOW
    );

    expect(state.kind).toBe('balance-due');
    expect(state.amountCents).toBe(4500);
    expect(state.dueDogNames).toEqual(['Scout']);
    expect(state.paymentHref).toBe('/cart?showId=s1&entryIds=cls-e3');
    expect(state.dueOrderIds).toEqual(['e3']);
  });

  it('sums only the owing orders when two are unpaid', () => {
    const state = deriveShowMoneyState(
      orders([unpaidOrder('e1', 'd1', 'Rex', 45), unpaidOrder('e2', 'd2', 'Scout', 30)]),
      NOW
    );

    expect(state.amountCents).toBe(7500);
    expect(state.dueDogNames).toEqual(['Rex', 'Scout']);
    expect(state.paymentHref).toBe('/cart?showId=s1&entryIds=cls-e1%2Ccls-e2');
  });

  it('reports pay-at-show for a check order with no online balance', () => {
    const state = deriveShowMoneyState(
      orders([
        makeRow({
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: 'check',
          classes: [makeClass({ paymentStatus: PaymentStatus.PENDING, paymentMethod: 'check' })],
        }),
      ]),
      NOW
    );

    expect(state.kind).toBe('pay-at-show');
    expect(state.amountCents).toBe(0);
    expect(state.paymentHref).toBeNull();
  });

  it('reports settled for a waived order', () => {
    const state = deriveShowMoneyState(
      orders([
        makeRow({
          paymentStatus: PaymentStatus.WAIVED,
          paymentMethod: 'waived',
          classes: [makeClass({ paymentStatus: PaymentStatus.WAIVED, paymentMethod: 'waived' })],
        }),
      ]),
      NOW
    );

    expect(state.kind).toBe('settled');
    expect(state.amountCents).toBe(0);
  });

  it('reports settled for a fully paid show', () => {
    expect(deriveShowMoneyState(orders([paidOrder('e1', 'd1', 'Rex')]), NOW).kind).toBe('settled');
  });

  it('reports unresolved with no payment link once the show is past', () => {
    const past = unpaidOrder('e1', 'd1', 'Rex');
    past.showDate = PAST_SHOW_DATE;
    past.showEndDate = PAST_SHOW_DATE;

    const state = deriveShowMoneyState(orders([past]), NOW);

    expect(state.kind).toBe('unresolved');
    expect(state.amountCents).toBe(4500);
    expect(state.paymentHref).toBeNull();
  });

  it('names every dog on a multi-dog unpaid order', () => {
    const multiDog = [
      unpaidOrder('e1', 'd1', 'Rex'),
      { ...unpaidOrder('e2', 'd2', 'Scout'), registrationId: 'reg-e1' },
    ];

    const state = deriveShowMoneyState(orders(multiDog), NOW);

    expect(state.dueDogNames).toEqual(['Rex', 'Scout']);
    expect(state.dueOrderIds).toEqual(['e1']);
  });
});

describe('refundNotesByDog', () => {
  /** Set the refund on an already-grouped order (isolates the derivation). */

  // End-to-end through the real grouping: the raw rows carry the refund, so
  // this fails if `groupEntriesByOrder` ever stops threading it onto the order.
  it('attaches a partial refund to that order\u2019s dogs only, from raw rows', () => {
    const refundedRow: MyEntry = {
      ...paidOrder('e1', 'd1', 'Rex'),
      refundAmount: 15,
      refundedAt: new Date('2026-10-08T00:00:00'),
      paymentStatus: PaymentStatus.PARTIAL_REFUND,
      classes: [makeClass({ id: 'cls-e1', paymentStatus: PaymentStatus.PARTIAL_REFUND })],
    };

    const notes = refundNotesByDog(orders([refundedRow, paidOrder('e2', 'd2', 'Scout')]));

    expect(Object.keys(notes)).toEqual(['d1']);
    expect(notes['d1']).toEqual({
      amountCents: 1500,
      date: new Date('2026-10-08T00:00:00'),
      kind: 'partial',
    });
  });

  it('marks a full refund, read against the dog\u2019s own fees', () => {
    // Through the real grouping: the refund rides on the dog's row, and a
    // refund equal to the dog's class fees is a full one.
    const refundedRow: MyEntry = {
      ...paidOrder('e1', 'd1', 'Rex'),
      refundAmount: 45,
      refundedAt: new Date('2026-10-08T00:00:00'),
      paymentStatus: PaymentStatus.REFUNDED,
      classes: [makeClass({ id: 'cls-e1', fee: 45, paymentStatus: PaymentStatus.REFUNDED })],
    };
    const notes = refundNotesByDog(orders([refundedRow]));

    expect(notes['d1'].kind).toBe('full');
    expect(notes['d1'].amountCents).toBe(4500);
  });

  it('ignores an order with no refund', () => {
    expect(refundNotesByDog(orders([paidOrder('e1', 'd1', 'Rex')]))).toEqual({});
  });

  it('ignores a refund amount with no date', () => {
    const [order] = orders([paidOrder('e1', 'd1', 'Rex')]);
    expect(refundNotesByDog([{ ...order, refundAmount: 15 }])).toEqual({});
  });
});

describe('refundNotesByDog — one order, two dogs, one refund (Codex, PR #2198)', () => {
  it('notes the refund on the refunded dog only', () => {
    const refundedAt = new Date('2026-10-08T00:00:00');
    const orders = groupEntriesByOrder(
      [
        makeRow({
          id: 'row-a',
          registrationId: 'reg-shared',
          dogId: 'dog-a',
          dogName: 'Ava',
          refundAmount: 15,
          refundedAt,
          classes: [makeClass({ id: 'ca', fee: 45 })],
        }),
        makeRow({
          id: 'row-b',
          registrationId: 'reg-shared',
          dogId: 'dog-b',
          dogName: 'Bo',
          refundAmount: null,
          classes: [makeClass({ id: 'cb', fee: 45 })],
        }),
      ],
      NOW
    );
    expect(orders).toHaveLength(1);

    const notes = refundNotesByDog(orders);

    expect(notes['dog-a']).toEqual({ amountCents: 1500, date: refundedAt, kind: 'partial' });
    expect(notes['dog-b']).toBeUndefined();
  });
});
