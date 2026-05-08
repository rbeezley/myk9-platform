import { useMemo } from 'react';
import { DogSelectionStep } from './DogSelectionStep';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';
import { ClassSelectionStep } from './ClassSelectionStep';
import { PaymentStep } from './PaymentStep';
import { ConfirmationStep } from './ConfirmationStep';
import { HandlerAssignmentStep } from './HandlerAssignmentStep';
import { SearchErrorBoundary, PaymentErrorBoundary } from '@/components/common/ErrorBoundary';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { getShowLandingStyle } from '@/features/registries';
import { HeritageEntryReceived } from '@/features/heritage/wizard/HeritageEntryReceived';
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
import { logger } from '@/services/LoggingService';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import type { WorkflowConfig } from './RegistrationWorkflow.types';
import type { ArmbandAssignment } from './ConfirmationStep.types';

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
  registrationData: RegistrationFormData;
  optimisticState: OptimisticRegistrationState;
  showId: string;
  registrationId: string | undefined;
  registrationNumber: string | undefined;
  currentRegistrationTotalFees: number;
  /** Armband assignments from the RPC call */
  armbandAssignments?: ArmbandAssignment[];
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
  /** Current state of the entry agreement checkbox on the payment step. */
  agreedToEntryAgreement?: boolean | undefined;
  /** Callback when the entry agreement checkbox is toggled on the payment step. */
  onAgreementChange?: ((agreed: boolean) => void) | undefined;
}

export function WorkflowStepContent({
  currentStepId,
  currentWorkflowConfig,
  registrationData,
  optimisticState,
  showId,
  registrationId,
  registrationNumber,
  currentRegistrationTotalFees,
  armbandAssignments,
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
  agreedToEntryAgreement,
  onAgreementChange,
}: WorkflowStepContentProps) {
  const hasDogSelectionStep = currentWorkflowConfig.steps.includes('dog-selection');
  const hasHandlerStep = currentWorkflowConfig.steps.includes('handler-assignment');

  // Heritage branch — hooks must be top-level (Rules of Hooks);
  // expensive .find() lookups are memoized and only compute during confirmation step.
  const shows = useShowStore(s => s.shows);
  const allTrials = useTrialStore(s => s.trials);
  const { dogs } = useDogStoreCompat();
  const { classes } = useClassStoreCompat();

  const heritageReceipt = useMemo(() => {
    if (currentStepId !== 'confirmation') return null;
    const currentShow = shows.find(s => s.id === showId);
    const isHeritage = getShowLandingStyle(currentShow) === 'heritage';
    if (!isHeritage) return { isHeritage: false } as const;

    const firstTrial = allTrials.find(t => t.showId === showId);
    const firstDogId = optimisticState.formData.selectedDogs[0];
    const firstDog = dogs.find(d => d.id === firstDogId);
    const firstClassSelection = optimisticState.classSelections.find(s => s.dogId === firstDogId);
    const classSummary =
      firstClassSelection?.selectedClasses
        .map(sc => {
          const cls = classes.find(c => c.id === sc.classId);
          return cls?.className ?? sc.classId;
        })
        .join(', ') ?? '';

    return {
      isHeritage: true,
      showName: currentShow?.name ?? '',
      clubName: currentShow?.clubName ?? currentShow?.name ?? '',
      dateRange: currentShow?.startDate
        ? currentShow.endDate && currentShow.endDate !== currentShow.startDate
          ? `${currentShow.startDate} – ${currentShow.endDate}`
          : currentShow.startDate
        : '',
      dogRegisteredName: firstDog?.registrations?.[0]?.registeredName ?? firstDog?.name ?? '',
      dogCallName: firstDog?.callName ?? null,
      classSummary,
      // Use T12:00:00 (noon) so date-only strings from Postgres never shift a calendar
      // day when parsed as UTC midnight by users west of UTC.
      confirmationDateLabel: firstTrial?.confirmationDate
        ? new Date(firstTrial.confirmationDate + 'T12:00:00').toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : null,
    } as const;
  }, [currentStepId, showId, shows, allTrials, dogs, classes, optimisticState]);
  return (
    <div className="min-h-[300px]">
      {currentStepId === 'dog-selection' && (
        <SearchErrorBoundary>
          {currentWorkflowConfig.features.advancedSearch ? (
            <DogSelectionStepEnhanced
              selectedDogs={registrationData.selectedDogs}
              onSelectionChange={onDogSelectionChange}
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
                <a href="/dogs" className="underline font-medium text-primary">
                  register a dog
                </a>{' '}
                before entering a show.
              </AlertDescription>
            </Alert>
          )
        ) : (
          <ClassSelectionStep
            selectedDogs={optimisticState.formData.selectedDogs}
            classSelections={optimisticState.classSelections}
            onSelectionChange={onClassSelectionChange}
            showId={showId}
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
          />
        </PaymentErrorBoundary>
      )}

      {currentStepId === 'confirmation' &&
        (heritageReceipt?.isHeritage ? (
          <HeritageEntryReceived
            showName={heritageReceipt.showName}
            clubName={heritageReceipt.clubName}
            dateRange={heritageReceipt.dateRange}
            dogRegisteredName={heritageReceipt.dogRegisteredName}
            dogCallName={heritageReceipt.dogCallName}
            classSummary={heritageReceipt.classSummary}
            totalFeesFormatted={`$${currentRegistrationTotalFees.toFixed(2)}`}
            registrationNumber={registrationNumber ?? null}
            confirmationDateLabel={heritageReceipt.confirmationDateLabel}
            onPrintEntryBlank={() =>
              notifications.info('Entry blank', {
                description:
                  'A printable entry blank will be available after the draw is complete.',
              })
            }
          />
        ) : (
          <ConfirmationStep
            registrationNumber={registrationNumber}
            selectedDogs={optimisticState.formData.selectedDogs}
            classSelections={optimisticState.classSelections}
            documents={optimisticState.formData.documents}
            paymentMethod={optimisticState.formData.paymentMethod || ''}
            paymentStatus={optimisticState.paymentStatus}
            entryStatus={optimisticState.entryStatus}
            totalFees={currentRegistrationTotalFees}
            showId={showId}
            armbandAssignments={armbandAssignments}
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
            onNotificationToggle={(type, enabled) => {
              logger.debug(`Notification ${type}: ${enabled}`, 'shows', {});
            }}
          />
        ))}
    </div>
  );
}
