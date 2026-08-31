import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DogSelectionStep } from './DogSelectionStep';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';
import { ClassSelectionStep } from './ClassSelectionStep';
import { PaymentStep } from './PaymentStep';
import { ConfirmationStep } from './ConfirmationStep';
import { HandlerAssignmentStep } from './HandlerAssignmentStep';
import { SearchErrorBoundary, PaymentErrorBoundary } from '@/components/common/ErrorBoundary';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useUserStore } from '@/store/userStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { getShowStyle } from '@/features/registries';
import { STYLED_RECEIPT_BY_STYLE } from '@/features/_shared/styledReceiptRegistry';
import { STYLED_ENTRY_BLANK_BY_STYLE } from '@/features/_shared/styledEntryBlankRegistry';
import {
  ClassSelectionData,
  RegistrationFormData,
  HandlerInfo,
  PaymentStatus,
  EntryStatus,
} from '@/types/show-registration-types';
import type { PaymentMethod, PaymentDetails } from '@/types/show-registration-types';
import { getErrorMessage } from '@myk9/core';
import { notifications } from '@/lib/notifications';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import type { WorkflowConfig } from './RegistrationWorkflow.types';
import type { WorkflowMode } from './RegistrationWorkflow.types';
import type { ArmbandAssignment } from './ConfirmationStep.types';
import type { EntrySubmissionOutcome } from '@/services/database/entries';
import { EntrySubmissionOutcomeAlert } from './EntrySubmissionOutcomeAlert';
import {
  filterClassSelectionsToCreatedOutcomes,
  getCreatedOutcomeTotalFees,
  hasCreatedEntryOutcome,
} from './entrySubmissionOutcomes';
import { buildRegistrationEntryBlankDownloads } from './entryBlankOptions';
import { getDogRegisteredName } from '@/types/dog-types';

interface OptimisticRegistrationState {
  formData: RegistrationFormData;
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  paymentStatus: PaymentStatus;
  entryStatus: EntryStatus;
}

interface WorkflowStepContentProps {
  currentStepId: string;
  currentWorkflowConfig: WorkflowConfig;
  currentWorkflowMode: WorkflowMode;
  registrationData: RegistrationFormData;
  optimisticState: OptimisticRegistrationState;
  showId: string;
  registrationId: string | undefined;
  registrationNumber: string | undefined;
  currentRegistrationTotalFees: number;
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
  onDogSelectionChange: (dogs: string[]) => void | Promise<void>;
  onClassSelectionChange: (selections: ClassSelectionData[]) => void | Promise<void>;
  onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => void | Promise<void>;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onPaymentDetailsChange?: ((details: PaymentDetails) => void) | undefined;
  onPaymentStatusChange: (registrationId: string, status: PaymentStatus) => void | Promise<unknown>;
  onEntryStatusChange: (
    registrationId: string,
    status: EntryStatus,
    reason?: string
  ) => void | Promise<unknown>;
  setPaymentStatus: (status: PaymentStatus) => void;
  setEntryStatus: (status: EntryStatus) => void;
  /** True while dogs are loading (used for auto-select loading state) */
  dogsLoading?: boolean;
  /** Use local-first create paths for show-desk late-entry capture. */
  offlineFirstCreate?: boolean | undefined;
  /** Current state of the entry agreement checkbox on the payment step. */
  agreedToEntryAgreement?: boolean | undefined;
  /** Callback when the entry agreement checkbox is toggled on the payment step. */
  onAgreementChange?: ((agreed: boolean) => void) | undefined;
}

