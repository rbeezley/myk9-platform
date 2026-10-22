import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import {
  PAID_STRIP_WINDOW_DAYS,
  derivePaidStrip,
  isAwaitingSecretaryDecision,
  hasSeenPaidStrip,
  markPaidStripSeen,
  type PaidStripPayment,
} from './paidStripSeen';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { getEntryStatusKindForDisplay } from '@/services/entryDisplay/entryDisplaySelectors';
import type { EntryClass, MyEntry } from './my-entries-types';
import { withFixtureKind } from '@/test/fixtures/entryClassKind';
import { onlineLedgerFor } from '@/test/fixtures/myShowsFixtures';

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
  return withFixtureKind({
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
  });
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

const ledgerFor = onlineLedgerFor;

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
    const strip = derivePaidStrip(
      groupEntriesByOrder([makeRow()], NOW),
      NOW,
      neverSeen,
      ledgerFor(groupEntriesByOrder([makeRow()], NOW))
    );

    expect(strip).toEqual({
      paymentIds: ['c1'],
      amountCents: 4500,
      awaitingReview: false,
      date: PAID_AT,
    });
  });

  // An online order is paid at checkout, so `submittedAt` IS the payment
  // moment. `lastUpdated` was the first choice and flooded the seeded
  // exhibitor with 255 strips: it moves with every later write (check-in,
  // score, secretary edit), so a show-day update made every paid order look
  // freshly paid again.
  it('dates the strip by the payment, never by lastUpdated', () => {
    const submittedAt = new Date('2026-09-20T09:00:00Z');
    const lastUpdated = new Date('2026-10-01T06:30:00Z');
    const orders = groupEntriesByOrder([makeRow({ submittedAt, lastUpdated })], NOW);

    const strip = derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders));

    expect(strip?.date).toEqual(submittedAt);
    expect(strip?.date).not.toEqual(lastUpdated);
  });

  it('ignores a recent unrelated write on an old payment', () => {
    const paidLongAgo = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
    const orders = groupEntriesByOrder(
      [makeRow({ submittedAt: paidLongAgo, lastUpdated: TOUCHED_AT })],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders))).toBeNull();
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

    expect(derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders))).toEqual({
      paymentIds: ['c1', 'c2', 'c3'],
      amountCents: 10000,
      awaitingReview: false,
      date: later,
    });
  });

  it('drops a dismissed payment out of the fold and retires the strip when none remain', () => {
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
    markPaidStripSeen('c1');

    expect(derivePaidStrip(orders, NOW, hasSeenPaidStrip, ledgerFor(orders))).toMatchObject({
      paymentIds: ['c2'],
    });

    markPaidStripSeen('c2');
    expect(derivePaidStrip(orders, NOW, hasSeenPaidStrip, ledgerFor(orders))).toBeNull();
  });

  it("hides the strip once the show's last date has passed", () => {
    const orders = groupEntriesByOrder(
      [makeRow({ showDate: PAST_SHOW_DATE, showEndDate: PAST_SHOW_DATE })],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders))).toBeNull();
  });

  it('still renders and dismisses in memory when storage throws', () => {
    const orders = groupEntriesByOrder([makeRow()], NOW);
    breakStorage();

    expect(derivePaidStrip(orders, NOW, hasSeenPaidStrip, ledgerFor(orders))).not.toBeNull();

    // The component's in-memory dismissal set still hides it for this load.
    const dismissed = new Set<string>();
    markPaidStripSeen('c1');
    dismissed.add('c1');
    expect(
      derivePaidStrip(
        orders,
        NOW,
        id => dismissed.has(id) || hasSeenPaidStrip(id),
        ledgerFor(orders)
      )
    ).toBeNull();
  });

  // A new device would otherwise greet the exhibitor with one strip per show
  // they paid for months ago, since the seen marker is device-local.
  it('hides a payment older than the window on a new device', () => {
    const thirtyDaysAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    const orders = groupEntriesByOrder([makeRow({ submittedAt: thirtyDaysAgo })], NOW);

    expect(derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders))).toBeNull();
  });

  it('holds the window at 14 days', () => {
    expect(PAID_STRIP_WINDOW_DAYS).toBe(14);
    const justInside = new Date(NOW.getTime() - (PAID_STRIP_WINDOW_DAYS * 24 - 1) * 3600 * 1000);
    const justOutside = new Date(NOW.getTime() - (PAID_STRIP_WINDOW_DAYS * 24 + 1) * 3600 * 1000);

    expect(
      derivePaidStrip(
        groupEntriesByOrder([makeRow({ submittedAt: justInside })], NOW),
        NOW,
        neverSeen,
        ledgerFor(groupEntriesByOrder([makeRow({ submittedAt: justInside })], NOW))
      )
    ).not.toBeNull();
    expect(
      derivePaidStrip(
        groupEntriesByOrder([makeRow({ submittedAt: justOutside })], NOW),
        NOW,
        neverSeen,
        ledgerFor(groupEntriesByOrder([makeRow({ submittedAt: justOutside })], NOW))
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

    expect(derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders))).toBeNull();
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

    expect(derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders))).toBeNull();
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

    expect(derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders))).toBeNull();
  });

  it("confirms every dog's row on a multi-dog order", () => {
    const orders = groupEntriesByOrder(
      [
        makeRow({ id: 'e1', dogId: 'd1', dogName: 'Rex' }),
        makeRow({ id: 'e2', dogId: 'd2', dogName: 'Scout', classes: [makeClass({ id: 'c2' })] }),
      ],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders))?.paymentIds).toEqual([
      'c1',
      'c2',
    ]);
  });
});

