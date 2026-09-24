/**
 * useRegistrationWizardState — all state, refs, stores, derived values, and the
 * effects that don't depend on the action handlers.
 *
 * This is the data half of the wizard. `createWizardHandlers` (sibling) is the
 * behavior half: it receives this hook's return value and closes over the
 * setters/refs here. `useRegistrationWizard` composes the two. Splitting along
 * the state/behavior seam keeps each file well under the 500-line ceiling
 * without threading a hand-written deps interface — the handlers type against
 * `ReturnType<typeof useRegistrationWizardState>`.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useMatch, useSearchParams } from 'react-router-dom';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import {
  ClassSelectionData,
  RegistrationFormData,
  HandlerInfo,
  PaymentStatus,
  EntryStatus,
  makeHandlerKey,
} from '@/types/show-registration-types';
import type { PaymentMethod, PaymentDetails } from '@/types/show-registration-types';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useCartStore } from '@/store/cartStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { calculateTotalFees } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import { useDraftPersistence } from '@/hooks/useDraftPersistence';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import type {
  WorkflowMode,
  StepId,
} from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import type { ArmbandAssignment } from '@/components/shows/RegistrationWorkflow/ConfirmationStep.types';
import type { EntrySubmissionOutcome } from '@/services/database/entries';
import {
  WORKFLOW_CONFIGS,
  ALL_STEP_DEFINITIONS,
} from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.constants';
import {
  selectedDogsOwner,
  type SelectedDogsOwnerResult,
} from '@/features/registration/selectedDogsOwner';
import { resolveWizardTitles } from './wizardTitles';
import { isShowDeskLateEntryMode, resolveRegistrationExit } from '../RegistrationWizardPage.routes';
import { proceedBlockedReason } from './proceedGating';
import { buildDraftFormData } from './buildDraftFormData';
import { autoAssignHandlers } from './autoAssignHandlers';
import { useEntryCloseAvailability } from './useEntryCloseAvailability';
import { useEntryWindowTimezone } from '@/hooks/useEntryWindowTimezone';
import { useClassAvailability } from '@/hooks/useClassAvailability';
import { useOrganizationAgreement } from '@/hooks/queries/useOrganizationAgreement';
import { getRegistrationCapacityState } from './registrationCapacity';

// Exhibitor self-service defaults to online card payment; on-behalf modes
// (secretary/admin/club) can't use card checkout, so they start unset and must
// choose explicitly. Shared by the initial state and the mode-change reset.
export const defaultPaymentForMode = (mode: WorkflowMode): PaymentMethod | undefined =>
  mode === 'exhibitor' ? 'credit_card' : mode === 'secretary_new' ? 'secretary_paid' : undefined;

/**
 * URL late-entry hints only describe an organizer's workflow when paired with
 * a non-exhibitor role. Exhibitors can append the same params themselves.
 */
export function isOrganizerLateEntryMode(
  workflowMode: WorkflowMode,
  isLateEntryMode: boolean
): boolean {
  return workflowMode !== 'exhibitor' && isLateEntryMode;
}

export function shouldEnableRegistrationCapacityCheck(
  workflowMode: WorkflowMode,
  isLateEntryMode: boolean
): boolean {
  return workflowMode === 'exhibitor' && !isOrganizerLateEntryMode(workflowMode, isLateEntryMode);
}

interface RegistrationCapacityGateInput {
  enabled: boolean;
  isLoading: boolean;
  error: string | null;
  unknownClassCount: number;
}

export function resolveRegistrationCapacityGate({
  enabled,
  isLoading,
  error,
  unknownClassCount,
}: RegistrationCapacityGateInput): {
  capacityReady: boolean;
  capacityUnavailable: boolean;
} {
  if (!enabled) {
    return { capacityReady: true, capacityUnavailable: false };
  }

  return {
    capacityReady: !isLoading && !error && unknownClassCount === 0,
    capacityUnavailable: !isLoading && (!!error || unknownClassCount > 0),
  };
}

