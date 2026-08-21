/**
 * Pure derivation of the single primary "next action" for an entry card
 * summary band (exhibitor-my-shows-legibility progressive disclosure).
 *
 * Precedence: finish payment > check-in (first check-in-eligible class) >
 * view show. Reuses the exact predicates `MyEntryCard` already uses to decide
 * payment-button visibility (`getEntryPaymentPrompt` via the same
 * `canPayStatus` gate) and check-in control rendering (the canonical entry-
 * accounting rules gated by the self-check-in cascade) so the summary-band
 * action never disagrees with the expanded details.
 *
 * @module MyEntriesPage/modules/entryNextAction
 */

import { isAccountedFor, isExpectedEntry } from '@/features/_shared/entryAccounting';
import { EntryStatus } from '@/types/show-registration-types';
import { getOrderOnlinePrompt } from './myEntryOrderBalance';
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

// Must match isCurrentSummaryEntry's entryStatus set (entryBalanceSummary.ts)
// — that selector is what My Shows totals and My Payments derive amount-due
// from, so a COMPLETED-but-unpaid class (scored mid-show, fee still owed)
// must stay payment-eligible here too, or the dashboard reports money due
// that no card ever offers a way to pay.
function isPaymentEligibleStatus(status: EntryStatus): boolean {
  return (
    status === EntryStatus.PENDING ||
    status === EntryStatus.ACCEPTED ||
    status === EntryStatus.MOVE_UP_REQUESTED ||
    status === EntryStatus.COMPLETED
  );
}

/**
 * Whether ANY class row on this order can still owe money — never the order's
 * own dominant `entryStatus`. A registration can contain several dogs/classes,
 * and its display status may be COMPLETED because one sibling has a result
 * while another accepted or pending row still owes an online or pay-at-show
 * balance, so payment eligibility must be derived below the order summary.
 * Shared by `deriveEntryNextAction` and `MyEntryCard` so the summary-band
 * action and the card's payment prompts never disagree about eligibility.
 */
export function hasPaymentEligibleClass(entry: MyEntry): boolean {
  return entry.classes.length > 0
    ? entry.classes.some(cls => {
        const owningDog = findOwningDog(entry, cls.id);
        return isPaymentEligibleStatus(
          cls.entryStatus ?? owningDog?.entryStatus ?? entry.entryStatus
        );
      })
    : isPaymentEligibleStatus(entry.entryStatus);
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

  const canPayStatus = hasPaymentEligibleClass(entry);
  // Same row-level order balance the card renders from — the summary-band
  // action can never disagree with the amount shown (exhibitor-money-clarity).
  const paymentPrompt = canPayStatus ? getOrderOnlinePrompt(entry) : ({ kind: 'none' } as const);

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
      if (
        cls.unresolved ||
        !isExpectedEntry(cls) ||
        isAccountedFor(cls) ||
        cls.entryStatusKind === 'completed' ||
        cls.status !== 'entered'
      ) {
        return false;
      }

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
