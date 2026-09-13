import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import {
  PAID_STRIP_WINDOW_DAYS,
  derivePaidStrip,
  hasSeenPaidStrip,
  markPaidStripSeen,
} from './paidStripSeen';
import type { EntryClass, MyEntry } from './my-entries-types';

const NOW = new Date('2026-10-01T12:00:00Z');
const SHOW_DATE = new Date('2026-10-24T00:00:00');
const PAST_SHOW_DATE = new Date('2026-09-05T00:00:00');
const PAID_AT = new Date('2026-09-30T10:00:00Z');
/** A later, unrelated write (a check-in, a score) — must NOT count as a payment. */
const TOUCHED_AT = new Date('2026-10-01T08:00:00Z');

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  restoreStorage();
});

/**
 * The suite's global localStorage stub is a plain object of `vi.fn`s, not
 * `Storage.prototype`, so a prototype spy would not intercept it. Swap the
 * whole object for a throwing one and put it back afterwards.
 */
let savedStorage: Storage | undefined;

function breakStorage(): void {
  savedStorage = globalThis.localStorage;
  const thrower = () => {
    throw new Error('storage denied');
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: thrower,
      setItem: thrower,
      removeItem: thrower,
      clear: thrower,
      key: thrower,
      length: 0,
    } as unknown as Storage,
  });
}

function restoreStorage(): void {
  if (!savedStorage) return;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: savedStorage,
  });
  savedStorage = undefined;
}

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
    submittedAt: PAID_AT,
    lastUpdated: TOUCHED_AT,
    ...overrides,
  };
}

const neverSeen = () => false;

describe('hasSeenPaidStrip / markPaidStripSeen', () => {
  it('remembers a dismissal under its own prefix', () => {
    expect(hasSeenPaidStrip('order-1')).toBe(false);
    markPaidStripSeen('order-1');
    expect(hasSeenPaidStrip('order-1')).toBe(true);
    expect(hasSeenPaidStrip('order-2')).toBe(false);
    expect(localStorage.getItem('myk9:paid-strip-seen:order-1')).toBe('1');
  });

  it('reports not-seen and does not throw when storage is unavailable', () => {
    breakStorage();

    expect(hasSeenPaidStrip('order-1')).toBe(false);
    expect(() => markPaidStripSeen('order-1')).not.toThrow();
    expect(hasSeenPaidStrip('order-1')).toBe(false);
  });
});

