/**
 * Cross-surface count fixture (exhibitor-count-integrity, task 6.3).
 *
 * The exhibitor UX audit found counts that read as contradictions because
 * different surfaces count DIFFERENT UNITS (orders vs. dogs vs. class entries
 * vs. entry records) or DIFFERENT SCOPES (current vs. all-time/history) while
 * sharing the same bare noun ("entries"). This file pins ONE shared set of raw
 * fixture rows and asserts, surface by surface, what each count SHOULD be —
 * each assertion names its unit and scope so a future change that quietly
 * makes two legitimately-different counts collide (or a fix that makes two
 * counts that SHOULD agree diverge) fails loudly here instead of only
 * surfacing as a support ticket.
 *
 * No new aggregate/summary selector is introduced — every assertion reuses an
 * existing lifecycle selector:
 *  - `computeMyEntriesShowProgressStats` (MyEntriesPage/My Shows: current vs.
 *    all-time order-level entries, and distinct shows)
 *  - `buildSubmittedEntryProjection` (show-detail "My Entries" tab / "My run
 *    schedule" banner: per-show class-entry rows and history)
 *
 * @module MyEntriesPage/modules/crossSurfaceCounts.fixture
 */

import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { computeMyEntriesShowProgressStats } from './myEntriesStats.helpers';
import type { MyEntry, MyEntryDogGroup, EntryClass } from './my-entries-types';
import {
  buildSubmittedEntryProjection,
  type SubmittedEntryProjectionRow,
} from '@/features/exhibitor-entry/submittedEntryProjection';

const NOW = new Date(2026, 5, 2, 20, 0, 0); // Tue Jun 2 2026, 20:00 local

function makeClass(id: string): EntryClass {
  return {
    id,
    classId: id,
    name: `Class ${id}`,
    number: id,
    fee: 25,
    status: 'entered',
  };
}

function makeDogGroup(dogId: string, dogName: string, classIds: string[]): MyEntryDogGroup {
  return {
    id: `${dogId}-group`,
    dogId,
    dogName,
    classes: classIds.map(makeClass),
    entryStatus: EntryStatus.ACCEPTED,
  };
}

function makeOrder(overrides: Partial<MyEntry> & { dogs: MyEntryDogGroup[] }): MyEntry {
  const firstDog = overrides.dogs[0];
  return {
    id: overrides.id ?? 'entry-1',
    registrationId: 'order-1',
    showId: 'show-1',
    showName: 'Show 1',
    showDate: new Date(2026, 5, 2),
    location: { venue: '', city: '', state: '' },
    dogName: firstDog?.dogName ?? '',
    dogId: firstDog?.dogId ?? '',
    classes: overrides.dogs.flatMap(d => d.classes),
    totalFee: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: NOW,
    lastUpdated: NOW,
    ...overrides,
  };
}

/**
 * One exhibitor's cross-show fixture:
 *  - Order A: "Heritage" show, running today (current/non-past). Two dogs —
 *    Rex (2 classes) and Fido (1 class) — grouped on a single online order.
 *  - Order B: "QA Walk" show, ended last month (past/history). One dog — Rex
 *    again, re-entered in a different show — with 2 classes.
 *
 * This mirrors the audit's exact shape: the same dog (Rex) appears on two
 * orders across two shows, so "orders", "dogs", and "class entries" are all
 * legitimately different numbers for the same exhibitor.
 */
const orderA = makeOrder({
  id: 'entry-heritage',
  registrationId: 'order-a',
  showId: 'heritage',
  showName: 'Heritage',
  showDate: new Date(2026, 4, 31),
  showEndDate: new Date(2026, 5, 14), // still running today
  dogs: [makeDogGroup('rex', 'Rex', ['h-1', 'h-2']), makeDogGroup('fido', 'Fido', ['h-3'])],
});

const orderB = makeOrder({
  id: 'entry-qawalk',
  registrationId: 'order-b',
  showId: 'qawalk',
  showName: 'QA Walk',
  showDate: new Date(2026, 4, 1),
  showEndDate: new Date(2026, 4, 3), // ended weeks ago — past
  dogs: [makeDogGroup('rex', 'Rex', ['q-1', 'q-2'])],
});

const allOrders: MyEntry[] = [orderA, orderB];

