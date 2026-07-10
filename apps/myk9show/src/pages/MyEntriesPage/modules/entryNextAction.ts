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
import type { MyEntry } from './my-entries-types';

export type EntryNextAction =
  { kind: 'finish-payment' } | { kind: 'check-in'; classId: string } | { kind: 'view-show' };

export interface DeriveEntryNextActionOptions {
  /** Current time, injectable for tests; defaults to `new Date()`. */
  now?: Date;
  /** Resolved self-check-in cascade by class id, same shape `MyEntryCard` receives. */
  selfCheckinByClassId?: Record<string, boolean>;
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

  // Same gate MyEntryCard uses before consulting getEntryPaymentPrompt: a
  // move-up request can still owe its fee though it isn't editable; waitlisted
  // entries pay on promotion and stay out.
  const hasEditableStatus =
    entry.entryStatus === EntryStatus.PENDING || entry.entryStatus === EntryStatus.ACCEPTED;
  const canPayStatus = hasEditableStatus || entry.entryStatus === EntryStatus.MOVE_UP_REQUESTED;
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

  // Check-in is only a live next action for a non-past show; a past entry has
  // nothing to check in for regardless of the class's scored/self-check-in
  // state.
  if (!isPastShowEntry(entry, now)) {
    const eligibleClass = entry.classes.find(cls => {
      if (cls.isScored) return false;
      // Same cascade MyEntryCard reads: class-scoped toggle, defaulting open
      // when the class id or map entry is missing.
      if (!cls.classId) return true;
      return selfCheckinByClassId[cls.classId] ?? true;
    });

    if (eligibleClass) {
      return { kind: 'check-in', classId: eligibleClass.id };
    }
  }

  return { kind: 'view-show' };
}
