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
import { toast } from 'sonner';
import { logger } from '@/services/LoggingService';
import type { WorkflowConfig } from './RegistrationWorkflow.types';

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
  onDogSelectionChange: (dogs: string[]) => Promise<void>;
  onClassSelectionChange: (selections: ClassSelectionData[]) => Promise<void>;
  onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => Promise<void>;
  onPaymentMethodChange: (method: string) => void;
  onPaymentStatusChange: (registrationId: string, status: PaymentStatus) => Promise<unknown>;
  onEntryStatusChange: (
    registrationId: string,
    status: EntryStatus,
    reason?: string
  ) => Promise<unknown>;
  setPaymentStatus: (status: PaymentStatus) => void;
  setEntryStatus: (status: EntryStatus) => void;
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
  onDogSelectionChange,
  onClassSelectionChange,
  onHandlerAssignmentChange,
  onPaymentMethodChange,
  onPaymentStatusChange,
  onEntryStatusChange,
  setPaymentStatus,
  setEntryStatus,
}: WorkflowStepContentProps) {
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

      {currentStepId === 'class-selection' && (
        <ClassSelectionStep
          selectedDogs={optimisticState.formData.selectedDogs}
          classSelections={optimisticState.classSelections}
          onSelectionChange={onClassSelectionChange}
          showId={showId}
        />
      )}

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
                  const errorMessage =
                    error instanceof Error ? error.message : 'Failed to update payment status';
                  toast.error(errorMessage);
                }
              }
            }}
            onEntryStatusChange={async (status: EntryStatus, reason?: string) => {
              setEntryStatus(status);
              if (registrationId) {
                try {
                  await onEntryStatusChange(registrationId, status, reason);
                } catch (error: unknown) {
                  const errorMessage =
                    error instanceof Error ? error.message : 'Failed to update entry status';
                  toast.error(errorMessage);
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
          onDownloadReceipt={() => logger.debug('Download receipt', 'shows')}
          onSendEmail={() => logger.debug('Send email', 'shows')}
          onStatusChange={async (_dogId: string, status: EntryStatus) => {
            setEntryStatus(status);
            if (registrationId) {
              try {
                await onEntryStatusChange(registrationId, status);
              } catch (error: unknown) {
                const errorMessage =
                  error instanceof Error ? error.message : 'Failed to update entry status';
                toast.error(errorMessage);
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