describe('derivePaidStrip', () => {
  it('shows the strip on the first visit after paying online', () => {
    const strip = derivePaidStrip(groupEntriesByOrder([makeRow()], NOW), NOW, neverSeen);

    expect(strip).toEqual({
      orderIds: ['e1'],
      dogNames: ['Rex'],
      amountCents: 4500,
      date: PAID_AT,
    });
  });

  // An online order is paid at checkout, so `submittedAt` IS the payment
  // moment. `lastUpdated` was the first choice and flooded the seeded
  // exhibitor with 255 strips: it moves with every later write (check-in,
  // score, secretary edit), so a show-day update made every paid order look
  // freshly paid again.
  it('dates the strip by submittedAt, never by lastUpdated', () => {
    const submittedAt = new Date('2026-09-20T09:00:00Z');
    const lastUpdated = new Date('2026-10-01T06:30:00Z');
    const orders = groupEntriesByOrder([makeRow({ submittedAt, lastUpdated })], NOW);

    const strip = derivePaidStrip(orders, NOW, neverSeen);

    expect(strip?.date).toEqual(submittedAt);
    expect(strip?.date).not.toEqual(lastUpdated);
  });

  it('ignores a recent unrelated write on an old payment', () => {
    const paidLongAgo = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
    const orders = groupEntriesByOrder(
      [makeRow({ submittedAt: paidLongAgo, lastUpdated: TOUCHED_AT })],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen)).toBeNull();
  });

  it('folds every fresh order at the show into ONE strip', () => {
    const later = new Date('2026-09-30T18:00:00Z');
    const orders = groupEntriesByOrder(
      [
        makeRow({ id: 'e1', registrationId: 'r1', dogId: 'd1', dogName: 'Rex' }),
        makeRow({
          id: 'e2',
          registrationId: 'r2',
          dogId: 'd2',
          dogName: 'Scout',
          submittedAt: later,
          classes: [makeClass({ id: 'c2', fee: 30 })],
          totalFee: 30,
        }),
        makeRow({
          id: 'e3',
          registrationId: 'r3',
          dogId: 'd1',
          dogName: 'Rex',
          classes: [makeClass({ id: 'c3', fee: 25 })],
          totalFee: 25,
        }),
      ],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen)).toEqual({
      orderIds: ['e1', 'e2', 'e3'],
      dogNames: ['Rex', 'Scout'],
      amountCents: 10000,
      date: later,
    });
  });

  it('drops a dismissed order out of the fold and retires the strip when none remain', () => {
    const orders = groupEntriesByOrder(
      [
        makeRow({ id: 'e1', registrationId: 'r1', dogId: 'd1', dogName: 'Rex' }),
        makeRow({
          id: 'e2',
          registrationId: 'r2',
          dogId: 'd2',
          dogName: 'Scout',
          classes: [makeClass({ id: 'c2' })],
        }),
      ],
      NOW
    );
    markPaidStripSeen('e1');

    expect(derivePaidStrip(orders, NOW, hasSeenPaidStrip)).toMatchObject({
      orderIds: ['e2'],
      dogNames: ['Scout'],
    });

    markPaidStripSeen('e2');
    expect(derivePaidStrip(orders, NOW, hasSeenPaidStrip)).toBeNull();
  });

  it("hides the strip once the show's last date has passed", () => {
    const orders = groupEntriesByOrder(
      [makeRow({ showDate: PAST_SHOW_DATE, showEndDate: PAST_SHOW_DATE })],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen)).toBeNull();
  });

  it('still renders and dismisses in memory when storage throws', () => {
    const orders = groupEntriesByOrder([makeRow()], NOW);
    breakStorage();

    expect(derivePaidStrip(orders, NOW, hasSeenPaidStrip)).not.toBeNull();

    // The component's in-memory dismissal set still hides it for this load.
    const dismissed = new Set<string>();
    markPaidStripSeen('e1');
    dismissed.add('e1');
    expect(
      derivePaidStrip(orders, NOW, id => dismissed.has(id) || hasSeenPaidStrip(id))
    ).toBeNull();
  });

  // A new device would otherwise greet the exhibitor with one strip per show
  // they paid for months ago, since the seen marker is device-local.
  it('hides a payment older than the window on a new device', () => {
    const thirtyDaysAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    const orders = groupEntriesByOrder([makeRow({ submittedAt: thirtyDaysAgo })], NOW);

    expect(derivePaidStrip(orders, NOW, neverSeen)).toBeNull();
  });

  it('holds the window at 14 days', () => {
    expect(PAID_STRIP_WINDOW_DAYS).toBe(14);
    const justInside = new Date(NOW.getTime() - (PAID_STRIP_WINDOW_DAYS * 24 - 1) * 3600 * 1000);
    const justOutside = new Date(NOW.getTime() - (PAID_STRIP_WINDOW_DAYS * 24 + 1) * 3600 * 1000);

    expect(
      derivePaidStrip(
        groupEntriesByOrder([makeRow({ submittedAt: justInside })], NOW),
        NOW,
        neverSeen
      )
    ).not.toBeNull();
    expect(
      derivePaidStrip(
        groupEntriesByOrder([makeRow({ submittedAt: justOutside })], NOW),
        NOW,
        neverSeen
      )
    ).toBeNull();
  });

  it('never produces a strip for a pay-at-show order', () => {
    const orders = groupEntriesByOrder(
      [
        makeRow({
          paymentStatus: PaymentStatus.PAID_BY_CHECK,
          paymentMethod: 'check',
          classes: [
            makeClass({ paymentStatus: PaymentStatus.PAID_BY_CHECK, paymentMethod: 'check' }),
          ],
        }),
      ],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen)).toBeNull();
  });

  it('never produces a strip for a waived order', () => {
    const orders = groupEntriesByOrder(
      [
        makeRow({
          paymentStatus: PaymentStatus.WAIVED,
          paymentMethod: 'waived',
          classes: [makeClass({ paymentStatus: PaymentStatus.WAIVED, paymentMethod: 'waived' })],
        }),
      ],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen)).toBeNull();
  });

  it('never produces a strip for an unpaid order', () => {
    const orders = groupEntriesByOrder(
      [
        makeRow({
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: 'online',
          classes: [makeClass({ paymentStatus: PaymentStatus.PENDING, paymentMethod: 'online' })],
        }),
      ],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen)).toBeNull();
  });

  it('names every dog on a multi-dog order', () => {
    const orders = groupEntriesByOrder(
      [
        makeRow({ id: 'e1', dogId: 'd1', dogName: 'Rex' }),
        makeRow({ id: 'e2', dogId: 'd2', dogName: 'Scout', classes: [makeClass({ id: 'c2' })] }),
      ],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen)?.dogNames).toEqual(['Rex', 'Scout']);
  });
});