// MYK9-804 round 2: `useMyEntriesData` folds a class row's own payment status
// against its order's registration (`resolveEffectivePaymentStatus`), which
// deliberately downgrades a truly paid row to PENDING whenever a sibling
// entry on the SAME registration still owes money. That fold is correct for
// the display badge, but it made a genuinely paid class disappear from this
// banner. `rawPaymentStatus` carries the row's own, never-folded fact.
describe('derivePaidStrip — reads the row-level ground truth, not the folded display status', () => {
  it('counts a row whose folded display status was downgraded to PENDING by a pending sibling', () => {
    const orders = groupEntriesByOrder(
      [
        makeRow({
          dogName: 'Ranger',
          classes: [
            makeClass({
              id: 'c-ranger-paid',
              fee: 30,
              // The order/registration is PENDING overall (a sibling entry
              // still owes), so `paymentStatus` was folded down — but the
              // row's OWN entries.payment_status really is paid.
              paymentStatus: PaymentStatus.PENDING,
              rawPaymentStatus: PaymentStatus.PAID_ONLINE,
            }),
          ],
        }),
      ],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders))).toEqual({
      paymentIds: ['c-ranger-paid'],
      amountCents: 3000,
      awaitingReview: false,
      date: PAID_AT,
    });
  });

  it('excludes a row whose raw status is not paid, even if its folded display status is', () => {
    const orders = groupEntriesByOrder(
      [
        makeRow({
          classes: [
            makeClass({
              paymentStatus: PaymentStatus.PAID_ONLINE,
              rawPaymentStatus: PaymentStatus.PENDING,
            }),
          ],
        }),
      ],
      NOW
    );

    // An order still lists the row (e.g. refunded since); the row's own status wins.
    const coveringOrder: PaidStripPayment = {
      id: 'order-1',
      status: 'succeeded',
      date: PAID_AT.toISOString(),
      amountCents: 4500,
      entryIds: ['c1'],
    };
    expect(derivePaidStrip(orders, NOW, neverSeen, [coveringOrder])).toBeNull();
  });

  it('falls back to the display status when no raw status was carried (legacy/hand-built rows)', () => {
    const orders = groupEntriesByOrder(
      [makeRow({ classes: [makeClass({ paymentStatus: PaymentStatus.PAID_ONLINE })] })],
      NOW
    );

    expect(derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders))).not.toBeNull();
  });

  it('counts only the paid class on a dog that also carries an unpaid sibling class in the same order', () => {
    const orders = groupEntriesByOrder(
      [
        makeRow({
          dogName: 'Ranger',
          totalFee: 60,
          classes: [
            makeClass({
              id: 'c-ranger-paid',
              fee: 30,
              paymentStatus: PaymentStatus.PENDING,
              rawPaymentStatus: PaymentStatus.PAID_ONLINE,
            }),
            makeClass({
              id: 'c-ranger-unpaid',
              fee: 30,
              paymentStatus: PaymentStatus.PENDING,
              rawPaymentStatus: PaymentStatus.PENDING,
            }),
          ],
        }),
      ],
      NOW
    );

    const strip = derivePaidStrip(orders, NOW, neverSeen, ledgerFor(orders));
    expect(strip?.paymentIds).toEqual(['c-ranger-paid']);
    expect(strip?.amountCents).toBe(3000);
  });
});

