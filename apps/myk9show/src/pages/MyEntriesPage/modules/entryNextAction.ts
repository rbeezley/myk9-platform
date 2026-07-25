/**
 * Pure derivation of the single primary "next action" for an entry card
 * summary band (exhibitor-my-shows-legibility progressive disclosure).
 *
 * Precedence: finish payment > check-in (first check-in-eligible class) >
 * view show. Reuses the exact predicates `MyEntryCard` already uses to decide
 * payment-button visibility (`getEntryPaymentPrompt` via the same
 * `canPayStatus` gate) and check-in control rendering (`!cls.isScored` gated
 * by the self-check-in cascade) so the summary-band action never disagrees
 * with the expanded details.
 *
 * @module MyEntriesPage/modules/entryNextAction
 */

import { EntryStatus } from '@/types/show-registration-types';
import { getEntryPaymentPrompt } from '@/features/payments/entryPaymentPrompt';
import { isPastShowEntry } from './myEntriesStats.helpers';
import { findOwningDog } from './myEntryDogView';
import type { MyEntry } from './my-entries-types';

export type EntryNextAction =
  { kind: 'finish-payment' } | { kind: 'check-in'; classId: string } | { kind: 'view-show' };

export interface DeriveEntryNextActionOptions {
  /** Current time, injectable for tests; defaults to `new Date()`. */
  now?: Date;
  /** Resolved self-check-in cascade by class id, same shape `MyEntryCard` receives. */
  selfCheckinByClassId?: Record<string, boolean>;
}

function isPaymentEligibleStatus(status: EntryStatus): boolean {
  return (
    status === EntryStatus.PENDING ||
    status === EntryStatus.ACCEPTED ||
    status === EntryStatus.MOVE_UP_REQUESTED
  );
}

/**
 * Derive the single primary action for an entry's summary band.
 */
export function deriveEntryNextAction(
  entry: MyEntry,
  options: DeriveEntryNextActionOptions = {}
): EntryNextAction {
  const now = options.now ?? new Date();
  const selfCheckinByClassId = options.selfCheckinByClassId ?? {};

  // A registration can contain several dogs/classes. Its display status may
  // be COMPLETED because one sibling has a result while another accepted or
  // pending row still owes an online balance, so payment eligibility must be
  // derived below the order summary.
  const canPayStatus =
    entry.classes.length > 0
      ? entry.classes.some(cls => {
          const owningDog = findOwningDog(entry, cls.id);
          return isPaymentEligibleStatus(
            cls.entryStatus ?? owningDog?.entryStatus ?? entry.entryStatus
          );
        })
      : isPaymentEligibleStatus(entry.entryStatus);
  const paymentPrompt = canPayStatus
    ? getEntryPaymentPrompt({
        paymentMethod: entry.paymentMethod,
        paymentStatus: entry.paymentStatus,
        totalFee: entry.totalFee,
      })
    : ({ kind: 'none' } as const);

  if (paymentPrompt.kind === 'finish-online') {
    return { kind: 'finish-payment' };
  }

  // Check-in is only a live next action for an accepted class row at a
  // non-past show. Dog and order statuses are display summaries: COMPLETED can
  // dominate ACCEPTED when a sibling class already has a result, so use the
  // row status when available and retain the dog/order fallback for legacy
  // fixtures or partially replicated rows.
  if (!isPastShowEntry(entry, now)) {
    const eligibleClass = entry.classes.find(cls => {
      if (cls.isScored || cls.status !== 'entered') return false;

      const owningDog = findOwningDog(entry, cls.id);
      const classEntryStatus = cls.entryStatus ?? owningDog?.entryStatus ?? entry.entryStatus;
      if (classEntryStatus !== EntryStatus.ACCEPTED) return false;

      // Same cascade MyEntryCard reads: class-scoped toggle, defaulting open
      // when the class id or map entry is missing.
      if (!cls.classId) return true;
      return selfCheckinByClassId[cls.classId] ?? true;
    });

    if (eligibleClass) return { kind: 'check-in', classId: eligibleClass.id };
  }

  return { kind: 'view-show' };
}
