/**
 * Payment-step submission orchestration for the registration wizard.
 *
 * This is the body of `handleNext` that runs once the user is on the payment
 * step with a live registration. It forks on payment method:
 *
 *  - `credit_card` → hand off to the Stripe-backed cart checkout. Card checkout
 *    is exhibitor-self-service ONLY; on-behalf modes are rejected here (the UI
 *    already hides the option — this guards loaded drafts and any other bypass).
 *  - everything else → submit through `submitShowRegistration`, surface armband
 *    failures, sync, and advance to the confirmation step.
 *
 * Extracted from the page so the orchestration is isolated from JSX. The submit
 * functions are imported (not injected) so existing module mocks still apply.
 */

import { getErrorMessage } from '@myk9/core';
import { notifications } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { submitShowRegistration } from '@/features/registration/submitShowRegistration';
import { submitRegistrationCartCheckout } from '@/features/registration/registrationCartCheckout';
import { submitOfflineLateEntry } from '@/features/registration/submitOfflineLateEntry';
import type { SubmitShowRegistrationParams } from '@/features/registration/submitShowRegistration';
import type { SelectedDogsOwnerResult } from '@/features/registration/selectedDogsOwner';
import type { ArmbandAssignment } from '@/components/shows/RegistrationWorkflow/ConfirmationStep.types';
import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import { PaymentStatus } from '@/types/show-registration-types';
import { makeHandlerKey } from '@/types/show-registration-types';
import type {
  ClassSelectionData,
  HandlerInfo,
  PaymentMethod,
  PaymentDetails,
  ShowRegistration,
} from '@/types/show-registration-types';
import type { EntrySubmissionOutcome } from '@/services/database/entries';
import type { HandledDraftClass } from '@/hooks/pruneFiledDogsFromDraft';
import type { EnsureCartResult, NewCartItem } from '@/store/cartStore';
import { getEntrySubmitBlocker } from './entryCloseGuard';

/** Subset of the cart store actions the checkout handoff needs. */
export interface PaymentStepCartDeps {
  clearCart: () => Promise<boolean>;
  ensureCart: (showId: string, exhibitorId: string) => Promise<EnsureCartResult>;
  addItem: (item: NewCartItem) => Promise<boolean>;
  abandonCart: () => Promise<boolean>;
}

/** Per-show fee inputs shared by both submission paths. */
export interface PaymentStepShowFeeInfo {
  preEntryFee: string;
  dayOfShowFee?: string | undefined;
  juniorHandlerFee?: string | undefined;
  juniorFeeKnown?: boolean | undefined;
  startDate: string;
  entryOpenDate?: string | undefined;
  entryCloseDate?: string | undefined;
  entryWindowTimezone?: string | undefined;
}

export interface SubmitPaymentStepContext {
  // Identity / submission inputs
  showId: string;
  userId: string;
  registrationId: string;
  /** The registration's status before submission, restored on failure. */
  previousStatus: ShowRegistration['status'];
  isLateEntryMode: boolean;
  currentWorkflowMode: WorkflowMode;
  paymentMethod: PaymentMethod | undefined;
  paymentStatus: PaymentStatus;
  paymentDetails: PaymentDetails;
  ownerResolution: SelectedDogsOwnerResult;
  exhibitorProfileId: string;
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  classes: SubmitShowRegistrationParams['classes'];
  canAssignArmbands: boolean;
  showFeeInfo: PaymentStepShowFeeInfo;
  currentStep: number;

  // Deps
  cart: PaymentStepCartDeps;
  submitRegistration: SubmitShowRegistrationParams['deps']['submitRegistration'];
  quoteStaffJuniorFee?: (
    entries: {
      dog_id: string;
      class_id: string;
      handler_id: string | null;
      handler_name: string | null;
    }[]
  ) => Promise<boolean>;

  // Lifecycle / callbacks
  isMounted: () => boolean;
  setIsSubmitting: (value: boolean) => void;
  setRegistrationNumber: (value: string | undefined) => void;
  setArmbandAssignments: (value: ArmbandAssignment[]) => void;
  setEntryOutcomes: (value: EntrySubmissionOutcome[]) => void;
  setPaymentStatus?: ((value: PaymentStatus) => void) | undefined;
  markStepComplete: (stepIndex: number) => void;
  setCurrentStep: (updater: (prev: number) => number) => void;
  updateShowRegistration: (
    registrationId: string,
    updates: { status: ShowRegistration['status'] }
  ) => void;
  triggerSync: () => void;
  navigate: (path: string) => void;
  discardDraftsWithoutFinalSave: (handledClasses: HandledDraftClass[]) => void;
}