// MYK9-804's exact reported scenario: 7 paid x $30 across Cooper, Scout,
// Willow and Ranger; Ranger, Juni and Maple carry 3 unpaid $30 classes. The
// account holds TWO registrations for the one show — one fully paid (Cooper,
// Scout, Willow), one mixed (Ranger's paid class folds to PENDING behind its
// own unpaid sibling and Juni/Maple's unpaid classes) — so this also exercises
// the row-level ground truth across an order boundary, not just within one.
describe('derivePaidStrip — the issue scenario (MYK9-804)', () => {
  /** A $30 class row already paid, both in the fold and at the row level. */
  function paidCls(id: string): EntryClass {
    return makeClass({
      id,
      fee: 30,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      rawPaymentStatus: PaymentStatus.PAID_ONLINE,
    });
  }
  /**
   * A $30 class row genuinely unpaid at the row level — `paymentStatus` is
   * also PENDING, matching what a truly-pending row's fold always produces.
   */
  function unpaidCls(id: string): EntryClass {
    return makeClass({
      id,
      fee: 30,
      paymentStatus: PaymentStatus.PENDING,
      rawPaymentStatus: PaymentStatus.PENDING,
    });
  }
  /**
   * A $30 class row that IS paid at the row level, but whose registration is
   * pending (a sibling entry still owes) — `resolveEffectivePaymentStatus`
   * folds `paymentStatus` down to PENDING while `rawPaymentStatus` keeps the
   * truth. This is Ranger's Interior Advanced Preliminary.
   */
  function paidButFoldedCls(id: string): EntryClass {
    return makeClass({
      id,
      fee: 30,
      paymentStatus: PaymentStatus.PENDING,
      rawPaymentStatus: PaymentStatus.PAID_ONLINE,
    });
  }

  function scenarioOrders() {
    return groupEntriesByOrder(
      [
        makeRow({
          id: 'e-cooper',
          registrationId: 'r-main',
          dogId: 'd-cooper',
          dogName: 'Cooper',
          classes: [paidCls('c-cooper-hda')],
        }),
        makeRow({
          id: 'e-scout-1',
          registrationId: 'r-main',
          dogId: 'd-scout',
          dogName: 'Scout',
          classes: [paidCls('c-scout-cna')],
        }),
        makeRow({
          id: 'e-scout-2',
          registrationId: 'r-main',
          dogId: 'd-scout',
          dogName: 'Scout',
          classes: [paidCls('c-scout-inb')],
        }),
        makeRow({
          id: 'e-willow-1',
          registrationId: 'r-main',
          dogId: 'd-willow',
          dogName: 'Willow',
          classes: [paidCls('c-willow-cna')],
        }),
        makeRow({
          id: 'e-willow-2',
          registrationId: 'r-main',
          dogId: 'd-willow',
          dogName: 'Willow',
          classes: [paidCls('c-willow-ia')],
        }),
        makeRow({
          id: 'e-willow-3',
          registrationId: 'r-main',
          dogId: 'd-willow',
          dogName: 'Willow',
          classes: [paidCls('c-willow-iap')],
        }),
        // Ranger's paid class: folded to PENDING by its own unpaid sibling
        // below, on the SAME registration — the exact MYK9-495 direction that
        // hid it from this banner (round 2).
        makeRow({
          id: 'e-ranger-1',
          registrationId: 'r-mixed',
          dogId: 'd-ranger',
          dogName: 'Ranger',
          classes: [paidButFoldedCls('c-ranger-iap')],
        }),
        makeRow({
          id: 'e-ranger-2',
          registrationId: 'r-mixed',
          dogId: 'd-ranger',
          dogName: 'Ranger',
          classes: [unpaidCls('c-ranger-unpaid')],
        }),
        makeRow({
          id: 'e-juni',
          registrationId: 'r-mixed',
          dogId: 'd-juni',
          dogName: 'Juni',
          classes: [unpaidCls('c-juni')],
        }),
        makeRow({
          id: 'e-maple',
          registrationId: 'r-mixed',
          dogId: 'd-maple',
          dogName: 'Maple',
          classes: [unpaidCls('c-maple')],
        }),
      ],
      NOW
    );
  }

  it('states $210 and confirms all 7 paid rows', () => {
    const strip = derivePaidStrip(scenarioOrders(), NOW, neverSeen, ledgerFor(scenarioOrders()));

    expect(strip?.amountCents).toBe(21000);
    expect(strip?.paymentIds).toHaveLength(7);
  });

  it('is unaffected by which subset of the show a filter hands it — same total either way', () => {
    const fullOrders = scenarioOrders();
    // A Status/When filter that narrowed the visible cards to only Ranger's
    // registration must not change what the FULL order set says was paid.
    const rangerOnly = fullOrders.filter(order => order.registrationId === 'r-mixed');

    const full = derivePaidStrip(fullOrders, NOW, neverSeen, ledgerFor(fullOrders));
    const stillFull = derivePaidStrip(fullOrders, NOW, neverSeen, ledgerFor(fullOrders));
    expect(full).toEqual(stillFull);
    expect(full?.amountCents).toBe(21000);

    // Sanity: the narrowed subset alone would have under-counted, which is
    // exactly why the caller must always pass the FULL set, never a filtered
    // one — see `MyShowGroup.tsx`'s `allOrders` prop.
    expect(derivePaidStrip(rangerOnly, NOW, neverSeen, ledgerFor(rangerOnly))?.amountCents).toBe(
      3000
    );
  });
});