export function useRegistrationWizardState() {
  const { showId: showIdParam } = useParams<{ showId: string }>();
  // showId is guaranteed by the outer RegistrationWizardPage guard
  const showId = showIdParam!;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isInsideSidebar = !!useMatch('/secretary/*');
  const isLateEntryMode = isShowDeskLateEntryMode(searchParams);
  // Pure + pinned by wizardTitles.test.ts; the vocabulary standard
  // (docs/reference/ui-vocabulary.md) rests on these strings and the e2e
  // assertions that also cover them only run against staging.
  const { workflowLabel, sidebarTitle, workflowSubtitle } = resolveWizardTitles({
    isLateEntryMode,
    isInsideSidebar,
  });
  const exitTarget = resolveRegistrationExit(showId, { isLateEntryMode, isInsideSidebar });

  // Auth and permissions
  const { isSecretary, isClubAdmin, isSiteAdmin, canAssignArmbands } = useRegistrationPermissions();
  const { user } = useAuthContext();
  const {
    profile: exhibitorProfile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchExhibitorProfile,
  } = useExhibitorProfile();
  const { triggerSync } = useReplicationSync();

  // Trigger a sync on mount so any pending local mutations are uploaded
  // before the user interacts with the cart (which requires server-side records).
  const hasSynced = useRef(false);
  useEffect(() => {
    if (!hasSynced.current) {
      hasSynced.current = true;
      triggerSync();
    }
  }, [triggerSync]);

  // INTENT: Re-set mountedRef to true on each mount so React StrictMode's
  // double-invocation of effects in dev (mount → cleanup → mount) doesn't
  // leave the ref permanently false. Without the explicit `= true`, the
  // first cleanup runs and any later async await chain bails out via the
  // `if (!mountedRef.current) return;` guards even though the component
  // is still mounted.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Data stores
  const {
    dogs,
    isLoading: dogsLoading,
    isReady: dogsReady,
    rosterError: dogsError,
    refetch: refetchDogs,
  } = useDogStoreCompat();
  const { shows = [] } = useShowStore();
  const { classes = [] } = useClassStoreCompat();
  const clearCart = useCartStore(state => state.clearCart);
  const ensureCart = useCartStore(state => state.ensureCart);
  const addItem = useCartStore(state => state.addItem);
  const abandonCart = useCartStore(state => state.abandonCart);
  const currentShow = useMemo(() => shows.find(s => s.id === showId), [shows, showId]);
  // The show store carries no trials (`StoreShow`, MYK9-676); the zone comes
  // from the trial store (MYK9-642 J-F1).
  // `isReady` is the second half (L-F1): mid-hydration the hook still answers,
  // with that same fallback, and this wizard can mount straight onto Payment
  // with a Submit button (see useWizardDraftRehydration). An unresolved zone is
  // its own state, never Eastern.
  const entryWindowTimezoneState = useEntryWindowTimezone(showId);
  const {
    timeZone: entryWindowTimezone,
    isReady: entryWindowTimezoneReady,
    isUnavailable: entryWindowTimezoneUnavailable,
  } = entryWindowTimezoneState;

  // Derived from role flags, not RegistrationContext.mode — that value defaults
  // to 'exhibitor' while RBAC loads, which would hide the secretary search UI.
  const currentWorkflowMode: WorkflowMode = useMemo(() => {
    if (!isInsideSidebar) return 'exhibitor';
    if (isSiteAdmin) return 'site_admin';
    if (isClubAdmin) return 'club_admin';
    if (isSecretary) return 'secretary_new';
    return 'exhibitor';
  }, [isInsideSidebar, isSiteAdmin, isClubAdmin, isSecretary]);

  const currentWorkflowConfig = WORKFLOW_CONFIGS[currentWorkflowMode];

  // Exhibitor review must not present a client-guessed amount as final. Staff
  // and late-entry flows use their server/offline submission paths directly;
  // the online exhibitor flow shares this availability source with class
  // selection and blocks while it is unresolved.
  const capacityCheckEnabled = shouldEnableRegistrationCapacityCheck(
    currentWorkflowMode,
    isLateEntryMode
  );
  const {
    classes: availabilityClasses,
    isLoading: capacityLoading,
    error: capacityError,
    refetch: refetchClassAvailability,
  } = useClassAvailability(showId, { enabled: capacityCheckEnabled });
  const exposedCapacityError = capacityCheckEnabled ? capacityError : null;

  // Reset step state when workflow mode changes mid-session (e.g. role change)
  // to prevent stale completions from a previous mode allowing skipping payment.
  const prevWorkflowMode = useRef(currentWorkflowMode);
  useEffect(() => {
    if (prevWorkflowMode.current !== currentWorkflowMode) {
      prevWorkflowMode.current = currentWorkflowMode;
      setStepCompletionState({});
      setCurrentStep(0);
      // Re-apply the per-mode payment default. RBAC resolves async, so the mode
      // can start as 'exhibitor' (card default) and flip to an on-behalf mode
      // once permissions load — clear the card default there since on-behalf
      // flows can't use card checkout and would otherwise hit the guard in
      // handleNext. Restore it if the mode flips back to exhibitor.
      setRegistrationData(prev => ({
        ...prev,
        paymentMethod: defaultPaymentForMode(currentWorkflowMode),
      }));
    }
  }, [currentWorkflowMode]);

  // Build steps for HorizontalProgressIndicator
  const steps = useMemo(() => {
    return currentWorkflowConfig.steps.map((stepId, index) => ({
      ...ALL_STEP_DEFINITIONS[stepId],
      id: index,
      completed: false,
    }));
  }, [currentWorkflowConfig.steps]);

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [stepCompletionState, setStepCompletionState] = useState<Record<string, boolean>>({});
  const [registrationData, setRegistrationData] = useState<RegistrationFormData>({
    selectedDogs: [],
    entries: [],
    documents: [],
    // INTENT: Default exhibitor self-service to online card payment so most
    // exhibitors can pay instantly without touching the radio; they only switch
    // if they intend to pay by check/cash (and only when the show offers those).
    paymentMethod: defaultPaymentForMode(currentWorkflowMode),
    specialRequests: undefined,
  });

  // Scroll the wizard back to the top on every step change. Steps differ a lot
  // in height, so otherwise the prior scroll offset carries over and a tall step
  // (the payment step in particular) opens scrolled past its first controls —
  // exactly the "I land near the bottom and can't see the payment choices"
  // symptom.
  //
  // TWO calls, because the ref is the shell root and the root is the scroller
  // only when the wizard is full-page:
  //  - `scrollTo` resets the root's OWN offset. This is the full-page case;
  //    `scrollIntoView` alone cannot do it, since bringing an element into view
  //    says nothing about where that element is scrolled internally.
  //  - `scrollIntoView` still handles the embedded /secretary case, where the
  //    sidebar's overflow-auto pane is the ancestor that actually scrolls.
  // Each is a harmless no-op in the other's case.
  const scrollTopRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollTopRef.current;
    if (!el) return;
    // jsdom (test env) implements neither; guard so both are no-ops there while
    // still running in every real browser.
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: 0 });
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }, [currentStep]);

  // Resolve the exhibitor that this submission is filed under. For exhibitor
  // self-service this equals the caller's own people.id (since they only see
  // dogs they own). For mail-in (advancedSearch=true) the secretary may have
  // selected dogs from a different exhibitor — that exhibitor's people.id
  // becomes the enrollment handler.
  const ownerResolution: SelectedDogsOwnerResult = useMemo(
    () => selectedDogsOwner(dogs, registrationData.selectedDogs),
    [dogs, registrationData.selectedDogs]
  );

  const [classSelections, setClassSelections] = useState<ClassSelectionData[]>([]);
  const [handlerAssignments, setHandlerAssignments] = useState<Record<string, HandlerInfo>>({});
  const [registrationId, setRegistrationId] = useState<string | undefined>();
  const [registrationNumber, setRegistrationNumber] = useState<string | undefined>();
  const [isCreatingRegistration, setIsCreatingRegistration] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(PaymentStatus.PENDING);
  const [entryStatus, setEntryStatus] = useState<EntryStatus>(EntryStatus.PENDING);
  const [armbandAssignments, setArmbandAssignments] = useState<ArmbandAssignment[]>([]);
  const [entryOutcomes, setEntryOutcomes] = useState<EntrySubmissionOutcome[]>([]);
  const paymentDetailsRef = useRef<PaymentDetails>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToEntryAgreement, setAgreedToEntryAgreement] = useState(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const hasAutoSelectedDogs = useRef(false);
  const pendingDraftRegistrationRef = useRef(false);

  const {
    createRegistration,
    submitRegistration,
    currentRegistration,
    setDraftData,
    updateRegistration: updateShowRegistration,
    updatePaymentStatus: storeUpdatePaymentStatus,
    updateEntryStatus: storeUpdateEntryStatus,
  } = useShowRegistrationStore();

  // Draft persistence
  const userId = user?.id || 'anonymous';
  const clampedStep = Math.min(currentStep, currentWorkflowConfig.steps.length - 1);
  const currentStepId: StepId = currentWorkflowConfig.steps[clampedStep];

  useEffect(() => {
    if (!capacityCheckEnabled || currentStepId !== 'payment') return;
    void refetchClassAvailability();
  }, [capacityCheckEnabled, currentStepId, refetchClassAvailability]);

  const {
    saveDraft: draftSave,
    loadDraft: draftLoad,
    activateDraft,
    deactivateDraft,
    deleteDraft: draftDelete,
    availableDrafts,
    clearAllDrafts,
    discardDraftsWithoutFinalSave,
    hasUnsavedChanges,
  } = useDraftPersistence(showId || '', userId, currentStepId, {
    autoSaveInterval: 30000,
    debug: import.meta.env.DEV,
  });

  // Step helpers
  const isStepCompleted = (stepIndex: number) => {
    const stepId = currentWorkflowConfig.steps[stepIndex];
    return stepId ? stepCompletionState[stepId] || false : false;
  };

  const markStepComplete = (stepIndex: number) => {
    const stepId = currentWorkflowConfig.steps[stepIndex];
    if (stepId) {
      setStepCompletionState(prev => ({ ...prev, [stepId]: true }));
    }
  };

  const optimisticState = useMemo(
    () => ({
      formData: registrationData,
      classSelections,
      handlerAssignments,
      paymentStatus,
      entryStatus,
    }),
    [registrationData, classSelections, handlerAssignments, paymentStatus, entryStatus]
  );

  const completedSteps = useMemo(() => {
    return steps
      .map((_step, index) => index)
      .filter(index => {
        const stepId = currentWorkflowConfig.steps[index];
        return stepId ? stepCompletionState[stepId] || false : false;
      });
  }, [steps, currentWorkflowConfig.steps, stepCompletionState]);

  // Sync draft data
  useEffect(() => {
    setDraftData(
      buildDraftFormData({
        registrationData,
        currentStepId,
        stepCompletionState,
        classSelections,
        handlerAssignments,
        paymentStatus,
        entryStatus,
      })
    );
  }, [
    registrationData,
    currentStepId,
    stepCompletionState,
    classSelections,
    handlerAssignments,
    paymentStatus,
    entryStatus,
    setDraftData,
  ]);

  const selectedDogIds = useMemo(
    () => new Set(registrationData.selectedDogs),
    [registrationData.selectedDogs]
  );
  const registrationCapacity = useMemo(
    () => getRegistrationCapacityState(classSelections, availabilityClasses, selectedDogIds),
    [classSelections, availabilityClasses, selectedDogIds]
  );
  const { capacityReady, capacityUnavailable } = resolveRegistrationCapacityGate({
    enabled: capacityCheckEnabled,
    isLoading: capacityLoading,
    error: capacityError,
    unknownClassCount: registrationCapacity.unknownClassIds.size,
  });

  // `capacityReady === false` covers two states the user experiences very
  // differently: still loading, and cannot be loaded. (Offline the query pauses
  // rather than failing — see isAvailabilityUnreadable.) Treating "cannot be
  // loaded" as "still checking" tells the exhibitor to wait for something that
  // will never arrive.
  // FOUR states, not three. The question is not only "is there an agreement?"
  // but "have we actually resolved that question for THIS organization?".
  //   resolved with a row  -> must be ticked
  //   resolved with null   -> no agreement configured; nothing to present
  //   not resolved         -> unknown; block
  //
  // Both failure modes here are silent. The client is networkMode 'online', so
  // offline this query PAUSES: isLoading false, isError false, no data — which
  // an earlier version read as "no agreement configured" and let the exhibitor
  // submit without accepting the legal agreement. And the client sets a global
  // placeholderData that carries the PREVIOUS organization's agreement across a
  // key change, so `data` can be present and belong to a different show.
  // isSuccess plus !isPlaceholderData is the only combination that means
  // "answered, for this organization".
  const {
    data: entryAgreement,
    isLoading: agreementLoading,
    isFetching: agreementFetching,
    isSuccess: agreementQueryResolved,
    isPlaceholderData: agreementIsPlaceholder,
  } = useOrganizationAgreement(currentShow?.organization ?? '');
  const agreementGateApplies = !!currentShow?.organization;
  const agreementAnswered =
    agreementGateApplies && agreementQueryResolved && !agreementIsPlaceholder;
  const agreementRequired = agreementAnswered && !!entryAgreement;
  // Order matters: an answer wins, then work in progress, then unknown.
  // Switching organizations serves the PREVIOUS show's row as placeholder while
  // the new request runs (isLoading false, isPlaceholderData true, isFetching
  // true), so keying "unknown" off !answered alone showed a retry error during
  // an ordinary fetch.
  const agreementLoadingNow =
    agreementGateApplies && !agreementAnswered && (agreementLoading || agreementFetching);
  // Paused offline, or failed. Not "still arriving".
  const agreementUnavailable = agreementGateApplies && !agreementAnswered && !agreementLoadingNow;

  // The FULL result, not just the total: the entries panel itemises exactly
  // what this totalled, so the panel, the Next gate and the payment step's
  // amount due all read one calculation (design.md decision 3).
  const liveFeeCalculation = useMemo(
    () =>
      calculateTotalFees(
        registrationData.selectedDogs,
        classSelections,
        dogs,
        classes,
        currentShow && entryWindowTimezoneReady
          ? {
              preEntryFee: currentShow.preEntryFee || '0',
              dayOfShowFee: currentShow.dayOfShowFee,
              startDate: currentShow.startDate,
              // The running total on screen must be the tier the submission
              // will actually charge. Without the close date and the show's
              // timezone this hook applied the OLD start-date-only rule while
              // `submit_show_entries` applied the shared one, so an entry taken
              // after entries closed showed $30 and committed $35 (MYK9-642).
              entryCloseDate: currentShow.entryCloseDate,
              entryWindowTimezone,
            }
          : undefined,
        capacityReady ? registrationCapacity.waitlistClassIds : new Set()
      ),
    [
      registrationData.selectedDogs,
      classSelections,
      dogs,
      classes,
      currentShow,
      entryWindowTimezone,
      entryWindowTimezoneReady,
      capacityReady,
      registrationCapacity.waitlistClassIds,
    ]
  );
  const liveTotalFees = liveFeeCalculation.total;

  // Secretary fee waiver / manual override. Page state rather than PaymentStep
  // state because the entries panel renders the amount due outside the step's
  // own subtree and must apply the same two flags the step does.
  const [waiveFees, setWaiveFees] = useState(false);
  const [feeOverride, setFeeOverride] = useState<number | null>(null);

  const entryCloseAvailability = useEntryCloseAvailability({
    showId,
    show: currentShow,
    isLateEntryMode,
    workflowMode: currentWorkflowMode,
  });

  // Auto-assign dog owners as handlers for each entry (dog+class) when class
  // selections change. Derived key tracks the set of entries; the effect fires
  // only when entries change.
  const classSelectionsKey = useMemo(
    () =>
      classSelections
        .flatMap(s => s.selectedClasses.map(c => makeHandlerKey(s.dogId, c.classId)))
        .sort()
        .join(','),
    [classSelections]
  );

  useEffect(() => {
    if (classSelections.length === 0 || !currentWorkflowConfig.smartDefaults.autoAssignHandler) {
      return;
    }

    setHandlerAssignments(prev => autoAssignHandlers(prev, classSelections, dogs));
    // classSelectionsKey is derived from classSelections — captures entry changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSelectionsKey, dogs, currentWorkflowConfig.smartDefaults.autoAssignHandler]);

  // Validation — proceedBlockedReason is the single source of truth; the
  // returned copy renders next to the disabled Next button so the user is
  // never left guessing why the wizard won't advance.
  const allEntryKeys = classSelections.flatMap(s =>
    s.selectedClasses.map(c => makeHandlerKey(s.dogId, c.classId))
  );
  const proceedBlocked = proceedBlockedReason({
    stepId: currentStepId,
    selectedDogsCount: registrationData.selectedDogs.length,
    ownerSelectionOk: ownerResolution.ok,
    hasSelectedClasses:
      classSelections.length > 0 && classSelections.some(s => s.selectedClasses.length > 0),
    hasSeparateHandlerStep: currentWorkflowConfig.steps.includes('handler-assignment'),
    entryCount: allEntryKeys.length,
    unassignedHandlerCount: allEntryKeys.filter(key => !handlerAssignments[key]?.handlerName)
      .length,
    totalFees: liveTotalFees,
    hasPaymentMethod: !!registrationData.paymentMethod,
    needsAgreement: agreementRequired,
    agreementUnavailable,
    agreementLoadingNow,
    agreedToEntryAgreement,
    capacityReady,
    entryWindowTimezoneReady,
    entryWindowTimezoneUnavailable,
    blockedClassCount: registrationCapacity.blockedClassIds.size,
    capacityUnavailable,
  });
  const canProceed = () => proceedBlocked === null;
  const isLastStep = currentStep === steps.length - 1;

  return {
    // Routing / chrome
    showId,
    navigate,
    isInsideSidebar,
    isLateEntryMode,
    exitTarget,
    workflowLabel,
    sidebarTitle,
    workflowSubtitle,
    scrollTopRef,

    // Identity / permissions
    userId,
    canAssignArmbands,
    exhibitorProfile,
    triggerSync,

    // Stores / data
    dogs,
    dogsLoading,
    dogsReady,
    dogsError: dogsReady ? null : dogsError || (!exhibitorProfile ? profileError : null),
    resumeDataLoading: profileLoading || dogsLoading,
    // Unresolved identity is its own state: no roster request is in flight and
    // an empty roster says nothing about this exhibitor. A profile error is a
    // failure the exhibitor can retry, so it is not identity-pending.
    dogsIdentityPending: !exhibitorProfile?.person_id && !profileError,
    retryDogLoad: () => {
      // Never refetch the roster without a resolved person — the query is
      // disabled for that reason and refetch() would bypass it.
      if (exhibitorProfile?.person_id && !profileError) refetchDogs();
      else void refetchExhibitorProfile();
    },
    classes,
    currentShow,
    clearCart,
    ensureCart,
    addItem,
    abandonCart,
    createRegistration,
    submitRegistration,
    currentRegistration,
    updateShowRegistration,
    storeUpdatePaymentStatus,
    storeUpdateEntryStatus,

    // Workflow config
    currentWorkflowMode,
    currentWorkflowConfig,
    steps,

    // Wizard state + setters
    currentStep,
    setCurrentStep,
    setStepCompletionState,
    registrationData,
    setRegistrationData,
    classSelections,
    setClassSelections,
    handlerAssignments,
    setHandlerAssignments,
    registrationId,
    setRegistrationId,
    registrationNumber,
    setRegistrationNumber,
    isCreatingRegistration,
    setIsCreatingRegistration,
    paymentStatus,
    setPaymentStatus,
    setEntryStatus,
    armbandAssignments,
    setArmbandAssignments,
    entryOutcomes,
    setEntryOutcomes,
    paymentDetailsRef,
    isSubmitting,
    setIsSubmitting,
    agreedToEntryAgreement,
    setAgreedToEntryAgreement,
    submittingRef,
    mountedRef,
    hasAutoSelectedDogs,
    pendingDraftRegistrationRef,

    // Drafts
    draftSave,
    draftLoad,
    activateDraft,
    deactivateDraft,
    draftDelete,
    availableDrafts,
    clearAllDrafts,
    discardDraftsWithoutFinalSave,
    hasUnsavedChanges,

    // Derived
    currentStepId,
    optimisticState,
    completedSteps,
    liveTotalFees,
    liveFeeCalculation,
    waiveFees,
    setWaiveFees,
    feeOverride,
    setFeeOverride,
    capacityReady,
    capacityError: exposedCapacityError,
    capacityUnavailable,
    refetchClassAvailability,
    waitlistClassIds: registrationCapacity.waitlistClassIds,
    blockedClassIds: registrationCapacity.blockedClassIds,
    entryCloseAvailability,
    entryWindowTimezone,
    entryWindowTimezoneReady,
    entryWindowTimezoneUnavailable,
    entryWindowTimezoneState,
    ownerResolution,
    proceedBlocked,
    canProceed,
    isLastStep,
    isStepCompleted,
    markStepComplete,
  };
}

export type RegistrationWizardState = ReturnType<typeof useRegistrationWizardState>;
