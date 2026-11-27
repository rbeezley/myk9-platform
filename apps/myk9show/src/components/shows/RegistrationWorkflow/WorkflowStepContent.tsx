import type { PaymentMethodResolution } from './PaymentStep/usePaymentMethodResolution';
import { DeskFormOutcomeNotice } from './DeskFormOutcomeNotice';
import type { DeskFormOutcome } from '@/features/registration/deskFormDue';
import { useMemo } from 'react';
import { DogSelectionStep } from './DogSelectionStep';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';
import { ClassSelectionStep } from './ClassSelectionStep';
import type { HandlerClashControl } from './ClassSelectionStep.types';
import { PaymentStep } from './PaymentStep';
import type { JuniorHandlerDeclaration } from './PaymentStep/JuniorHandlerDeclaration';
import { ConfirmationStep } from './ConfirmationStep';
import { SearchErrorBoundary, PaymentErrorBoundary } from '@/components/common/ErrorBoundary';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useUserStore } from '@/store/userStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { deriveRegistryId, getShowStyle, getTrialRegistry } from '@/features/registries';
import { STYLED_RECEIPT_BY_STYLE } from '@/features/_shared/styledReceiptRegistry';
import { receiptTotal } from '@/features/registration/receiptTotal';
import { STYLED_ENTRY_BLANK_BY_STYLE } from '@/features/_shared/styledEntryBlankRegistry';
import {
  ClassSelectionData,
  RegistrationFormData,
  HandlerInfo,
  PaymentStatus,
  EntryStatus,
} from '@/types/show-registration-types';
import type { PaymentMethod, PaymentDetails } from '@/types/show-registration-types';
import { notifyStatusSaveFailed } from './statusSaveError';
import { notifications } from '@/lib/notifications';
import { NoDogsYetAlert } from './NoDogsYetAlert';
import type { WorkflowConfig } from './RegistrationWorkflow.types';
import type { WorkflowMode } from './RegistrationWorkflow.types';
import { fullConfirmationNote } from './fullConfirmationNote';
import type { ArmbandAssignment } from './ConfirmationStep.types';
import type { EntrySubmissionOutcome } from '@/services/database/entries';
import { EntrySubmissionOutcomeAlert } from './EntrySubmissionOutcomeAlert';
import {
  filterClassSelectionsToCreatedOutcomes,
  getCreatedOutcomeTotalFees,
  hasCreatedEntryOutcome,
} from './entrySubmissionOutcomes';
import { buildRegistrationEntryBlankDownloads } from './entryBlankOptions';
import { buildReceiptDogs } from '@/features/_shared/receiptDogs';

interface OptimisticRegistrationState {
  formData: RegistrationFormData;
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  paymentStatus: PaymentStatus;
  entryStatus: EntryStatus;
}

interface WorkflowStepContentProps {
  /**
   * Resolved by the page (`usePaymentMethodResolution`) and passed straight
   * through, so the entries panel and the payment controls read one derivation.
   */
  paymentResolution: PaymentMethodResolution;
  currentStepId: string;
  currentWorkflowConfig: WorkflowConfig;
  currentWorkflowMode: WorkflowMode;
  registrationData: RegistrationFormData;
  optimisticState: OptimisticRegistrationState;
  showId: string;
  registrationId: string | undefined;
  registrationNumber: string | undefined;
  currentRegistrationTotalFees: number;
  /** MYK9-2149: money the form holds before submit, and what it still owes after. */
  desk?: { formHeldCents: number | null; outcome: DeskFormOutcome | null } | undefined;
  capacityReady?: boolean | undefined;
  capacityError?: string | null | undefined;
  /** Availability could not be read at all, as opposed to still loading. */
  capacityUnavailable?: boolean | undefined;
  onRetryAvailability?: (() => void) | undefined;
  waitlistClassIds?: ReadonlySet<string> | undefined;
  blockedClassIds?: ReadonlySet<string> | undefined;
  /** Armband assignments from the RPC call */
  armbandAssignments?: ArmbandAssignment[];
  entryOutcomes?: EntrySubmissionOutcome[] | undefined;
  /** Created entries for the entry-blank downloads; set even when `entryOutcomes` is not. */
  createdEntryOutcomes?: EntrySubmissionOutcome[] | undefined;
  onDogSelectionChange: (dogs: string[]) => void | Promise<void>;
  onClassSelectionChange: (selections: ClassSelectionData[]) => void | Promise<void>;
  onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => void | Promise<void>;
  /** MYK9-2021: the same-class handler question's state, held by the wizard. */
  handlerClash?: HandlerClashControl | undefined;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onPaymentMethodClear?: (() => void) | undefined;
  onPaymentDetailsChange?: ((details: PaymentDetails) => void) | undefined;
  getPaymentDetails?: (() => PaymentDetails) | undefined;
  onEntryStatusChange: (
    registrationId: string,
    status: EntryStatus,
    reason?: string
  ) => void | Promise<unknown>;
  setEntryStatus: (status: EntryStatus) => void;
  /** True while dogs are loading (used for auto-select loading state) */
  dogsLoading?: boolean;
  /** Use local-first create paths for show-desk late-entry capture. */
  offlineFirstCreate?: boolean | undefined;
  /** Current state of the entry agreement checkbox on the payment step. */
  agreedToEntryAgreement?: boolean | undefined;
  /** Callback when the entry agreement checkbox is toggled on the payment step. */
  onAgreementChange?: ((agreed: boolean) => void) | undefined;
  juniorDeclaration?: JuniorHandlerDeclaration | undefined;
}