export function WorkflowStepContent({
  currentStepId,
  currentWorkflowConfig,
  currentWorkflowMode,
  registrationData,
  optimisticState,
  showId,
  registrationId,
  registrationNumber,
  currentRegistrationTotalFees,
  capacityReady = true,
  capacityError,
  capacityUnavailable,
  onRetryAvailability,
  waitlistClassIds = new Set(),
  blockedClassIds = new Set(),
  armbandAssignments,
  entryOutcomes,
  onDogSelectionChange,
  onClassSelectionChange,
  onHandlerAssignmentChange,
  onPaymentMethodChange,
  onPaymentDetailsChange,
  onPaymentStatusChange,
  onEntryStatusChange,
  setPaymentStatus,
  setEntryStatus,
  dogsLoading,
  offlineFirstCreate = false,
  agreedToEntryAgreement,
  onAgreementChange,
}: WorkflowStepContentProps) {
  const hasDogSelectionStep = currentWorkflowConfig.steps.includes('dog-selection');
  const hasHandlerStep = currentWorkflowConfig.steps.includes('handler-assignment');
  const hasCreatedCapacityOutcome = hasCreatedEntryOutcome(entryOutcomes);
  const receiptClassSelections = filterClassSelectionsToCreatedOutcomes(
    optimisticState.classSelections,
    entryOutcomes
  );
  const receiptSelectedDogs = receiptClassSelections.map(selection => selection.dogId);
  const receiptTotalFees = getCreatedOutcomeTotalFees(entryOutcomes, currentRegistrationTotalFees);

  // Styled receipt branch — hooks must be top-level (Rules of Hooks);
  // expensive .find() lookups are memoized and only compute during confirmation step.
  const shows = useShowStore(s => s.shows);
  const allTrials = useTrialStore(s => s.trials);
  const people = useUserStore(s => s.people);
  const { dogs } = useDogStoreCompat();
  const { classes } = useClassStoreCompat();
  const currentShow = shows.find(show => show.id === showId);

  const styledReceipt = useMemo(() => {
    if (currentStepId !== 'confirmation') return null;
    // getShowStyle always narrows to a known ShowStyle value, and the
    // STYLED_RECEIPT_BY_STYLE registry is exhaustive over that union
    // (typecheck-enforced) — every show resolves to a renderer. The
    // earlier per-style allow-list was tautological once the registry
    // landed; dropping it removes a class of "added a style but forgot
    // to wire the gate" bugs.
    const style = getShowStyle(currentShow);

    const firstTrial = allTrials.find(t => t.showId === showId);
    const firstDogId = receiptSelectedDogs[0];
    const firstDog = dogs.find(d => d.id === firstDogId);
    const firstClassSelection = receiptClassSelections.find(s => s.dogId === firstDogId);
    const classSummary =
      firstClassSelection?.selectedClasses
        .map(sc => {
          const cls = classes.find(c => c.id === sc.classId);
          return cls?.className ?? sc.classId;
        })
        .join(', ') ?? '';

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
      dogRegisteredName: firstDog ? (getDogRegisteredName(firstDog) ?? '') : '',
      dogCallName: firstDog?.callName ?? null,
      classSummary,
      // Use T12:00:00 (noon) so date-only strings from Postgres never shift a calendar
      // day when parsed as UTC midnight by users west of UTC. Strip any existing time
      // component first in case the DB ever stores a full timestamp.
      confirmationDateLabel: firstTrial?.confirmationDate
        ? new Date(firstTrial.confirmationDate.split('T')[0] + 'T12:00:00').toLocaleDateString(
            'en-US',
            { day: 'numeric', month: 'long', year: 'numeric' }
          )
        : null,
    } as const;
  }, [
    currentStepId,
    showId,
    allTrials,
    dogs,
    classes,
    receiptSelectedDogs,
    receiptClassSelections,
    currentShow,
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
      outcomes: entryOutcomes,
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
          dogRegisteredName: styledReceipt.dogRegisteredName,
          dogCallName: styledReceipt.dogCallName,
          classSummary: styledReceipt.classSummary,
          totalFeesFormatted: `$${receiptTotalFees.toFixed(2)}`,
          registrationNumber: registrationNumber ?? null,
          confirmationDateLabel: styledReceipt.confirmationDateLabel,
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
            />
          ) : (
            <DogSelectionStep
              selectedDogs={registrationData.selectedDogs}
              onSelectionChange={onDogSelectionChange}
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
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                No dogs registered yet. Please{' '}
                <Link to="/dogs" className="underline font-medium text-primary">
                  register a dog
                </Link>{' '}
                before entering a show.
              </AlertDescription>
            </Alert>
          )
        ) : (
          <ClassSelectionStep
            selectedDogs={registrationData.selectedDogs}
            classSelections={optimisticState.classSelections}
            onSelectionChange={onClassSelectionChange}
            showId={showId}
            workflowMode={currentWorkflowMode}
            {...(!hasHandlerStep && {
              handlerAssignments: optimisticState.handlerAssignments,
              onHandlerAssignmentChange,
            })}
          />
        ))}

      {currentStepId === 'handler-assignment' && (
        <HandlerAssignmentStep
          selectedDogs={optimisticState.formData.selectedDogs}
          classSelections={optimisticState.classSelections}
          handlerAssignments={optimisticState.handlerAssignments}
          onHandlerAssignmentChange={onHandlerAssignmentChange}
        />
      )}

      {currentStepId === 'payment' && (
        <PaymentErrorBoundary>
          <PaymentStep
            selectedDogs={optimisticState.formData.selectedDogs}
            classSelections={optimisticState.classSelections}
            paymentMethod={optimisticState.formData.paymentMethod || ''}
            paymentStatus={optimisticState.paymentStatus}
            entryStatus={optimisticState.entryStatus}
            onPaymentMethodChange={onPaymentMethodChange}
            onPaymentDetailsChange={onPaymentDetailsChange}
            onPaymentStatusChange={async (status: PaymentStatus) => {
              setPaymentStatus(status);
              if (registrationId) {
                try {
                  await onPaymentStatusChange(registrationId, status);
                } catch (error: unknown) {
                  notifications.error(getErrorMessage(error));
                }
              }
            }}
            onEntryStatusChange={async (status: EntryStatus, reason?: string) => {
              setEntryStatus(status);
              if (registrationId) {
                try {
                  await onEntryStatusChange(registrationId, status, reason);
                } catch (error: unknown) {
                  notifications.error(getErrorMessage(error));
                }
              }
            }}
            showId={showId}
            registrationId={registrationId}
            agreedToEntryAgreement={agreedToEntryAgreement}
            onAgreementChange={onAgreementChange}
            onClassSelectionChange={onClassSelectionChange}
            capacityReady={capacityReady}
            capacityError={capacityError}
            capacityUnavailable={capacityUnavailable}
            onRetryAvailability={onRetryAvailability}
            waitlistClassIds={waitlistClassIds}
            blockedClassIds={blockedClassIds}
          />
        </PaymentErrorBoundary>
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
                  notifications.error(getErrorMessage(error));
                }
              }
            }}
          />
        ))}
    </div>
  );
}
