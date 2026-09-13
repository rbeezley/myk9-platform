/**
 * Composes a SHOW-level view over the order-level grouping.
 *
 * `groupEntriesByOrder` already resolves everything an order owns: dog-level
 * status merging, the reconciled money balance, refunds and the confirmation
 * number. My Shows renders one card group per SHOW, so this module merges those
 * orders by `showId` and, inside a show, merges each order's dogs by `dogId` —
 * it never re-derives money or status from raw rows (D1).
 *
 * Two properties this must conserve, because losing either is a visible bug:
 *  - Every class visible before the regrouping is visible after it. Rows with a
 *    null `registrationId` (secretary/mail-in) join their show's group rather
 *    than getting a group of their own.
 *  - Order identity survives on each class row (`orderId`, `registrationId`,
 *    `confirmationNumber`), so receipts, Edit entry and entry-scope deep links
 *    still resolve to the order they name.
 *
 * @module MyEntriesPage/modules/groupEntriesByShow
 */

import type { EntryStatus } from '@/types/show-registration-types';
import type { EntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';
import { dominantStatus, dominantStatusKind } from './groupEntriesByOrder';
import type { EntryClass, MyEntry } from './my-entries-types';

/** A class row that remembers which order it came from. */
export interface MyShowClass extends EntryClass {
  /** `MyEntry.id` of the owning order card. */
  orderId: string;
  /** Null for secretary/mail-in rows with no linked online registration. */
  registrationId: string | null;
  confirmationNumber?: string | undefined;
}

/** One dog at one show, merged across every order the exhibitor placed for it. */
export interface MyShowDog {
  /** Stable row key for the card (the first merged class row's id). */
  id: string;
  dogId: string;
  dogName: string;
  /** Armband for this show; undefined until the secretary assigns one. */
  armband?: string | undefined;
  classes: MyShowClass[];
  /** Dominant status across this dog's classes, folded with the grouping's own rules. */
  entryStatus: EntryStatus;
  entryStatusKind?: EntryStatusKind | undefined;
  /** Order ids contributing classes to this dog, in first-seen order. */
  orderIds: string[];
}

/** One show, with every order beneath it and one dog card per dog. */
export interface MyShowGroup {
  /** Grouping key — `showId` when present, else a name+date fallback. */
  key: string;
  showId: string;
  showName: string;
  isShowCancelled: boolean;
  showDate: Date;
  showEndDate?: Date | undefined;
  location: MyEntry['location'];
  /** Earliest close date across the show's orders, when any carries one. */
  entryCloseDate?: Date | undefined;
  /** Every order for this show, in first-seen order. Never empty. */
  orders: MyEntry[];
  /** Dogs in armband order; unassigned armbands last, by name. */
  dogs: MyShowDog[];
}

/**
 * Stable show key. Mirrors `myEntriesStats.helpers.showKey`: legacy/degraded
 * rows can arrive without a `showId`, and collapsing them all under `''` would
 * merge unrelated shows into one card group.
 */
function nameDateKey(entry: MyEntry): string {
  return `${entry.showName}|${entry.showDate.getTime()}`;
}

/**
 * Resolve an order to its show group's key. An order can arrive before its
 * show relation has replicated (`showId === ''`) while a sibling order for the
 * same show already carries the id; keying those apart rendered two groups,
 * one with a dead `/shows/` link (Codex review on PR #2198). So name+date is
 * the bridge: a degraded order joins a resolved group that shares its
 * name+date, and a resolved order adopts a degraded group opened before it.
 */
function resolveShowKey(entry: MyEntry, byNameDate: Map<string, string>): string {
  const nameDate = nameDateKey(entry);
  const existing = byNameDate.get(nameDate);
  if (entry.showId) {
    // A degraded group already open under name+date is this show; retarget it.
    return existing && !existing.includes('|') ? existing : entry.showId;
  }
  return existing ?? nameDate;
}

/**
 * Armband ordering: numeric when both are numeric (so 9 precedes 10), else
 * lexical. Dogs with no armband sort last, among themselves by name.
 */
function compareDogs(a: MyShowDog, b: MyShowDog): number {
  const aBand = a.armband?.trim();
  const bBand = b.armband?.trim();
  if (aBand && bBand) {
    const aNum = Number(aBand);
    const bNum = Number(bBand);
    if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
    if (aBand !== bBand) return aBand.localeCompare(bBand);
    return a.dogName.localeCompare(b.dogName);
  }
  if (aBand && !bBand) return -1;
  if (!aBand && bBand) return 1;
  return a.dogName.localeCompare(b.dogName);
}

interface ShowAccum {
  group: MyShowGroup;
  dogsByDogId: Map<string, MyShowDog>;
  dogOrder: string[];
}

function startGroup(order: MyEntry, key: string): ShowAccum {
  return {
    group: {
      key,
      showId: order.showId,
      showName: order.showName,
      isShowCancelled: Boolean(order.isShowCancelled),
      showDate: order.showDate,
      showEndDate: order.showEndDate,
      location: order.location,
      entryCloseDate: order.entryCloseDate,
      orders: [],
      dogs: [],
    },
    dogsByDogId: new Map(),
    dogOrder: [],
  };
}

function mergeShowFacts(accum: ShowAccum, order: MyEntry): void {
  const group = accum.group;
  group.isShowCancelled ||= Boolean(order.isShowCancelled);
  // A show's own dates/venue are identical across its orders; keep the first
  // non-empty one so a degraded row never blanks a resolved header.
  group.showEndDate = group.showEndDate ?? order.showEndDate;
  if (!group.location.venue && order.location.venue) group.location = order.location;
  // The editing window is the show's, so take the EARLIEST close date any order
  // carries — the header must never advertise a window that has already shut.
  if (order.entryCloseDate) {
    group.entryCloseDate =
      group.entryCloseDate && group.entryCloseDate <= order.entryCloseDate
        ? group.entryCloseDate
        : order.entryCloseDate;
  }
}

function toShowClasses(order: MyEntry, classes: EntryClass[]): MyShowClass[] {
  return classes.map(cls => ({
    ...cls,
    orderId: order.id,
    registrationId: order.registrationId,
    confirmationNumber: order.confirmationNumber,
  }));
}

/**
 * Group order cards into one card group per show.
 *
 * @param orders Output of `groupEntriesByOrder` (already money-reconciled).
 */
export function groupEntriesByShow(orders: MyEntry[]): MyShowGroup[] {
  const shows = new Map<string, ShowAccum>();
  const showOrder: string[] = [];
  /** name+date → the key of the group opened for that show, degraded or not. */
  const byNameDate = new Map<string, string>();

  for (const order of orders) {
    const nameDate = nameDateKey(order);
    let key = resolveShowKey(order, byNameDate);
    let accum = shows.get(key);
    if (!accum && order.showId && byNameDate.get(nameDate)?.includes('|')) {
      // A degraded group was opened under name+date before this resolved
      // order arrived: adopt it and give it the real show id.
      const degradedKey = byNameDate.get(nameDate)!;
      accum = shows.get(degradedKey)!;
      shows.delete(degradedKey);
      key = order.showId;
      accum.group.key = key;
      accum.group.showId = order.showId;
      shows.set(key, accum);
      showOrder[showOrder.indexOf(degradedKey)] = key;
    }
    if (!accum) {
      accum = startGroup(order, key);
      shows.set(key, accum);
      showOrder.push(key);
    } else {
      mergeShowFacts(accum, order);
    }
    byNameDate.set(nameDate, key);
    accum.group.orders.push(order);

    for (const orderDog of order.dogs) {
      const showClasses = toShowClasses(order, orderDog.classes);
      let dog = accum.dogsByDogId.get(orderDog.dogId);
      if (!dog) {
        dog = {
          id: orderDog.id,
          dogId: orderDog.dogId,
          dogName: orderDog.dogName,
          armband: orderDog.armband,
          classes: [],
          entryStatus: orderDog.entryStatus,
          entryStatusKind: orderDog.entryStatusKind,
          orderIds: [],
        };
        accum.dogsByDogId.set(orderDog.dogId, dog);
        accum.dogOrder.push(orderDog.dogId);
      } else {
        // Same fold the order grouping uses, so a dog entered through two
        // orders never disagrees with either card about its status.
        dog.entryStatusKind = dominantStatusKind(
          dog.entryStatus,
          dog.entryStatusKind,
          orderDog.entryStatus,
          orderDog.entryStatusKind
        );
        dog.entryStatus = dominantStatus(dog.entryStatus, orderDog.entryStatus);
        dog.armband = dog.armband ?? orderDog.armband;
      }
      dog.classes.push(...showClasses);
      if (!dog.orderIds.includes(order.id)) dog.orderIds.push(order.id);
    }
  }

  return showOrder.map(key => {
    const accum = shows.get(key)!;
    accum.group.dogs = accum.dogOrder.map(dogId => accum.dogsByDogId.get(dogId)!).sort(compareDogs);
    return accum.group;
  });
}

/** Index a group's orders by id — the lookup `dayCheckIn` needs per class row. */
export function indexOrdersById(group: MyShowGroup): Record<string, MyEntry> {
  return group.orders.reduce<Record<string, MyEntry>>((byId, order) => {
    byId[order.id] = order;
    return byId;
  }, {});
}
