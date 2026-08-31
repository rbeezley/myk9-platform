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
  /**
   * An agreement may apply but the query FAILED, so we do not know whether one
   * is required. Distinct from "resolved to no row", which means this
   * organization simply has no agreement and nothing should block.
   */
  agreementUnavailable: boolean;
  /** An agreement may apply and is still fetching — the checkbox is a skeleton. */
  agreementLoadingNow: boolean;
  agreedToEntryAgreement: boolean;
  capacityReady: boolean;
  blockedClassCount: number;
  /**
   * True when availability could not be read at all (offline, or the query
   * failed) rather than merely still loading. Separates "wait a moment" from
   * "we cannot check", which never resolves on its own.
   */
  capacityUnavailable: boolean;
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
        return 'We could not confirm which classes still have room, so we cannot total this entry yet. Check your connection and try again, or go back and re-pick the classes.';
      }
      if (!ctx.capacityReady) {
        return 'Checking class availability. Please wait, then try again.';
      }
      if (ctx.blockedClassCount > 0) {
        return 'Remove the full class that does not accept a wait list to continue.';
      }
      if (ctx.totalFees > 0 && !ctx.hasPaymentMethod) {
        return 'Choose a payment method to continue.';
      }
      if (ctx.agreementUnavailable) {
        // Never waived — entering a show requires agreeing to the organization's
        // terms. But say what is actually wrong, and point at the retry that is
        // now rendered in place of the checkbox.
        return 'We could not load the entry agreement, so we cannot take this entry yet. Check your connection, then use the retry button in the message above.';
      }
      if (ctx.agreementLoadingNow) {
        return 'Loading the entry agreement. It will appear here in a moment.';
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
