import { DogSelectionStep } from './DogSelectionStep';
import { DogSelectionStepEnhanced } from './DogSelectionStepEnhanced';
import { ClassSelectionStep } from './ClassSelectionStep';
import { PaymentStep } from './PaymentStep';
import { ConfirmationStep } from './ConfirmationStep';
import { HandlerAssignmentStep } from './HandlerAssignmentStep';
import { SearchErrorBoundary, PaymentErrorBoundary } from '@/components/common/ErrorBoundary';
import {
  ClassSelectionData,
  RegistrationFormData,
  HandlerInfo,
  PaymentStatus,
  EntryStatus,
} from '@/types/show-registration-types';
import type { PaymentMethod } from '@/types/show-registration-types';
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
  onDogSelectionChange: (dogs: string[]) => Promise<void>;
  onClassSelectionChange: (selections: ClassSelectionData[]) => Promise<void>;
  onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => Promise<void>;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onPaymentStatusChange: (registrationId: string, status: PaymentStatus) => Promise<unknown>;
  onEntryStatusChange: (
    registrationId: string,
    status: EntryStatus,
    reason?: string
  ) => Promise<unknown>;
  setPaymentStatus: (status: PaymentStatus) => void;
  setEntryStatus: (status: EntryStatus) => void;
  /** True while dogs are loading (used for auto-select loading state) */
  dogsLoading?: boolean;
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
  onPaymentStatusChange,
  onEntryStatusChange,
  setPaymentStatus,
  setEntryStatus,
  dogsLoading,
}: WorkflowStepContentProps) {
  const hasDogSelectionStep = currentWorkflowConfig.steps.includes('dog-selection');
  const hasHandlerStep = currentWorkflowConfig.steps.includes('handler-assignment');
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
          />
        </PaymentErrorBoundary>
      )}

      {currentStepId === 'confirmation' && (
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
      )}
    </div>
  );
}
