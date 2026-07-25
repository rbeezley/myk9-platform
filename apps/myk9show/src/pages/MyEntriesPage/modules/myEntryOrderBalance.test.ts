import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { buildOrderBalance, reconcileOrderPaymentStatus } from './myEntryOrderBalance';
import type { EntryBalanceSource } from '@/features/payments/entryBalanceSummary';
import type { EntryClass } from './my-entries-types';
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
