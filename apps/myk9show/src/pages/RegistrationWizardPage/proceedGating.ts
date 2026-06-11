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
