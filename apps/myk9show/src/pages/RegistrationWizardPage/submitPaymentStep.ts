/**
 * Payment-step submission orchestration for the registration wizard.
 *
 * This is the body of `handleNext` that runs once the user is on the payment
 * step with a live registration. It forks on payment method:
 *
 *  - `credit_card` → fill the cart and open Stripe (MYK9-1964). Card checkout
 *    is exhibitor-self-service ONLY; on-behalf modes are rejected here (the UI
 *    already hides the option — this guards loaded drafts and any other bypass).
 *  - everything else → submit through `submitShowRegistration`, surface armband
 *    failures, sync, and advance to the confirmation step.
 *
 * Extracted from the page so the orchestration is isolated from JSX. The submit
 * functions are imported (not injected) so existing module mocks still apply.
 */

import { notifications } from '@/lib/notifications';
import {
  entrySubmitErrorMessage,
  PlainEntryError,
  type EntrySubmitPath,
} from '@/features/registration/entrySubmitErrorCopy';
import { submitShowRegistration } from '@/features/registration/submitShowRegistration';
import {
  startWizardCardCheckout,
  submitRegistrationCartCheckout,
} from '@/features/registration/registrationCartCheckout';
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
import type { HandledDraftClass } from '@/hooks/pruneFiledDogsFromDraft';
import type {
  CartWithDetails,
  CheckoutResult,
  EnsureCartResult,
  NewCartItem,
} from '@/store/cartStore';
import { getEntrySubmitBlocker } from './entryCloseGuard';
import { fetchDeskFormDueCents, type DeskFormOutcome } from '@/features/registration/deskFormDue';
import { sendSubmittedEntryEmail, submittedEntryIdsToEmail } from './sendSubmittedEntryEmail';
import { targetsForTables } from '@/providers/showScopeTargets';
import type { UploadSyncTarget } from '@/providers/ringsideUploadSyncTargets';

/** Subset of the cart store actions the checkout handoff needs. */
export interface PaymentStepCartDeps {
  clearCart: () => Promise<boolean>;
  ensureCart: (showId: string, exhibitorId: string) => Promise<EnsureCartResult>;
  addItem: (item: NewCartItem) => Promise<boolean>;
  abandonCart: () => Promise<boolean>;
  /** MYK9-1964: what card checkout reads and runs once the cart is filled. */
  getCart: () => CartWithDetails | null;
  checkoutWithWaitlist: (
    exhibitorId: string,
    waitlistCartItemIds: Set<string>
  ) => Promise<CheckoutResult | null>;
  removeItem: (itemId: string) => Promise<boolean>;
}

/** Per-show fee inputs shared by both submission paths. */
export interface PaymentStepShowFeeInfo {
  preEntryFee: string;
  dayOfShowFee?: string | undefined;
  startDate: string;
  entryOpenDate?: string | undefined;
  entryCloseDate?: string | undefined;
  entryWindowTimezone?: string | undefined;
  juniorHandlerFee?: string | undefined;
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
  /** MYK9-879: dogs whose handler the exhibitor declared a junior (card checkout). */
  juniorHandlerDogIds: ReadonlySet<string>;
  currentStep: number;

  // Deps
  cart: PaymentStepCartDeps;
  submitRegistration: SubmitShowRegistrationParams['deps']['submitRegistration'];

  // Lifecycle / callbacks
  isMounted: () => boolean;
  setIsSubmitting: (value: boolean) => void;
  setRegistrationNumber: (value: string | undefined) => void;
  setArmbandAssignments: (value: ArmbandAssignment[]) => void;
  setEntryOutcomes: (value: EntrySubmissionOutcome[]) => void;
  setCreatedEntryOutcomes: (value: EntrySubmissionOutcome[]) => void;
  /** MYK9-2149: the Payment step confirmed the form held money before this submission. */
  deskFormHeldBeforeSubmit?: boolean | undefined;
  /** MYK9-2149: what a form that held money still owes after this submission. */
  setDeskFormOutcome?: ((value: DeskFormOutcome | null) => void) | undefined;
  markStepComplete: (stepIndex: number) => void;
  setCurrentStep: (updater: (prev: number) => number) => void;
  updateShowRegistration: (
    registrationId: string,
    updates: { status: ShowRegistration['status'] }
  ) => void;
  /** No targets: the provider's untargeted pass. Targets: upload, then pull those scopes. */
  triggerSync: (targets?: UploadSyncTarget[]) => void;
  /** Refresh the exhibitor's account-today-entries cache after their own online filing. */
  invalidateOwnTodayEntries: () => void;
  navigate: (path: string) => void;
  discardDraftsWithoutFinalSave: (handledClasses: HandledDraftClass[]) => void;
}

/**
 * MYK9-2149 (inform only): an entry was added to a form the Payment step confirmed held money.
 * Read what the form still owes now, so the receipt can say so and link to the entry form. A
 * failed read says it could not be read, never "covered". Only when an entry was created: a
 * submission that was all waitlisted or denied added nothing. Read-only.
 */