describe('isAwaitingSecretaryDecision (real raw statuses)', () => {
  const classify = (raw: string, checkIn: string | null = null) =>
    isAwaitingSecretaryDecision(mapEntryStatus(raw), getEntryStatusKindForDisplay(raw, checkIn));

  it('does not count a row whose kind is forced to withdrawn (a cancelled show)', () => {
    // useMyEntriesData forces entryStatusKind 'withdrawn' on a cancelled show while
    // entryStatus stays mapEntryStatus(raw) = PENDING.
    expect(isAwaitingSecretaryDecision(mapEntryStatus('paid'), 'withdrawn')).toBe(false);
    expect(isAwaitingSecretaryDecision(mapEntryStatus('pending'), 'scratched')).toBe(false);
  });

  it.each(['pending', 'submitted', 'paid', 'promotion-expired', 'waitlist', 'move-up-requested'])(
    'counts %s as awaiting',
    raw => {
      expect(classify(raw)).toBe(true);
    }
  );

  it.each([
    'confirmed',
    'accepted',
    'checked-in',
    'in-ring',
    'completed',
    'withdrawn',
    'not_accepted',
    'scratched',
  ])('does not count %s as awaiting', raw => {
    expect(classify(raw)).toBe(false);
  });

  it('does not count a pending entry once its check-in is in the ring', () => {
    expect(classify('pending', 'in-ring')).toBe(false);
  });
});