describe('cross-surface count fixture — MyEntriesPage/My Shows (order-level)', () => {
  it('orders: distinct registrationId count is 2, not 5 (class entries) or 2 (dogs, coincidentally equal here)', () => {
    const orderIds = new Set(allOrders.map(e => e.registrationId));
    expect(orderIds.size).toBe(2);
  });

  it('dogs: distinct dogId count across every order is 2 (Rex appears on both orders, counted once)', () => {
    const dogIds = new Set(allOrders.flatMap(e => e.dogs.map(d => d.dogId)));
    expect(dogIds.size).toBe(2);
  });

  it("class entries: sum of every dog's classes across every order is 5 (2+1 on order A, 2 on order B)", () => {
    const classEntryCount = allOrders.reduce(
      (sum, e) => sum + e.dogs.reduce((dogSum, d) => dogSum + d.classes.length, 0),
      0
    );
    expect(classEntryCount).toBe(5);
  });

  it("current entries (upcomingEntries): reuses computeMyEntriesShowProgressStats, counts ORDER-level rows in non-past shows only — 1, not 2 (all orders) or 3 (Rex's classes)", () => {
    const stats = computeMyEntriesShowProgressStats(allOrders, NOW);
    expect(stats.upcomingEntries).toBe(1); // only orderA — orderB's show has ended
    expect(stats.upcomingShows).toBe(1); // Heritage
    expect(stats.completedShows).toBe(1); // QA Walk
  });

  it('history (all-time, all-status): every order record regardless of show date is 2 — the "All entries / includes past shows" scope', () => {
    expect(allOrders.length).toBe(2);
  });

  it('current entries and history are DIFFERENT SCOPES of the same order-level unit, and must stay labeled distinctly (1 vs. 2)', () => {
    const stats = computeMyEntriesShowProgressStats(allOrders, NOW);
    const historyCount = allOrders.length;
    expect(stats.upcomingEntries).not.toBe(historyCount);
  });
});

function submittedRow(
  id: string,
  overrides: Partial<SubmittedEntryProjectionRow> = {}
): SubmittedEntryProjectionRow {
  return {
    id,
    dogId: 'rex',
    classId: `class-${id}`,
    status: 'confirmed',
    checkInStatus: null,
    deletedAt: null,
    specialRequests: null,
    handlerId: null,
    ...overrides,
  };
}

describe('cross-surface count fixture — show-detail "My Entries" tab / "My run schedule" (class-entry level, single show)', () => {
  // A single show where Rex and Fido are entered across several classes,
  // including one class Rex was moved OUT of (superseded — never counted) and
  // one withdrawn class (still counted as history, per buildSubmittedEntryProjection).
  const rows: SubmittedEntryProjectionRow[] = [
    submittedRow('r1', { dogId: 'rex', classId: 'jumpers' }),
    submittedRow('r2', { dogId: 'rex', classId: 'standard' }),
    submittedRow('r3', { dogId: 'rex', classId: 'novice-a', status: 'moved' }), // superseded move-up source
    submittedRow('r4', { dogId: 'rex', classId: 'novice-b' }), // move-up destination
    submittedRow('r5', { dogId: 'fido', classId: 'fast-cat' }),
    submittedRow('r6', { dogId: 'fido', classId: 'time-2-beat', status: 'withdrawn' }),
  ];
  const ownedDogIds = new Set(['rex', 'fido']);

  it('class entries / history: reuses buildSubmittedEntryProjection.historyCount — 5 dog×class rows for THIS SHOW (moved source superseded, withdrawal still counted), not 6 raw rows', () => {
    const projection = buildSubmittedEntryProjection({ rows, ownedDogIds, state: 'ready' });
    expect(projection.historyCount).toBe(5);
  });

  it('active class entries: distinct classIds still active in this show is 4 — excludes the withdrawn row, a DIFFERENT scope than historyCount (5)', () => {
    const projection = buildSubmittedEntryProjection({ rows, ownedDogIds, state: 'ready' });
    expect(projection.activeClassIds.size).toBe(4);
    expect(projection.activeClassIds.size).not.toBe(projection.historyCount);
  });

  it('dogs in this show: distinct dogId among owned history rows is 2 (Rex, Fido) — a THIRD unit distinct from class entries (5) and orders (n/a within a single show)', () => {
    const projection = buildSubmittedEntryProjection({ rows, ownedDogIds, state: 'ready' });
    const dogsInShow = new Set(projection.ownedHistory.map(r => r.dogId));
    expect(dogsInShow.size).toBe(2);
  });
});