async function readDeskFormOutcome(
  ctx: SubmitPaymentStepContext,
  formId: string
): Promise<DeskFormOutcome | null> {
  // The form held money before submit, or the secretary used it: either way she is told the
  // balance, whatever this read finds.
  if (ctx.deskFormHeldBeforeSubmit !== true && ctx.paymentMethod !== 'form_money') return null;
  if (!ctx.ownerResolution.ok) return { formId, owedCents: null };
  try {
    const due = await fetchDeskFormDueCents(ctx.showId, ctx.ownerResolution.ownerId);
    return { formId, owedCents: Math.max(0, due) };
  } catch (error) {
    console.error('Reading what the entry form still owes failed:', error);
    return { formId, owedCents: null };
  }
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

/** Which fixed sentence a failure falls back to (MYK9-1823). */
function submitPath(ctx: SubmitPaymentStepContext): EntrySubmitPath {
  if (ctx.paymentMethod === 'credit_card') return 'cardCheckout';
  return ctx.currentWorkflowMode === 'exhibitor' ? 'exhibitorSubmit' : 'organizerSubmit';
}

/**
 * Resolves true only when the page is handing off to Stripe: the caller keeps
 * its in-flight latch held, because a second press while Stripe's page loads
 * would refill (and so retire) the cart that page is about to charge.
 */
export async function submitPaymentStep(ctx: SubmitPaymentStepContext): Promise<boolean> {
  ctx.setIsSubmitting(true);
  let leavingForStripe = false;
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
      throw new PlainEntryError(entryWindowBlocker);
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
        throw new PlainEntryError(
          'Online card checkout is only available when an exhibitor pays for their own entries. For on-behalf entries, record the payment as check, cash, or mark it as paid.'
        );
      }
      const handoff = await submitRegistrationCartCheckout({
        showId: ctx.showId,
        ownerResolution: ctx.ownerResolution,
        exhibitorProfileId: ctx.exhibitorProfileId,
        classSelections: ctx.classSelections,
        handlerAssignments: ctx.handlerAssignments,
        classes: ctx.classes,
        showFeeInfo: ctx.showFeeInfo,
        juniorHandlerDogIds: ctx.juniorHandlerDogIds,
        deps: {
          clearCart: ctx.cart.clearCart,
          ensureCart: ctx.cart.ensureCart,
          addItem: ctx.cart.addItem,
          abandonCart: ctx.cart.abandonCart,
          startCheckout: () =>
            startWizardCardCheckout({
              showId: ctx.showId,
              exhibitorProfileId: ctx.exhibitorProfileId,
              getCart: ctx.cart.getCart,
              checkoutWithWaitlist: ctx.cart.checkoutWithWaitlist,
              removeItem: ctx.cart.removeItem,
            }),
          navigate: path => ctx.navigate(path),
        },
      });
      if (handoff.kind === 'reviewOnCart') {
        // A global toast, shown over /cart, where the re-priced or reconciled
        // entry now is (the wizard is already navigating away).
        notifications.warning(handoff.message);
      }
      leavingForStripe = handoff.kind === 'redirecting';
      return leavingForStripe;
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
      ctx.setCreatedEntryOutcomes([]);
      ctx.discardDraftsWithoutFinalSave(
        handledClasses(ctx.classSelections, offlineResult.entryOutcomes)
      );
      ctx.setRegistrationNumber(buildOfflineLateEntryRegistrationNumber(offlineResult.entryIds));
      await ctx.cart.clearCart();
      // MYK9-1930: upload the entry and pull this show's entries back in the same pass. The
      // server gives the entry its form on that upload, and the untargeted pass never downloads
      // a show's entries, so without this the device keeps the formless copy.
      const { targets } = await targetsForTables(
        ctx.showId,
        new Set<UploadSyncTarget['name']>(['entries'])
      );
      ctx.triggerSync(targets);
      ctx.markStepComplete(ctx.currentStep);
      ctx.setCurrentStep(prev => prev + 1);
      return false;
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
    if (submissionResult.aborted) return false;
    const emailEntryIds = submittedEntryIdsToEmail(submissionResult);
    if (emailEntryIds.length > 0) {
      void sendSubmittedEntryEmail(
        submissionResult.dbRegistrationId,
        emailEntryIds,
        ctx.currentWorkflowMode
      );
    }
    if (ctx.currentWorkflowMode === 'exhibitor') ctx.invalidateOwnTodayEntries();
    ctx.setRegistrationNumber(submissionResult.registrationNumber);
    ctx.setDeskFormOutcome?.(
      (submissionResult.createdEntryOutcomes?.length ?? 0) > 0
        ? await readDeskFormOutcome(ctx, submissionResult.dbRegistrationId)
        : null
    );
    ctx.setEntryOutcomes(submissionResult.entryOutcomes ?? []);
    ctx.setCreatedEntryOutcomes(submissionResult.createdEntryOutcomes ?? []);
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
    return false;
  } catch (error) {
    // Roll back local registration status so retry starts from correct state
    ctx.updateShowRegistration(ctx.registrationId, { status: ctx.previousStatus });
    console.error('Registration payment submission failed:', error);
    if (ctx.isMounted()) {
      notifications.error(entrySubmitErrorMessage(error, submitPath(ctx)));
    }
    return false;
  } finally {
    if (ctx.isMounted() && !leavingForStripe) {
      ctx.setIsSubmitting(false);
    }
  }
}