// MYK9-1275: the strip claimed "Paid $210 ... Receipt sent to your email" for
// entries a secretary had marked paid by check, while My Payments (which lists
// `stripe_orders`) said "No payments yet". The strip now speaks only for rows a
// settled online order covers, and quotes that order's amount and date.
describe('derivePaidStrip — speaks only for orders My Payments lists (MYK9-1275)', () => {
  const ORDER_PAID_AT = '2026-09-29T15:00:00Z';

  function order(overrides: Partial<PaidStripPayment> = {}): PaidStripPayment {
    return {
      id: 'order-1',
      status: 'succeeded',
      date: ORDER_PAID_AT,
      amountCents: 4725,
      entryIds: ['c1'],
      ...overrides,
    };
  }

  it("quotes the order's own amount and date, not the class fees or submittedAt", () => {
    const strip = derivePaidStrip(groupEntriesByOrder([makeRow()], NOW), NOW, neverSeen, [order()]);

    expect(strip?.amountCents).toBe(4725);
    expect(strip?.date).toEqual(new Date(ORDER_PAID_AT));
  });

  it('shows nothing for a paid row no online order covers (a bare "paid", method unknown)', () => {
    const row = makeRow({
      paymentMethod: null,
      classes: [
        makeClass({
          paymentStatus: PaymentStatus.PAID_ONLINE,
          rawPaymentStatus: PaymentStatus.PAID_ONLINE,
          paymentMethod: null,
        }),
      ],
    });

    expect(derivePaidStrip(groupEntriesByOrder([row], NOW), NOW, neverSeen, [])).toBeNull();
  });

  it('shows nothing for a paid-by-check row, even with other orders on the account', () => {
    const row = makeRow({
      paymentMethod: 'check',
      classes: [
        makeClass({
          paymentStatus: PaymentStatus.PAID_BY_CHECK,
          rawPaymentStatus: PaymentStatus.PAID_BY_CHECK,
          paymentMethod: 'check',
        }),
      ],
    });

    expect(
      derivePaidStrip(groupEntriesByOrder([row], NOW), NOW, neverSeen, [
        order({ entryIds: ['some-other-entry'] }),
      ])
    ).toBeNull();
  });

  it('shows nothing while the payment ledger has not loaded', () => {
    expect(
      derivePaidStrip(groupEntriesByOrder([makeRow()], NOW), NOW, neverSeen, undefined)
    ).toBeNull();
  });

  it.each(['pending', 'processing', 'failed', 'cancelled', 'refunded'])(
    'ignores an order whose status is %s',
    status => {
      expect(
        derivePaidStrip(groupEntriesByOrder([makeRow()], NOW), NOW, neverSeen, [order({ status })])
      ).toBeNull();
    }
  );

  it('keys the 14-day window on the order date', () => {
    const thirtyDaysAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    expect(
      derivePaidStrip(groupEntriesByOrder([makeRow()], NOW), NOW, neverSeen, [
        order({ date: thirtyDaysAgo }),
      ])
    ).toBeNull();
  });

  it('sums each covering order once and dates the strip by the latest', () => {
    const rows = [
      makeRow({ id: 'e1', registrationId: 'r1', classes: [makeClass({ id: 'c1' })] }),
      makeRow({
        id: 'e2',
        registrationId: 'r1',
        dogId: 'd2',
        dogName: 'Scout',
        classes: [makeClass({ id: 'c2' })],
      }),
      makeRow({ id: 'e3', registrationId: 'r2', classes: [makeClass({ id: 'c3' })] }),
    ];
    const later = '2026-09-30T20:00:00Z';

    const strip = derivePaidStrip(groupEntriesByOrder(rows, NOW), NOW, neverSeen, [
      order({ id: 'order-1', amountCents: 9450, entryIds: ['c1', 'c2'] }),
      order({ id: 'order-2', amountCents: 4725, entryIds: ['c3'], date: later }),
    ]);

    expect(strip?.amountCents).toBe(9450 + 4725);
    expect(strip?.paymentIds).toEqual(['c1', 'c2', 'c3']);
    expect(strip?.date).toEqual(new Date(later));
  });
});

// Owner decision (MYK9-1275, after two review findings): the strip echoes the
// covering orders' amount and date and derives nothing else. A gross charge
// paired with a derived class count was false for a partial refund and for a
// partly fulfilled checkout, so neither may change the quoted amount.
describe('derivePaidStrip — echoes the order, nothing derived (MYK9-1275)', () => {
  const twoClassOrder: PaidStripPayment = {
    id: 'order-2',
    status: 'succeeded',
    date: '2026-09-29T15:00:00Z',
    amountCents: 6300,
    entryIds: ['c1', 'c2'],
  };
  const paid = (id: string) =>
    makeClass({
      id,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      rawPaymentStatus: PaymentStatus.PAID_ONLINE,
    });

  it("still quotes the order's amount and date after one of its classes is refunded", () => {
    const refunded = makeClass({
      id: 'c2',
      paymentStatus: PaymentStatus.REFUNDED,
      rawPaymentStatus: PaymentStatus.REFUNDED,
    });
    const row = makeRow({ classes: [paid('c1'), refunded] });

    const strip = derivePaidStrip(groupEntriesByOrder([row], NOW), NOW, neverSeen, [twoClassOrder]);

    expect(strip).toEqual({
      paymentIds: ['c1'],
      amountCents: 6300,
      awaitingReview: false,
      date: new Date('2026-09-29T15:00:00Z'),
    });
  });

  it('quotes exactly the charge of a partly fulfilled checkout, with nothing derived', () => {
    // The webhook stores the full charge but only the fulfilled entry ids.
    const partlyFulfilled: PaidStripPayment = { ...twoClassOrder, entryIds: ['c1'] };
    const row = makeRow({ classes: [paid('c1'), paid('c2')] });

    const strip = derivePaidStrip(groupEntriesByOrder([row], NOW), NOW, neverSeen, [
      partlyFulfilled,
    ]);

    expect(strip).toEqual({
      paymentIds: ['c1'],
      amountCents: 6300,
      awaitingReview: false,
      date: new Date('2026-09-29T15:00:00Z'),
    });
  });
});
