import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import {
  PAID_STRIP_WINDOW_DAYS,
  derivePaidStrips,
  hasSeenPaidStrip,
  markPaidStripSeen,
} from './paidStripSeen';
import type { EntryClass, MyEntry } from './my-entries-types';

const NOW = new Date('2026-10-01T12:00:00Z');
const SHOW_DATE = new Date('2026-10-24T00:00:00');
const PAST_SHOW_DATE = new Date('2026-09-05T00:00:00');
const PAID_AT = new Date('2026-09-30T10:00:00Z');

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
    submittedAt: new Date('2026-09-01'),
    lastUpdated: PAID_AT,
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

describe('derivePaidStrips', () => {
  it('shows the strip on the first visit after paying online', () => {
    const strips = derivePaidStrips(groupEntriesByOrder([makeRow()], NOW), NOW, neverSeen);

    expect(strips).toEqual([
      { orderId: 'e1', dogNames: ['Rex'], amountCents: 4500, date: PAID_AT },
    ]);
  });

  // Resolved open question (design.md): `MyEntry` carries no `paidAt`, so the
  // strip's date is the order's `lastUpdated` — the timestamp the payment write
  // itself moved. `submittedAt` is deliberately NOT it: an order submitted in
  // September and paid in October would date the confirmation to September and
  // the recency window would retire the strip before the exhibitor ever saw it.
  it("dates the strip by the payment's lastUpdated, never by submittedAt", () => {
    const submittedAt = new Date('2026-09-01T09:00:00Z');
    const lastUpdated = new Date('2026-09-29T16:30:00Z');
    const [order] = groupEntriesByOrder([makeRow({ submittedAt, lastUpdated })], NOW);

    const [strip] = derivePaidStrips([order], NOW, neverSeen);

    expect(strip.date).toEqual(order.lastUpdated);
    expect(strip.date).toEqual(lastUpdated);
    expect(strip.date).not.toEqual(submittedAt);
  });

  it('hides the strip once dismissed on this device', () => {
    const orders = groupEntriesByOrder([makeRow()], NOW);
    markPaidStripSeen('e1');

    expect(derivePaidStrips(orders, NOW, hasSeenPaidStrip)).toEqual([]);
  });

  it("hides the strip once the show's last date has passed", () => {
    const orders = groupEntriesByOrder(
      [makeRow({ showDate: PAST_SHOW_DATE, showEndDate: PAST_SHOW_DATE })],
      NOW
    );

    expect(derivePaidStrips(orders, NOW, neverSeen)).toEqual([]);
  });

  it('still renders and dismisses in memory when storage throws', () => {
    const orders = groupEntriesByOrder([makeRow()], NOW);
    breakStorage();

    expect(derivePaidStrips(orders, NOW, hasSeenPaidStrip)).toHaveLength(1);

    // The component's in-memory dismissal set still hides it for this load.
    const dismissed = new Set<string>();
    markPaidStripSeen('e1');
    dismissed.add('e1');
    expect(derivePaidStrips(orders, NOW, id => dismissed.has(id) || hasSeenPaidStrip(id))).toEqual(
      []
    );
  });

  // A new device would otherwise greet the exhibitor with one strip per show
  // they paid for months ago, since the seen marker is device-local.
  it('hides a payment older than the window on a new device', () => {
    const thirtyDaysAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    const orders = groupEntriesByOrder([makeRow({ lastUpdated: thirtyDaysAgo })], NOW);

    expect(derivePaidStrips(orders, NOW, neverSeen)).toEqual([]);
  });

  it('still shows a payment inside the window', () => {
    const thirteenDaysAgo = new Date(NOW.getTime() - 13 * 24 * 60 * 60 * 1000);
    const orders = groupEntriesByOrder([makeRow({ lastUpdated: thirteenDaysAgo })], NOW);

    expect(derivePaidStrips(orders, NOW, neverSeen)).toHaveLength(1);
  });

  it('holds the window at 14 days', () => {
    expect(PAID_STRIP_WINDOW_DAYS).toBe(14);
    const justInside = new Date(NOW.getTime() - (PAID_STRIP_WINDOW_DAYS * 24 - 1) * 3600 * 1000);
    const justOutside = new Date(NOW.getTime() - (PAID_STRIP_WINDOW_DAYS * 24 + 1) * 3600 * 1000);

    expect(
      derivePaidStrips(
        groupEntriesByOrder([makeRow({ lastUpdated: justInside })], NOW),
        NOW,
        neverSeen
      )
    ).toHaveLength(1);
    expect(
      derivePaidStrips(
        groupEntriesByOrder([makeRow({ lastUpdated: justOutside })], NOW),
        NOW,
        neverSeen
      )
    ).toEqual([]);
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

    expect(derivePaidStrips(orders, NOW, neverSeen)).toEqual([]);
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

    expect(derivePaidStrips(orders, NOW, neverSeen)).toEqual([]);
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

    expect(derivePaidStrips(orders, NOW, neverSeen)).toEqual([]);
  });

  it('names every dog on a multi-dog order', () => {
    const orders = groupEntriesByOrder(
      [
        makeRow({ id: 'e1', dogId: 'd1', dogName: 'Rex' }),
        makeRow({ id: 'e2', dogId: 'd2', dogName: 'Scout', classes: [makeClass({ id: 'c2' })] }),
      ],
      NOW
    );

    expect(derivePaidStrips(orders, NOW, neverSeen)[0].dogNames).toEqual(['Rex', 'Scout']);
  });
});