function buildOfflineLateEntryRegistrationNumber(entryIds: string[]): string {
  const token = entryIds[0]
    ?.replace(/[^a-z0-9]/gi, '')
    .slice(0, 8)
    .toUpperCase();
  return token ? `LOCAL-${token}` : 'LOCAL-PENDING';
}

function handledClasses(
  selections: ClassSelectionData[],
  outcomes?: EntrySubmissionOutcome[]
): HandledDraftClass[] {
  if (outcomes) {
    // Outcomes do not include trialId. If the same dog/class pair was filed
    // in one trial and denied in another, keep both local lines for recovery.
    const deniedPairs = new Set(
      outcomes
        .filter(outcome => outcome.outcome === 'denied')
        .map(({ dogId, classId }) => `${dogId}|${classId}`)
    );
    return outcomes
      .filter(outcome => outcome.outcome !== 'denied')
      .filter(({ dogId, classId }) => !deniedPairs.has(`${dogId}|${classId}`))
      .map(({ dogId, classId }) => ({ dogId, classId }));
  }
  return selections.flatMap(selection =>
    selection.selectedClasses.map(({ classId }) => ({ dogId: selection.dogId, classId }))
  );
}

async function staffSubmissionNeedsJuniorFee(ctx: SubmitPaymentStepContext): Promise<boolean> {
  const configured = Number(ctx.showFeeInfo.juniorHandlerFee) > 0;
  const unknownOffline = ctx.isLateEntryMode && ctx.showFeeInfo.juniorFeeKnown === false;
  if (!configured && !unknownOffline) return false;
  const entries = ctx.classSelections.flatMap(selection =>
    selection.selectedClasses.map(selectedClass => {
      const handler =
        ctx.handlerAssignments[makeHandlerKey(selection.dogId, selectedClass.classId)];
      return {
        dog_id: selection.dogId,
        class_id: selectedClass.classId,
        handler_id: handler?.handlerId || null,
        handler_name: handler?.handlerName || null,
      };
    })
  );
  if (entries.length === 0) return false;
  // A typed, unmatched handler has unknown age and cannot receive a junior rate.
  const couldBeJunior = entries.some(entry => entry.handler_id || !entry.handler_name);
  if (!couldBeJunior) return false;
  if (unknownOffline) return true;
  try {
    if (ctx.quoteStaffJuniorFee) return await ctx.quoteStaffJuniorFee(entries);
    const { data, error } = await supabase.rpc('staff_entries_need_junior_fee', {
      p_show_id: ctx.showId,
      p_entries: entries,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    // When the desk cannot reach the private age check, save as unpaid rather
    // than recording an adult amount that could be wrong after sync.
    console.error('Could not verify staff junior fee before collecting payment:', error);
    return true;
  }
}

export async function submitPaymentStep(ctx: SubmitPaymentStepContext): Promise<void> {
  ctx.setIsSubmitting(true);
  try {
    const deferJuniorPayment =
      ctx.currentWorkflowMode !== 'exhibitor' &&
      ctx.paymentMethod !== 'waived' &&
      (await staffSubmissionNeedsJuniorFee(ctx));
    if (
      deferJuniorPayment &&
      (ctx.paymentMethod === 'secretary_paid' || ctx.paymentMethod === 'group_payment')
    ) {
      throw new Error(
        'Save this entry unpaid first. The confirmed junior fee will appear on the receipt; record cash or check in Entries Management afterward.'
      );
    }
    if (deferJuniorPayment && ctx.paymentStatus !== PaymentStatus.PENDING) {
      ctx.setPaymentStatus?.(PaymentStatus.PENDING);
    }
    const entryWindowBlocker = getEntrySubmitBlocker({
      startDate: ctx.showFeeInfo.startDate,
      entryOpenDate: ctx.showFeeInfo.entryOpenDate,
      entryCloseDate: ctx.showFeeInfo.entryCloseDate,
      entryWindowTimezone: ctx.showFeeInfo.entryWindowTimezone,
      isLateEntryMode: ctx.isLateEntryMode,
      workflowMode: ctx.currentWorkflowMode,
    });
    if (entryWindowBlocker) {
      throw new Error(entryWindowBlocker);
    }

    if (ctx.paymentMethod === 'credit_card') {
      // Card checkout is exhibitor-self-service only. Stripe-hosted checkout
      // runs under the logged-in user's account and stripe-checkout 403s any
      // cart that user doesn't own, so an organizer paying on behalf of an
      // exhibitor can't go through card checkout — and exhibitorProfileId here
      // is the ORGANIZER's profile, not the selected dogs' owner. The UI hides
      // the card option for these modes; this guards loaded drafts and any
      // other path that bypasses it. Caught below → toast + flag reset.
      if (ctx.currentWorkflowMode !== 'exhibitor') {
        throw new Error(
          'Online card checkout is only available when an exhibitor pays for their own entries. For on-behalf entries, record the payment as check, cash, or mark it as paid.'
        );
      }
      await submitRegistrationCartCheckout({
        showId: ctx.showId,
        ownerResolution: ctx.ownerResolution,
        exhibitorProfileId: ctx.exhibitorProfileId,
        classSelections: ctx.classSelections,
        handlerAssignments: ctx.handlerAssignments,
        classes: ctx.classes,
        showFeeInfo: ctx.showFeeInfo,
        deps: {
          clearCart: ctx.cart.clearCart,
          ensureCart: ctx.cart.ensureCart,
          addItem: ctx.cart.addItem,
          abandonCart: ctx.cart.abandonCart,
          navigate: path => ctx.navigate(path),
        },
      });
      return;
    }

    if (ctx.isLateEntryMode && ctx.currentWorkflowMode !== 'exhibitor') {
      const offlineResult = await submitOfflineLateEntry({
        showId: ctx.showId,
        classSelections: ctx.classSelections,
        handlerAssignments: ctx.handlerAssignments,
        classes: ctx.classes,
        paymentMethod: ctx.paymentMethod,
        paymentStatus: deferJuniorPayment ? PaymentStatus.PENDING : ctx.paymentStatus,
        paymentDetails: ctx.paymentDetails,
        showFeeInfo: ctx.showFeeInfo,
        feePending: deferJuniorPayment,
      });

      if (offlineResult.armbandAssignments.length > 0) {
        ctx.setArmbandAssignments(offlineResult.armbandAssignments);
      }
      ctx.setEntryOutcomes(offlineResult.entryOutcomes);
      ctx.discardDraftsWithoutFinalSave(
        handledClasses(ctx.classSelections, offlineResult.entryOutcomes)
      );
      ctx.setRegistrationNumber(buildOfflineLateEntryRegistrationNumber(offlineResult.entryIds));
      await ctx.cart.clearCart();
      ctx.triggerSync();
      ctx.markStepComplete(ctx.currentStep);
      ctx.setCurrentStep(prev => prev + 1);
      return;
    }

    // Update local Zustand state to reflect submission in progress
    const submissionResult = await submitShowRegistration({
      showId: ctx.showId,
      userId: ctx.userId,
      registrationId: ctx.registrationId,
      ownerResolution: ctx.ownerResolution,
      paymentMethod: ctx.paymentMethod,
      paymentDetails: ctx.paymentDetails,
      classSelections: ctx.classSelections,
      handlerAssignments: ctx.handlerAssignments,
      classes: ctx.classes,
      canAssignArmbands: ctx.canAssignArmbands,
      showFeeInfo: ctx.showFeeInfo,
      submissionSource: ctx.currentWorkflowMode === 'exhibitor' ? 'self_service' : 'organizer',
      isActive: () => ctx.isMounted(),
      deps: {
        submitRegistration: ctx.submitRegistration,
      },
    });
    if (submissionResult.aborted) return;
    ctx.setRegistrationNumber(submissionResult.registrationNumber);
    ctx.setEntryOutcomes(submissionResult.entryOutcomes ?? []);
    ctx.discardDraftsWithoutFinalSave(
      handledClasses(ctx.classSelections, submissionResult.entryOutcomes)
    );
    if (submissionResult.armbandAssignments.length > 0) {
      ctx.setArmbandAssignments(submissionResult.armbandAssignments);
    }
    if (submissionResult.armbandFailures.length > 0) {
      // Entries are submitted; only the armband writes failed. Warn loudly
      // so the secretary assigns these manually instead of discovering
      // missing ring numbers on show day. The wizard auto-advances to the
      // confirmation step, so the toast must persist until dismissed.
      const count = submissionResult.armbandFailures.length;
      notifications.error(
        `Entries submitted, but armband assignment failed for ${count} dog${count === 1 ? '' : 's'}. Assign armbands manually from Entries Management.`,
        { duration: Infinity, action: { label: 'Dismiss', onClick: () => {} } }
      );
    }
    await ctx.cart.clearCart();
    ctx.triggerSync();
    ctx.markStepComplete(ctx.currentStep);
    ctx.setCurrentStep(prev => prev + 1);
    return;
  } catch (error) {
    // Roll back local registration status so retry starts from correct state
    ctx.updateShowRegistration(ctx.registrationId, { status: ctx.previousStatus });
    console.error('Registration payment submission failed:', error);
    if (ctx.isMounted()) {
      notifications.error(getErrorMessage(error));
    }
  } finally {
    if (ctx.isMounted()) {
      ctx.setIsSubmitting(false);
    }
  }
}
