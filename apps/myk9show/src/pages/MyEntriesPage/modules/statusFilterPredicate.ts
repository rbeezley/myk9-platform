/**
 * The My Shows entry-status axis as ONE predicate, so the filter strip's
 * counts (asked about orders in `useMyEntriesFilters`) and the dog cards the
 * list renders (asked about each dog's class rows in `MyShowsList`) can never
 * disagree about what "Pending" means.
 *
 * Why the list needs it a second time: filtering happens on ORDERS, by each
 * order's dominant status, but the page renders DOGS. An order holding a
 * pending dog and an accepted dog survives the Accepted filter whole, so
 * without a dog-level pass the pending dog would render under "Accepted" and
 * vanish under "Pending" (Codex review on PR #2198).
 *
 * @module MyEntriesPage/modules/statusFilterPredicate
 */

import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { isPendingEntry, isWaitlistEntry } from '@/utils/entryPredicates';
import type { EntryStatusFilter } from './my-entries-types';
import type { MyShowGroup } from './groupEntriesByShow';

export interface StatusFilterRow {
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
}

/**
 * Exhibitor-facing "your dog is in" predicate: a confirmed entry, including one
 * that has since been scored (COMPLETED) or has a pending move-up request.
 * Kept local to My Entries on purpose — the shared `isAcceptedEntry` stays
 * strict (ACCEPTED only) so secretary Entry Management's Accepted/Pending
 * buckets are unchanged.
 */
export function isExhibitorInEntry(e: { entryStatus: EntryStatus }): boolean {
  return (
    e.entryStatus === EntryStatus.ACCEPTED ||
    e.entryStatus === EntryStatus.COMPLETED ||
    e.entryStatus === EntryStatus.MOVE_UP_REQUESTED
  );
}

/** Does one row (an order, or a single class row) belong under this filter? */
export function matchesEntryStatusFilter(row: StatusFilterRow, status: EntryStatusFilter): boolean {
  switch (status) {
    case 'pending':
      return isPendingEntry(row);
    case 'accepted':
      return isExhibitorInEntry(row);
    case 'waitlist':
      return isWaitlistEntry(row);
    default:
      return true;
  }
}

/**
 * The status filter, applied a second time at DOG level. `useMyEntriesFilters`
 * keeps or drops whole orders by their dominant status, so an order holding a
 * pending dog and an accepted dog survives "Accepted" intact — and without
 * this pass the pending dog would render under Accepted and vanish under
 * Pending. A dog stays when any of its class rows matches; a show with no
 * matching dog is not rendered. Counts are untouched: they are still asked
 * about the same orders, in the hook.
 */
export function narrowDogsToStatus(
  groups: MyShowGroup[],
  selectedStatus: EntryStatusFilter
): MyShowGroup[] {
  if (selectedStatus === 'any') return groups;
  const narrowed: MyShowGroup[] = [];
  for (const group of groups) {
    const ordersById = new Map(group.orders.map(order => [order.id, order]));
    const dogs = group.dogs.filter(dog =>
      dog.classes.some(cls => {
        const order = ordersById.get(cls.orderId);
        return matchesEntryStatusFilter(
          {
            entryStatus: cls.entryStatus ?? dog.entryStatus,
            paymentStatus: cls.paymentStatus ?? order?.paymentStatus ?? PaymentStatus.PENDING,
          },
          selectedStatus
        );
      })
    );
    if (dogs.length > 0) narrowed.push({ ...group, dogs });
  }
  return narrowed;
}
