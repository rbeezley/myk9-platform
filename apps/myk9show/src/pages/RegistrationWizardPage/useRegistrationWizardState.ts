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
import { isShowDeskLateEntryMode, resolveRegistrationExit } from '../RegistrationWizardPage.routes';
import { proceedBlockedReason } from './proceedGating';
import { buildDraftFormData } from './buildDraftFormData';
import { autoAssignHandlers } from './autoAssignHandlers';
import { getEntryCloseAvailability, getEntryWindowTimezone } from './entryCloseGuard';
import { useClassAvailability } from '@/hooks/useClassAvailability';
import { getRegistrationCapacityState } from './registrationCapacity';

// Exhibitor self-service defaults to online card payment; on-behalf modes
// (secretary/admin/club) can't use card checkout, so they start unset and must
// choose explicitly. Shared by the initial state and the mode-change reset.
export const defaultPaymentForMode = (mode: WorkflowMode): PaymentMethod | undefined =>
  mode === 'exhibitor' ? 'credit_card' : mode === 'secretary_new' ? 'secretary_paid' : undefined;

export function useRegistrationWizardState() {
  const { showId: showIdParam } = useParams<{ showId: string }>();
  // showId is guaranteed by the outer RegistrationWizardPage guard
  const showId = showIdParam!;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isInsideSidebar = !!useMatch('/secretary/*');
  const isLateEntryMode = isShowDeskLateEntryMode(searchParams);
  const workflowLabel = isLateEntryMode
    ? 'Late entry'
    : isInsideSidebar
      ? 'Mail-in entry'
      : 'Register';
  const sidebarTitle = isLateEntryMode
    ? 'Add late entry'
    : isInsideSidebar
      ? 'Add mail-in entry'
      : 'Register for Show';
  const workflowSubtitle = isInsideSidebar ? 'Enter on behalf of an exhibitor.' : undefined;
  const exitTarget = resolveRegistrationExit(showId, { isLateEntryMode, isInsideSidebar });

  // Auth and permissions
  const { isSecretary, isClubAdmin, isSiteAdmin, canAssignArmbands } = useRegistrationPermissions();
  const { user } = useAuthContext();
  const { profile: exhibitorProfile } = useExhibitorProfile();
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
  const { dogs, isLoading: dogsLoading } = useDogStoreCompat();
  const { shows = [] } = useShowStore();
  const { classes = [] } = useClassStoreCompat();
  const loadCart = useCartStore(state => state.loadCart);
  const clearCart = useCartStore(state => state.clearCart);
  const createCart = useCartStore(state => state.createCart);
  const addItem = useCartStore(state => state.addItem);
  const abandonCart = useCartStore(state => state.abandonCart);
  const currentShow = useMemo(() => shows.find(s => s.id === showId), [shows, showId]);

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
  const capacityCheckEnabled = currentWorkflowMode === 'exhibitor' && !isLateEntryMode;
  const {
    classes: availabilityClasses,
    isLoading: capacityLoading,
    error: capacityError,
    refetch: refetchClassAvailability,
  } = useClassAvailability(showId, { enabled: capacityCheckEnabled });

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

  // Scroll the wizard back to the top of its scroll container on every step
  // change. Steps differ a lot in height, so otherwise the prior scroll offset
  // carries over and a tall step (the payment step in particular) opens scrolled
  // past its first controls — exactly the "I land near the bottom and can't see
  // the payment choices" symptom. scrollIntoView climbs to whichever ancestor
  // actually scrolls: the window when the wizard is full-page, the sidebar's
  // overflow-auto pane when embedded under /secretary.
  const scrollTopRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollTopRef.current;
    // jsdom (test env) doesn't implement scrollIntoView; guard so it's a no-op
    // there while still running in every real browser.
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'start' });
    }
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

  const {
    createRegistration,
    submitRegistration,
    confirmRegistration,
    currentRegistration,
    setDraftData,
    clearDraftData,
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

  const selectedDogIds = useMemo(() => new Set(registrationData.selectedDogs), [
    registrationData.selectedDogs,
  ]);
  const registrationCapacity = useMemo(
    () => getRegistrationCapacityState(classSelections, availabilityClasses, selectedDogIds),
    [classSelections, availabilityClasses, selectedDogIds]
  );
  const capacityReady =
    !capacityCheckEnabled && !capacityLoading && !capacityError
      ? true
      : capacityCheckEnabled &&
          !capacityLoading &&
          !capacityError &&
          registrationCapacity.unknownClassIds.size === 0;

  // `capacityReady === false` covers two states the user experiences very
  // differently: still loading, and cannot be loaded. Offline the query PAUSES
  // (networkMode 'online'), so it reports isLoading false, error null and no
  // data — settled, but unresolved. Treating that as "still checking" tells the
  // exhibitor to wait for something that will never arrive.
  const capacityUnavailable =
    capacityCheckEnabled &&
    !capacityLoading &&
    (!!capacityError || registrationCapacity.unknownClassIds.size > 0);

  const liveTotalFees = useMemo(
    () =>
      calculateTotalFees(
        registrationData.selectedDogs,
        classSelections,
        dogs,
        classes,
        currentShow
          ? {
              preEntryFee: currentShow.preEntryFee || '0',
              dayOfShowFee: currentShow.dayOfShowFee,
              startDate: currentShow.startDate,
            }
          : undefined,
        capacityReady ? registrationCapacity.waitlistClassIds : new Set()
      ).total,
    [
      registrationData.selectedDogs,
      classSelections,
      dogs,
      classes,
      currentShow,
      capacityReady,
      registrationCapacity.waitlistClassIds,
    ]
  );

  const entryCloseAvailability = useMemo(
    () =>
      getEntryCloseAvailability({
        showId,
        startDate: currentShow?.startDate,
        entryOpenDate: currentShow?.entryOpenDate,
        entryCloseDate: currentShow?.entryCloseDate,
        entryWindowTimezone: getEntryWindowTimezone(currentShow?.trials),
        isLateEntryMode,
        workflowMode: currentWorkflowMode,
      }),
    [
      showId,
      currentShow?.startDate,
      currentShow?.entryOpenDate,
      currentShow?.entryCloseDate,
      currentShow?.trials,
      isLateEntryMode,
      currentWorkflowMode,
    ]
  );

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
    needsAgreement: !!currentShow?.organization,
    agreedToEntryAgreement,
    capacityReady,
    blockedClassCount: registrationCapacity.blockedClassIds.size,
    capacityUnavailable,
    paymentMethod: registrationData.paymentMethod ?? null,
    waitlistClassCount: capacityReady ? registrationCapacity.waitlistClassIds.size : 0,
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
    classes,
    currentShow,
    loadCart,
    clearCart,
    createCart,
    addItem,
    abandonCart,
    createRegistration,
    submitRegistration,
    confirmRegistration,
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

    // Drafts
    draftSave,
    draftLoad,
    draftDelete,
    availableDrafts,
    clearAllDrafts,
    discardDraftsWithoutFinalSave,
    clearDraftData,
    hasUnsavedChanges,

    // Derived
    currentStepId,
    optimisticState,
    completedSteps,
    liveTotalFees,
    capacityReady,
    capacityError,
    capacityUnavailable,
    waitlistClassIds: registrationCapacity.waitlistClassIds,
    blockedClassIds: registrationCapacity.blockedClassIds,
    entryCloseAvailability,
    ownerResolution,
    proceedBlocked,
    canProceed,
    isLastStep,
    isStepCompleted,
    markStepComplete,
  };
}

export type RegistrationWizardState = ReturnType<typeof useRegistrationWizardState>;
