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
import { submitShowRegistration } from '@/features/registration/submitShowRegistration';
import { submitRegistrationCartCheckout } from '@/features/registration/registrationCartCheckout';
import { submitOfflineLateEntry } from '@/features/registration/submitOfflineLateEntry';
import type { SubmitShowRegistrationParams } from '@/features/registration/submitShowRegistration';
import type { SelectedDogsOwnerResult } from '@/features/registration/selectedDogsOwner';
import type { ArmbandAssignment } from '@/components/shows/RegistrationWorkflow/ConfirmationStep.types';
import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import type {
  ClassSelectionData,
  HandlerInfo,
  PaymentMethod,
  PaymentDetails,
  PaymentStatus,
  ShowRegistration,
} from '@/types/show-registration-types';
import type { EntrySubmissionOutcome } from '@/services/database/entries';
import type { CartWithDetails, NewCartItem } from '@/store/cartStore';
import { getEntrySubmitBlocker } from './entryCloseGuard';

/** Subset of the cart store actions the checkout handoff needs. */
export interface PaymentStepCartDeps {
  loadCart: (showId: string, exhibitorId: string) => Promise<CartWithDetails | null>;
  clearCart: () => Promise<boolean>;
  createCart: (showId: string, exhibitorId: string) => Promise<CartWithDetails | null>;
  addItem: (item: NewCartItem) => Promise<boolean>;
  abandonCart: () => Promise<boolean>;
}

/** Per-show fee inputs shared by both submission paths. */
export interface PaymentStepShowFeeInfo {
  preEntryFee: string;
  dayOfShowFee?: string | undefined;
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
  /** Full classes that accept a wait list — recorded as requests, never sold. */
  waitlistClassIds: ReadonlySet<string>;
  handlerAssignments: Record<string, HandlerInfo>;
  classes: SubmitShowRegistrationParams['classes'];
  canAssignArmbands: boolean;
  showFeeInfo: PaymentStepShowFeeInfo;
  currentStep: number;

  // Deps
  cart: PaymentStepCartDeps;
  submitRegistration: SubmitShowRegistrationParams['deps']['submitRegistration'];
  confirmRegistration: SubmitShowRegistrationParams['deps']['confirmRegistration'];

  // Lifecycle / callbacks
  isMounted: () => boolean;
  setIsSubmitting: (value: boolean) => void;
  setRegistrationNumber: (value: string | undefined) => void;
  setArmbandAssignments: (value: ArmbandAssignment[]) => void;
  setEntryOutcomes: (value: EntrySubmissionOutcome[]) => void;
  markStepComplete: (stepIndex: number) => void;
  setCurrentStep: (updater: (prev: number) => number) => void;
  updateShowRegistration: (
    registrationId: string,
    updates: { status: ShowRegistration['status'] }
  ) => void;
  triggerSync: () => void;
  navigate: (path: string) => void;
  discardDraftsWithoutFinalSave: () => void;
  clearDraftData: () => void;
}

function buildOfflineLateEntryRegistrationNumber(entryIds: string[]): string {
  const token = entryIds[0]
    ?.replace(/[^a-z0-9]/gi, '')
    .slice(0, 8)
    .toUpperCase();
  return token ? `LOCAL-${token}` : 'LOCAL-PENDING';
}

export async function submitPaymentStep(ctx: SubmitPaymentStepContext): Promise<void> {
  ctx.setIsSubmitting(true);
  try {
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
      // Wait-list requests must not reach the cart. Every cart line is billed
      // at full entry fee (registrationToCartItems.ts) and the cart has no
      // zero-price or request line type, so a wait-list class here would be
      // charged as if the spot were held. The payment step blocks this in the
      // UI (proceedGating.ts); this guards loaded drafts and any path that
      // bypasses it. Caught below → toast + flag reset.
      if (ctx.waitlistClassIds.size > 0) {
        const selectedWaitlisted = ctx.classSelections.some(selection =>
          selection.selectedClasses.some(cls => ctx.waitlistClassIds.has(cls.classId))
        );
        if (selectedWaitlisted) {
          throw new Error(
            'One or more of these classes is full, so those entries are wait list requests and cannot be paid for online yet. Choose another payment method, or remove them to pay by card.'
          );
        }
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
          loadCart: ctx.cart.loadCart,
          clearCart: ctx.cart.clearCart,
          createCart: ctx.cart.createCart,
          addItem: ctx.cart.addItem,
          abandonCart: ctx.cart.abandonCart,
          deleteDraft: async () => {
            ctx.discardDraftsWithoutFinalSave();
            ctx.clearDraftData();
          },
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
        paymentStatus: ctx.paymentStatus,
        paymentDetails: ctx.paymentDetails,
        showFeeInfo: ctx.showFeeInfo,
      });

      if (offlineResult.armbandAssignments.length > 0) {
        ctx.setArmbandAssignments(offlineResult.armbandAssignments);
      }
      ctx.setEntryOutcomes(offlineResult.entryOutcomes);
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
        confirmRegistration: ctx.confirmRegistration,
      },
    });
    if (submissionResult.aborted) return;
    ctx.setRegistrationNumber(submissionResult.registrationNumber);
    ctx.setEntryOutcomes(submissionResult.entryOutcomes ?? []);
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