export function WorkflowStepContent({
  paymentResolution,
  currentStepId,
  currentWorkflowConfig,
  currentWorkflowMode,
  registrationData,
  optimisticState,
  showId,
  registrationId,
  registrationNumber,
  currentRegistrationTotalFees,
  desk,
  capacityReady = true,
  capacityError,
  capacityUnavailable,
  onRetryAvailability,
  waitlistClassIds = new Set(),
  blockedClassIds = new Set(),
  armbandAssignments,
  entryOutcomes,
  createdEntryOutcomes,
  onDogSelectionChange,
  onClassSelectionChange,
  onHandlerAssignmentChange,
  handlerClash,
  onPaymentMethodChange,
  onPaymentMethodClear,
  onPaymentDetailsChange,
  getPaymentDetails,
  onEntryStatusChange,
  setEntryStatus,
  dogsLoading,
  offlineFirstCreate = false,
  agreedToEntryAgreement,
  onAgreementChange,
  juniorDeclaration,
}: WorkflowStepContentProps) {
  const hasDogSelectionStep = currentWorkflowConfig.steps.includes('dog-selection');
  const hasCreatedCapacityOutcome = hasCreatedEntryOutcome(entryOutcomes);
  const receiptClassSelections = filterClassSelectionsToCreatedOutcomes(
    optimisticState.classSelections,
    entryOutcomes
  );
  const receiptTotalFees = getCreatedOutcomeTotalFees(entryOutcomes, currentRegistrationTotalFees);
  const receiptMoney = receiptTotal({
    paymentMethod: optimisticState.formData.paymentMethod,
    receivedMethod: getPaymentDetails?.().receivedMethod,
    paymentStatus: optimisticState.paymentStatus,
    totalFees: receiptTotalFees,
  });

  // Styled receipt branch — hooks must be top-level (Rules of Hooks);
  // expensive .find() lookups are memoized and only compute during confirmation step.
  const shows = useShowStore(s => s.shows);
  const allTrials = useTrialStore(s => s.trials);
  const trialsReadStatus = useTrialStore(s => s.trialsReadStatus);
  const people = useUserStore(s => s.people);
  const { dogs } = useDogStoreCompat();
  const { classes } = useClassStoreCompat();
  const currentShow = shows.find(show => show.id === showId);

  // One registry per show (MYK9-490), so ANY loaded trial of this show answers
  // for the whole show — the first is enough, no scan needed. Read through the
  // registries helpers, never off the column.
  //
  // A trial row is only trusted once `trialsReadStatus` says the read finished:
  // mid-hydration `trials` is [] or partial, and no marker is better than a
  // wrong one. The organization fallback is NOT a guess — `trials.registry_id`
  // is a projection of `shows.organization` through the same derivation the
  // server applies (`derive_registry_id`), so the two cannot disagree; it is
  // what keeps the marker alive on this route, which never calls `loadTrials`
  // and can therefore sit at `trialsReadStatus: 'idle'` indefinitely. Null only
  // when we have neither, and the dog card then claims nothing (MYK9-569).
  const showRegistryId = useMemo(() => {
    const trial =
      trialsReadStatus === 'ready' ? allTrials.find(t => t.showId === showId) : undefined;
    if (trial) return getTrialRegistry(trial).id;
    return currentShow ? deriveRegistryId(currentShow.organization) : null;
  }, [trialsReadStatus, allTrials, showId, currentShow]);

  const styledReceipt = useMemo(() => {
    if (currentStepId !== 'confirmation') return null;
    // getShowStyle always narrows to a known ShowStyle value, and the
    // STYLED_RECEIPT_BY_STYLE registry is exhaustive over that union
    // (typecheck-enforced) — every show resolves to a renderer. The
    // earlier per-style allow-list was tautological once the registry
    // landed; dropping it removes a class of "added a style but forgot
    // to wire the gate" bugs.
    const style = getShowStyle(currentShow);

    return {
      style,
      // brand_color flows through for Banner shows. May be null on shows
      // that haven't picked one (the DB default is enforced for new rows,
      // so this is mostly defensive against pre-migration rows).
      brandColor: currentShow?.brand_color ?? null,
      showName: currentShow?.name ?? '',
      clubName: currentShow?.clubName ?? currentShow?.name ?? '',
      dateRange: currentShow?.startDate
        ? (() => {
            // Format as "12–14 June 2026" (Heritage style). T12:00:00 prevents UTC-midnight
            // drift for date-only ISO strings (same guard applied to confirmationDate below).
            const fmt = (iso: string) =>
              new Date(iso.split('T')[0] + 'T12:00:00').toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              });
            return currentShow.endDate && currentShow.endDate !== currentShow.startDate
              ? `${fmt(currentShow.startDate)} – ${fmt(currentShow.endDate)}`
              : fmt(currentShow.startDate);
          })()
        : '',
      dogs: buildReceiptDogs(
        receiptClassSelections,
        dogs,
        classes,
        optimisticState.formData.selectedDogs
      ),
      // MYK9-1999: the full confirmation goes by itself once the entry is accepted; the
      // secretary sets no date for it.
      fullConfirmationNote: fullConfirmationNote(currentWorkflowMode),
    } as const;
  }, [
    currentStepId,
    dogs,
    classes,
    receiptClassSelections,
    optimisticState.formData.selectedDogs,
    currentShow,
    currentWorkflowMode,
  ]);

  const entryBlankResult = useMemo(() => {
    if (
      currentStepId !== 'confirmation' ||
      currentWorkflowMode === 'exhibitor' ||
      !hasCreatedCapacityOutcome
    ) {
      return { downloads: [], unavailable: [] };
    }

    return buildRegistrationEntryBlankDownloads({
      show: currentShow,
      trials: allTrials,
      classes,
      dogs,
      people,
      outcomes: createdEntryOutcomes?.length ? createdEntryOutcomes : entryOutcomes,
      handlerAssignments: optimisticState.handlerAssignments,
      paymentMethod: optimisticState.formData.paymentMethod,
    });
  }, [
    currentStepId,
    currentWorkflowMode,
    hasCreatedCapacityOutcome,
    currentShow,
    allTrials,
    classes,
    dogs,
    people,
    entryOutcomes,
    createdEntryOutcomes,
    optimisticState.handlerAssignments,
    optimisticState.formData.paymentMethod,
  ]);

  const printEntryBlankUnavailable = () =>
    notifications.info('Entry blank', {
      description: 'A printable entry blank will be available after the draw is complete.',
    });

  const entryBlankActions =
    styledReceipt !== null && currentWorkflowMode !== 'exhibitor' ? (
      <div className="space-y-3" aria-label="Entry blanks">
        {entryBlankResult.downloads.map(download => (
          <div key={download.entryId}>
            {STYLED_ENTRY_BLANK_BY_STYLE[styledReceipt.style](
              {
                ...download.options,
                label: `Download ${download.label}`,
                filename: `${download.entryId}-entry-blank.pdf`,
                className: 'min-h-11 w-full',
              },
              { brandColor: styledReceipt.brandColor }
            )}
          </div>
        ))}
        {entryBlankResult.unavailable.map(item => (
          <div
            key={item.key}
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {item.reason}
          </div>
        ))}
      </div>
    ) : undefined;

  const styledReceiptProps =
    styledReceipt === null
      ? null
      : {
          showName: styledReceipt.showName,
          clubName: styledReceipt.clubName,
          dateRange: styledReceipt.dateRange,
          dogs: styledReceipt.dogs,
          ...receiptMoney,
          registrationNumber: registrationNumber ?? null,
          fullConfirmationNote: styledReceipt.fullConfirmationNote,
          // MYK9-2474: the wizard footer's ReceiptExits already gives staff their exits.
          hideReturnToDashboard: currentWorkflowMode !== 'exhibitor',
          // INTENT: Exhibitor self-service still waits for the post-draw blank.
          // Staff workflows can print a specific created entry here because the
          // replication-backed class data already carries its judge assignment.
          ...(entryBlankActions
            ? { entryBlankActions }
            : { onPrintEntryBlank: printEntryBlankUnavailable }),
        };
  return (
    <div className="min-h-[300px]">
      {currentStepId === 'dog-selection' && (
        <SearchErrorBoundary>
          {currentWorkflowConfig.features.advancedSearch ? (
            <DogSelectionStepEnhanced
              selectedDogs={registrationData.selectedDogs}
              onSelectionChange={onDogSelectionChange}
              offlineFirst={offlineFirstCreate}
              showRegistryId={showRegistryId}
              showStartDate={currentShow?.startDate}
              createdFromShowId={showId}
            />
          ) : (
            <DogSelectionStep
              selectedDogs={registrationData.selectedDogs}
              onSelectionChange={onDogSelectionChange}
              showRegistryId={showRegistryId}
              showStartDate={currentShow?.startDate}
              createdFromShowId={showId}
              showId={showId}
            />
          )}
        </SearchErrorBoundary>
      )}

      {currentStepId === 'class-selection' &&
        (!hasDogSelectionStep && optimisticState.formData.selectedDogs.length === 0 ? (
          dogsLoading ? (
            // Loading skeleton while dogs are being auto-selected
            <div className="space-y-4">
              <div className="h-8 bg-muted/50 rounded-lg animate-pulse" />
              <div className="h-10 bg-muted/50 rounded-lg animate-pulse" />
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
                ))}
              </div>
            </div>
          ) : (
            // Exhibitor has 0 registered dogs
            <NoDogsYetAlert
              showStartDate={currentShow?.startDate}
              createdFromShowId={showId}
              defaultRegistryId={showRegistryId}
              offlineFirst={offlineFirstCreate}
            />
          )
        ) : (
          <>
            <ClassSelectionStep
              selectedDogs={registrationData.selectedDogs}
              classSelections={optimisticState.classSelections}
              onSelectionChange={onClassSelectionChange}
              showId={showId}
              workflowMode={currentWorkflowMode}
              ownerAddressWarnOnly={offlineFirstCreate}
              handlerAssignments={optimisticState.handlerAssignments}
              onHandlerAssignmentChange={onHandlerAssignmentChange}
              handlerClash={handlerClash}
            />
          </>
        ))}

      {currentStepId === 'payment' && (
        <PaymentErrorBoundary>
          <PaymentStep
            paymentResolution={paymentResolution}
            selectedDogs={optimisticState.formData.selectedDogs}
            paymentMethod={optimisticState.formData.paymentMethod || ''}
            onPaymentMethodChange={onPaymentMethodChange}
            onPaymentMethodClear={onPaymentMethodClear}
            onPaymentDetailsChange={onPaymentDetailsChange}
            getPaymentDetails={getPaymentDetails}
            showId={showId}
            registrationId={registrationId}
            agreedToEntryAgreement={agreedToEntryAgreement}
            onAgreementChange={onAgreementChange}
            preTickAgreement={currentWorkflowMode !== 'exhibitor'}
            staffWorkflow={currentWorkflowMode !== 'exhibitor'}
            formHeldCents={desk?.formHeldCents ?? null}
            juniorDeclaration={juniorDeclaration}
            capacityReady={capacityReady}
            capacityError={capacityError}
            capacityUnavailable={capacityUnavailable}
            onRetryAvailability={onRetryAvailability}
            waitlistClassIds={waitlistClassIds}
            blockedClassIds={blockedClassIds}
          />
        </PaymentErrorBoundary>
      )}

      {currentStepId === 'confirmation' && desk?.outcome && (
        <DeskFormOutcomeNotice showId={showId} outcome={desk.outcome} />
      )}
      {currentStepId === 'confirmation' &&
        (styledReceipt && styledReceiptProps && hasCreatedCapacityOutcome ? (
          <div className="space-y-6">
            <EntrySubmissionOutcomeAlert outcomes={entryOutcomes} />
            {STYLED_RECEIPT_BY_STYLE[styledReceipt.style](styledReceiptProps, {
              brandColor: styledReceipt.brandColor,
            })}
          </div>
        ) : (
          <ConfirmationStep
            registrationNumber={registrationNumber}
            registrationId={registrationId}
            selectedDogs={optimisticState.formData.selectedDogs}
            classSelections={optimisticState.classSelections}
            documents={optimisticState.formData.documents}
            paymentMethod={optimisticState.formData.paymentMethod || ''}
            paymentStatus={optimisticState.paymentStatus}
            entryStatus={optimisticState.entryStatus}
            workflowMode={currentWorkflowMode}
            totalFees={receiptTotalFees}
            showId={showId}
            armbandAssignments={armbandAssignments}
            entryOutcomes={entryOutcomes}
            onDownloadReceipt={undefined}
            onSendEmail={undefined}
            onStatusChange={async (_dogId: string, status: EntryStatus) => {
              setEntryStatus(status);
              if (registrationId) {
                try {
                  await onEntryStatusChange(registrationId, status);
                } catch (error: unknown) {
                  notifyStatusSaveFailed('entry', error);
                }
              }
            }}
          />
        ))}
    </div>
  );
}
