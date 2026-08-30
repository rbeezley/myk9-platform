/**
 * Pure gating logic for the registration wizard's Next button.
 *
 * `proceedBlockedReason` is the single source of truth for step advancement:
 * `null` means the step can proceed; a string is the plain-English reason
 * rendered next to the disabled Next button. INTENT: a greyed-out button must
 * say why — exhibitors should never be left guessing what the wizard wants.
 */

export interface ProceedGatingContext {
  stepId: string;
  selectedDogsCount: number;
  ownerSelectionOk: boolean;
  hasSelectedClasses: boolean;
  hasSeparateHandlerStep: boolean;
  entryCount: number;
  unassignedHandlerCount: number;
  totalFees: number;
  hasPaymentMethod: boolean;
  needsAgreement: boolean;
  agreedToEntryAgreement: boolean;
  capacityReady: boolean;
  blockedClassCount: number;
  /**
   * True when availability could not be read at all (offline, or the query
   * failed) rather than merely still loading. Separates "wait a moment" from
   * "we cannot check", which never resolves on its own.
   */
  capacityUnavailable: boolean;
  paymentMethod: string | null;
  /**
   * Selected classes that are full but accept a wait list. These are recorded
   * as requests, not sales, and the cart has no line type for them — see the
   * card-checkout gate below.
   */
  waitlistClassCount: number;
}

function handlerReason(count: number): string {
  return count === 1
    ? 'Assign a handler to the remaining entry to continue.'
    : `Assign a handler to each entry to continue (${count} remaining).`;
}

export function proceedBlockedReason(ctx: ProceedGatingContext): string | null {
  switch (ctx.stepId) {
    case 'dog-selection':
      if (ctx.selectedDogsCount === 0) return 'Select at least one dog to continue.';
      if (!ctx.ownerSelectionOk) {
        return 'All dogs in one registration must share the same owner. Remove the mismatched dogs or register them separately.';
      }
      return null;
    case 'class-selection':
      if (!ctx.hasSelectedClasses) return 'Select at least one class to continue.';
      if (!ctx.hasSeparateHandlerStep && ctx.unassignedHandlerCount > 0) {
        return handlerReason(ctx.unassignedHandlerCount);
      }
      return null;
    case 'handler-assignment':
      if (ctx.entryCount === 0) return 'Select at least one class to continue.';
      if (ctx.unassignedHandlerCount > 0) return handlerReason(ctx.unassignedHandlerCount);
      return null;
    case 'payment':
      if (ctx.capacityUnavailable) {
        return 'We could not check which classes still have room, so we cannot total this entry yet. Check your connection and try again.';
      }
      if (!ctx.capacityReady) {
        return 'Checking class availability. Please wait, then try again.';
      }
      if (ctx.blockedClassCount > 0) {
        return 'Remove the full class that does not accept a wait list to continue.';
      }
      // A wait-list request is recorded, never sold, and the cart has no line
      // type for a zero-price request — every cart item is charged at full fee
      // (registrationToCartItems.ts). Sending one through card checkout would
      // either bill for a spot the exhibitor does not have or, if filtered out,
      // drop the request silently. Both are worse than asking for another
      // payment method, so the card path is closed while one is selected.
      if (ctx.waitlistClassCount > 0 && ctx.paymentMethod === 'credit_card') {
        return ctx.waitlistClassCount === 1
          ? 'One of these classes is full, so that entry is a wait list request and cannot be paid for online yet. Choose another payment method, or remove it to pay by card.'
          : `${ctx.waitlistClassCount} of these classes are full, so those entries are wait list requests and cannot be paid for online yet. Choose another payment method, or remove them to pay by card.`;
      }
      if (ctx.totalFees > 0 && !ctx.hasPaymentMethod) {
        return 'Choose a payment method to continue.';
      }
      if (ctx.needsAgreement && !ctx.agreedToEntryAgreement) {
        return 'Please review and agree to the entry agreement to continue.';
      }
      return null;
    case 'confirmation':
      return null;
    default:
      return 'This step is not ready to continue yet.';
  }
}
