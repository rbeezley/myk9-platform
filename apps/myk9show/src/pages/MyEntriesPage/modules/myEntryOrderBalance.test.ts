import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  buildOrderBalance,
  buildOrderPaymentHref,
  reconcileOrderPaymentStatus,
} from './myEntryOrderBalance';
import type { EntryBalanceSource } from '@/features/payments/entryBalanceSummary';
import type { EntryClass, MyEntry, MyEntryBalance } from './my-entries-types';
import type { OrderBalanceContext } from './myEntryOrderBalance';

const NOW = new Date('2026-09-01T12:00:00Z');

function makeCtx(overrides: Partial<OrderBalanceContext> = {}): OrderBalanceContext {
  return {
    showId: 's1',
    showName: 'Test Show',
    showDate: new Date('2026-09-15'),
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: null,
    ...overrides,
  };
}

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'c1',
    name: 'Container Search',
    number: '101',
    fee: 25,
    status: 'entered',
    entryStatus: EntryStatus.ACCEPTED,
    ...overrides,
  };
}

function makeSource(overrides: Partial<EntryBalanceSource> = {}): EntryBalanceSource {
  return {
    id: 'c1',
    showId: 's1',
    showDate: new Date('2026-09-15'),
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    totalFee: 25,
    ...overrides,
  };
}

describe('buildOrderBalance', () => {
  it('preserves an explicit null payment method instead of inheriting a paid-cash sibling', () => {
    // c1 is a cash row (sets the order's fallback paymentMethod); c2 has no
    // resolved payment method yet (null, not undefined) — a still-unresolved
    // online payment must not read as pay-at-show cash just because a sibling
    // row happens to be cash.
    const classes = [
      makeClass({ id: 'c1', paymentStatus: PaymentStatus.PENDING, paymentMethod: 'cash', fee: 25 }),
      makeClass({ id: 'c2', paymentStatus: PaymentStatus.PENDING, paymentMethod: null, fee: 40 }),
    ];
    const ctx = makeCtx({ paymentMethod: 'cash' });

    const balance = buildOrderBalance(classes, ctx, NOW);

    expect(balance).not.toBeNull();
    expect(balance!.onlineDueCents).toBe(4000);
    expect(balance!.payAtShowDueCents).toBe(2500);
    expect(balance!.dueEntryIds).toEqual(['c2']);
  });

  it('still falls back to the order context method when a row never carried the field', () => {
    const classes = [
      makeClass({
        id: 'c1',
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: undefined,
        fee: 25,
      }),
    ];
    const ctx = makeCtx({ paymentMethod: 'cash' });

    const balance = buildOrderBalance(classes, ctx, NOW);

    expect(balance!.payAtShowDueCents).toBe(2500);
    expect(balance!.onlineDueCents).toBe(0);
  });

  it('reconciles a refund from a terminal-status sibling instead of losing it behind a paid row', () => {
    // A withdrawn class commonly moves to a terminal entryStatus (CANCELLED)
    // while its paymentStatus becomes REFUNDED. `eligible` (used for
    // amount-due) correctly drops it, but reconciliation must still see it —
    // otherwise the remaining paid sibling wins and the card renders "Paid"
    // with an enabled receipt for an order that actually had a refund.
    const classes = [
      makeClass({
        id: 'c1',
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        fee: 30,
      }),
      makeClass({
        id: 'c2',
        entryStatus: EntryStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED,
        fee: 20,
      }),
    ];
    const ctx = makeCtx();

    const balance = buildOrderBalance(classes, ctx, NOW);

    expect(balance!.paymentStatus).toBe(PaymentStatus.PARTIAL_REFUND);
  });

  it('reconciles a past order with a paid class and a refunded class as PARTIAL_REFUND, not REFUNDED', () => {
    // Once a show is in the past, isCurrentSummaryEntry excludes every row —
    // reconciliation must still recognize the paid sibling as a settled fact,
    // or the order reads as fully refunded and its receipt is suppressed.
    const classes = [
      makeClass({
        id: 'c1',
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        fee: 30,
      }),
      makeClass({
        id: 'c2',
        entryStatus: EntryStatus.CANCELLED,
        paymentStatus: PaymentStatus.REFUNDED,
        fee: 20,
      }),
    ];
    const ctx = makeCtx({ showDate: new Date('2026-08-01') });

    const balance = buildOrderBalance(classes, ctx, NOW);

    expect(balance!.paymentStatus).toBe(PaymentStatus.PARTIAL_REFUND);
  });
});

