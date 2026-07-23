/**
 * Groups flat per-class-per-dog entry rows into one card per online order.
 *
 * `getUserEntries` returns one row per class per dog. Grouping happens in two
 * layers:
 *  1. Order — rows sharing a `registrationId` belong to the same online order
 *     (one registration per handler per show, migration 054) and become one
 *     card. Rows with a null `registrationId` (secretary/mail-in entries)
 *     fall back to a show+dog key so nothing disappears and — per the
 *     existing behavior — each such dog still gets its own card.
 *  2. Dog — within an order, rows for the same dog merge into one
 *     `MyEntryDogGroup` (a dog entered in N classes produces N rows).
 *
 * @module MyEntriesPage/modules/groupEntriesByOrder
 */

import { EntryStatus } from '@/types/show-registration-types';
import type { MyEntry, MyEntryDogGroup } from './my-entries-types';

// Highest-priority status wins when merging class rows for the same dog, and
// again when merging dogs for the same order.
// COMPLETED tops the scale: a scored result is the strongest positive signal.
// ACCEPTED beats PENDING because the dog is in — the card should look "green".
// MOVE_UP_REQUESTED ties PENDING (both "awaiting"); a plain ACCEPTED sibling
// class still dominates. Terminal statuses (SCRATCHED, CANCELLED) lose to any
// active status.
const ENTRY_STATUS_PRIORITY: Record<EntryStatus, number> = {
  [EntryStatus.COMPLETED]: 7,
  [EntryStatus.ACCEPTED]: 6,
  [EntryStatus.PENDING]: 5,
  [EntryStatus.MOVE_UP_REQUESTED]: 5,
  [EntryStatus.WAITLIST]: 4,
  [EntryStatus.MISSING_INFO]: 3,
  [EntryStatus.MOVED]: 2,
  [EntryStatus.REJECTED]: 1,
  [EntryStatus.SCRATCHED]: 0,
  [EntryStatus.CANCELLED]: 0,
};

export function dominantStatus(a: EntryStatus, b: EntryStatus): EntryStatus {
  return (ENTRY_STATUS_PRIORITY[a] ?? 0) >= (ENTRY_STATUS_PRIORITY[b] ?? 0) ? a : b;
}

interface OrderAccum {
  registrationId: string | null;
  showId: string;
  showName: string;
  showDate: Date;
  showEndDate?: Date | undefined;
  location: MyEntry['location'];
  confirmationNumber?: string | undefined;
  paymentStatus: MyEntry['paymentStatus'];
  paymentMethod: string | null;
  entryCloseDate?: Date | undefined;
  submittedAt: Date;
  lastUpdated: Date;
  dogsByDogId: Map<string, MyEntryDogGroup>;
  dogOrder: string[];
}

/** Order-level grouping key: real registrations group by id; null-registration
 *  rows fall back to show+dog so multiple null-registration dogs never merge
 *  into one card (each still renders, per its own show+dog history). */
function orderKeyFor(row: MyEntry): string {
  return row.registrationId ? `reg:${row.registrationId}` : `dog:${row.showId}:${row.dogId}`;
}

/**
 * Groups flat per-class-per-dog rows into one card per order.
 */
export function groupEntriesByOrder(rawEntries: MyEntry[]): MyEntry[] {
  const orders = new Map<string, OrderAccum>();
  const orderKeys: string[] = [];

  for (const row of rawEntries) {
    const orderKey = orderKeyFor(row);
    let order = orders.get(orderKey);
    if (!order) {
      order = {
        registrationId: row.registrationId,
        showId: row.showId,
        showName: row.showName,
        showDate: row.showDate,
        showEndDate: row.showEndDate,
        location: row.location,
        confirmationNumber: row.confirmationNumber,
        paymentStatus: row.paymentStatus,
        paymentMethod: row.paymentMethod ?? null,
        entryCloseDate: row.entryCloseDate,
        submittedAt: row.submittedAt,
        lastUpdated: row.lastUpdated,
        dogsByDogId: new Map(),
        dogOrder: [],
      };
      orders.set(orderKey, order);
      orderKeys.push(orderKey);
    } else {
      if (row.submittedAt < order.submittedAt) order.submittedAt = row.submittedAt;
      if (row.lastUpdated > order.lastUpdated) order.lastUpdated = row.lastUpdated;
      order.confirmationNumber = order.confirmationNumber ?? row.confirmationNumber;
    }

    let dog = order.dogsByDogId.get(row.dogId);
    if (!dog) {
      dog = {
        id: row.id,
        dogId: row.dogId,
        dogName: row.dogName,
        armband: row.armband,
        classes: [],
        entryStatus: row.entryStatus,
      };
      order.dogsByDogId.set(row.dogId, dog);
      order.dogOrder.push(row.dogId);
    } else {
      dog.entryStatus = dominantStatus(dog.entryStatus, row.entryStatus);
      dog.armband = dog.armband ?? row.armband;
    }
    dog.classes.push(...row.classes);
  }

  return orderKeys.map(key => {
    const order = orders.get(key)!;
    const dogs = order.dogOrder.map(dogId => order.dogsByDogId.get(dogId)!);
    const primary = dogs[0];
    const classes = dogs.flatMap(dog => dog.classes);
    const totalFee = classes.reduce((sum, cls) => sum + cls.fee, 0);
    const entryStatus = dogs.reduce(
      (acc, dog) => dominantStatus(acc, dog.entryStatus),
      primary.entryStatus
    );

    const entry: MyEntry = {
      id: primary.id,
      registrationId: order.registrationId,
      showId: order.showId,
      showName: order.showName,
      showDate: order.showDate,
      showEndDate: order.showEndDate,
      location: order.location,
      dogName: primary.dogName,
      dogId: primary.dogId,
      armband: primary.armband,
      classes,
      dogs,
      totalFee,
      entryStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      confirmationNumber: order.confirmationNumber,
      entryCloseDate: order.entryCloseDate,
      submittedAt: order.submittedAt,
      lastUpdated: order.lastUpdated,
    };
    return entry;
  });
}