describe('reconcileOrderPaymentStatus', () => {
  it('keeps a direct PARTIAL_REFUND row instead of letting a paid sibling win', () => {
    const eligible = [
      makeSource({ id: 'c1', paymentStatus: PaymentStatus.PARTIAL_REFUND }),
      makeSource({ id: 'c2', paymentStatus: PaymentStatus.PAID_ONLINE }),
    ];

    expect(reconcileOrderPaymentStatus(eligible)).toBe(PaymentStatus.PARTIAL_REFUND);
  });

  it('still reports REFUNDED when every eligible row is fully refunded', () => {
    const eligible = [
      makeSource({ id: 'c1', paymentStatus: PaymentStatus.REFUNDED }),
      makeSource({ id: 'c2', paymentStatus: PaymentStatus.REFUNDED }),
    ];

    expect(reconcileOrderPaymentStatus(eligible)).toBe(PaymentStatus.REFUNDED);
  });

  it('still reports PARTIAL_REFUND for a mix of refunded and paid rows', () => {
    const eligible = [
      makeSource({ id: 'c1', paymentStatus: PaymentStatus.REFUNDED }),
      makeSource({ id: 'c2', paymentStatus: PaymentStatus.PAID_ONLINE }),
    ];

    expect(reconcileOrderPaymentStatus(eligible)).toBe(PaymentStatus.PARTIAL_REFUND);
  });
});

function makeEntry(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Test Show',
    showDate: new Date('2026-09-15'),
    location: { venue: 'Test Venue', city: 'Denver', state: 'CO' },
    dogName: 'Rex',
    dogId: 'd1',
    classes: [],
    dogs: [],
    totalFee: 50,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-08-01'),
    lastUpdated: new Date('2026-08-15'),
    ...overrides,
  };
}

function makeBalance(overrides: Partial<MyEntryBalance> = {}): MyEntryBalance {
  return {
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: null,
    amountDueCents: 0,
    onlineDueCents: 0,
    payAtShowDueCents: 0,
    payAtShowMethod: null,
    dueEntryIds: [],
    ...overrides,
  };
}

describe('buildOrderPaymentHref', () => {
  it('targets exactly the rows the balance says owe an online amount', () => {
    const entry = makeEntry({
      classes: [makeClass({ id: 'c1' }), makeClass({ id: 'c2' })],
      balance: makeBalance({ onlineDueCents: 2500, dueEntryIds: ['c2'] }),
    });

    expect(buildOrderPaymentHref(entry)).toBe('/cart?showId=s1&entryIds=c2');
  });

  it('refuses recovery when the show relation never resolved', () => {
    // showId '' would build `/cart?showId=&entryIds=...` — a cart with no show.
    const entry = makeEntry({
      showId: '',
      classes: [makeClass({ id: 'c1', paymentMethod: null })],
    });

    expect(buildOrderPaymentHref(entry)).toBeNull();
  });

  it('refuses recovery when an authoritative balance owes nothing online', () => {
    const entry = makeEntry({
      classes: [makeClass({ id: 'c1', paymentMethod: 'cash' })],
      balance: makeBalance({ payAtShowDueCents: 2500, payAtShowMethod: 'cash' }),
    });

    expect(buildOrderPaymentHref(entry)).toBeNull();
  });

  it('never sweeps a pending pay-at-show row into the online cart', () => {
    // No balance = the partial-replication window. The old fallback used EVERY
    // class id, which put the cash row into an online checkout.
    const entry = makeEntry({
      paymentMethod: 'cash',
      classes: [
        makeClass({ id: 'c1', paymentStatus: PaymentStatus.PENDING, paymentMethod: 'cash' }),
        makeClass({ id: 'c2', paymentStatus: PaymentStatus.PENDING, paymentMethod: null }),
      ],
    });

    expect(buildOrderPaymentHref(entry)).toBe('/cart?showId=s1&entryIds=c2');
  });

  it('refuses recovery when every unreplicated row is pay-at-show', () => {
    const entry = makeEntry({
      paymentMethod: 'check',
      classes: [makeClass({ id: 'c1', paymentStatus: PaymentStatus.PENDING, paymentMethod: 'check' })],
    });

    expect(buildOrderPaymentHref(entry)).toBeNull();
  });

  it('excludes already-paid rows from the recovery fallback', () => {
    const entry = makeEntry({
      classes: [
        makeClass({ id: 'c1', paymentStatus: PaymentStatus.PAID_ONLINE, paymentMethod: 'online' }),
        makeClass({ id: 'c2', paymentStatus: PaymentStatus.PENDING, paymentMethod: 'online' }),
      ],
    });

    expect(buildOrderPaymentHref(entry)).toBe('/cart?showId=s1&entryIds=c2');
  });

  it('falls back to the entry row itself when no class rows replicated at all', () => {
    const entry = makeEntry({ classes: [], paymentStatus: PaymentStatus.PENDING });

    expect(buildOrderPaymentHref(entry)).toBe('/cart?showId=s1&entryIds=e1');
  });

  it('refuses the entry-row fallback when the entry itself is pay-at-show', () => {
    const entry = makeEntry({
      classes: [],
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: 'cash',
    });

    expect(buildOrderPaymentHref(entry)).toBeNull();
  });
});
