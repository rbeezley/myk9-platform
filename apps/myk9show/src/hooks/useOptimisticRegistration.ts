import { useCallback } from 'react';
import { useOptimisticUpdates } from './useOptimisticUpdates';
import { useShowRegistrationStore } from '../store/showRegistrationStore';
import {
  RegistrationFormData,
  ClassSelectionData,
  HandlerInfo,
  PaymentStatus,
  EntryStatus,
} from '../types/show-registration-types';
import { toast } from 'sonner';

export interface RegistrationState {
  formData: RegistrationFormData;
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  paymentStatus: PaymentStatus;
  entryStatus: EntryStatus;
  stepCompletionState: Record<string, boolean>;
}

/**
 * Hook for managing optimistic updates in the registration workflow
 */
export function useOptimisticRegistration(showId: string, initialState: RegistrationState) {
  const { createRegistration, updatePaymentStatus, updateEntryStatus, submitRegistration } =
    useShowRegistrationStore();

  const {
    data: registrationState,
    executeOptimisticUpdate,
    rollbackUpdate,
    rollbackAll,
    isLoading,
    hasOptimisticChanges,
    pendingUpdatesCount,
  } = useOptimisticUpdates(initialState, {
    requestTimeout: 30000,
    maxConcurrentUpdates: 5,
    autoRetry: true,
    maxRetries: 2,
    showNotifications: false, // Disable global notifications, handle individually
    debug: process.env.NODE_ENV === 'development',
  });

  // Update dog selection optimistically
  const updateDogSelection = useCallback(
    async (selectedDogs: string[]) => {
      const optimisticState = {
        ...registrationState,
        formData: {
          ...registrationState.formData,
          selectedDogs,
        },
      };

      return executeOptimisticUpdate(
        'Update Dog Selection',
        optimisticState,
        async () => {
          // Simulate API call delay for demo
          await new Promise(resolve => setTimeout(resolve, 1000));

          // In real implementation, this would save to backend
          return { success: true, selectedDogs };
        },
        {}
      );
    },
    [registrationState, executeOptimisticUpdate]
  );

  // Update class selections optimistically
  const updateClassSelections = useCallback(
    async (classSelections: ClassSelectionData[]) => {
      const optimisticState = {
        ...registrationState,
        classSelections,
      };

      return executeOptimisticUpdate(
        'Update Class Selections',
        optimisticState,
        async () => {
          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 1500));

          const totalClasses = classSelections.reduce(
            (total, selection) => total + selection.selectedClasses.length,
            0
          );

          return { success: true, classSelections, totalClasses };
        },
        {
          onSuccess: (result: unknown) => {
            const typedResult = result as { totalClasses: number; [key: string]: unknown };
            toast.success('Class selections saved', {
              description: `${typedResult.totalClasses} class${typedResult.totalClasses !== 1 ? 'es' : ''} selected`,
            });
          },
        }
      );
    },
    [registrationState, executeOptimisticUpdate]
  );

  // Update handler assignments optimistically
  const updateHandlerAssignments = useCallback(
    async (handlerAssignments: Record<string, HandlerInfo>) => {
      const optimisticState = {
        ...registrationState,
        handlerAssignments,
      };

      return executeOptimisticUpdate(
        'Update Handler Assignments',
        optimisticState,
        async () => {
          await new Promise(resolve => setTimeout(resolve, 800));

          // Validate handlers
          const validationResults = await Promise.all(
            Object.entries(handlerAssignments).map(async ([dogId, handler]) => {
              // Simulate handler validation
              return { dogId, handlerId: handler.handlerId, valid: true };
            })
          );

          return { success: true, handlerAssignments, validationResults };
        },
        {
          onSuccess: (result: unknown) => {
            const typedResult = result as {
              validationResults: Array<{ valid: boolean; [key: string]: unknown }>;
              [key: string]: unknown;
            };
            const validCount = typedResult.validationResults.filter(
              (r: { valid: boolean }) => r.valid
            ).length;
            toast.success('Handler assignments updated', {
              description: `${validCount} handlers validated`,
            });
          },
        }
      );
    },
    [registrationState, executeOptimisticUpdate]
  );

  // Update payment status optimistically
  const updatePaymentStatusOptimistic = useCallback(
    async (registrationId: string, newPaymentStatus: PaymentStatus, paymentReference?: string) => {
      const optimisticState = {
        ...registrationState,
        paymentStatus: newPaymentStatus,
        formData: {
          ...registrationState.formData,
          paymentReference,
        },
      };

      return executeOptimisticUpdate(
        'Update Payment Status',
        optimisticState,
        async () => {
          // Call the actual store method
          await updatePaymentStatus(registrationId, newPaymentStatus, paymentReference);

          // Simulate payment processing delay
          if (newPaymentStatus === PaymentStatus.PAID_ONLINE) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }

          return { success: true, paymentStatus: newPaymentStatus, paymentReference };
        },
        {
          onSuccess: (result: unknown) => {
            const typedResult = result as {
              paymentStatus: PaymentStatus;
              paymentReference?: string;
              [key: string]: unknown;
            };
            if (typedResult.paymentStatus === PaymentStatus.PAID_ONLINE) {
              toast.success('Payment processed successfully', {
                description: `Reference: ${typedResult.paymentReference}`,
              });
            }
          },
          onError: () => {
            if (newPaymentStatus === PaymentStatus.PAID_ONLINE) {
              toast.error('Payment processing failed', {
                description: 'Please try again or contact support',
              });
            }
          },
        }
      );
    },
    [registrationState, executeOptimisticUpdate, updatePaymentStatus]
  );

  // Update entry status optimistically
  const updateEntryStatusOptimistic = useCallback(
    async (registrationId: string, newEntryStatus: EntryStatus, reason?: string) => {
      const optimisticState = {
        ...registrationState,
        entryStatus: newEntryStatus,
      };

      return executeOptimisticUpdate(
        'Update Entry Status',
        optimisticState,
        async () => {
          await updateEntryStatus(registrationId, newEntryStatus, reason);
          return { success: true, entryStatus: newEntryStatus, reason };
        },
        {
          onSuccess: (result: unknown) => {
            const typedResult = result as {
              entryStatus: EntryStatus;
              reason?: string;
              [key: string]: unknown;
            };
            const statusText = typedResult.entryStatus.replace('_', ' ').toLowerCase();
            toast.success(`Entry ${statusText}`, {
              description: typedResult.reason || 'Status updated successfully',
            });
          },
        }
      );
    },
    [registrationState, executeOptimisticUpdate, updateEntryStatus]
  );

  // Complete step optimistically
  const completeStep = useCallback(
    async (stepId: string) => {
      const optimisticState = {
        ...registrationState,
        stepCompletionState: {
          ...registrationState.stepCompletionState,
          [stepId]: true,
        },
      };

      return executeOptimisticUpdate(
        'Complete Step',
        optimisticState,
        async () => {
          await new Promise(resolve => setTimeout(resolve, 500));
          return { success: true, stepId, completed: true };
        },
        {}
      );
    },
    [registrationState, executeOptimisticUpdate]
  );

  // Submit registration optimistically
  const submitRegistrationOptimistic = useCallback(
    async (registrationId: string) => {
      return executeOptimisticUpdate(
        'Submit Registration',
        registrationState, // No immediate state change for submission
        async () => {
          await submitRegistration(registrationId);

          // Simulate submission processing
          await new Promise(resolve => setTimeout(resolve, 2000));

          return { success: true, registrationId, status: 'submitted' };
        },
        {
          onSuccess: () => {
            toast.success('Registration submitted successfully', {
              description: 'You will receive a confirmation email shortly',
            });
          },
          onError: () => {
            toast.error('Failed to submit registration', {
              description: 'Please check your information and try again',
            });
          },
        }
      );
    },
    [registrationState, executeOptimisticUpdate, submitRegistration]
  );

  // Create registration optimistically
  const createRegistrationOptimistic = useCallback(
    async (userId: string, createdByUserId?: string) => {
      return executeOptimisticUpdate(
        'Create Registration',
        registrationState,
        async () => {
          const registration = createRegistration(showId, userId, createdByUserId);

          // Simulate creation delay
          await new Promise(resolve => setTimeout(resolve, 1000));

          return registration;
        },
        {
          onSuccess: (result: unknown) => {
            const typedResult = result as {
              registrationNumber?: string;
              id: string;
              [key: string]: unknown;
            };
            toast.success('Registration created', {
              description: `Registration #${typedResult.registrationNumber || typedResult.id.slice(0, 8)}`,
            });
          },
        }
      );
    },
    [registrationState, executeOptimisticUpdate, createRegistration, showId]
  );

  // Batch update multiple aspects
  const batchUpdate = useCallback(
    async (updates: Partial<RegistrationState>) => {
      const optimisticState = {
        ...registrationState,
        ...updates,
      };

      const updateTypes = Object.keys(updates);

      return executeOptimisticUpdate(
        `Batch Update (${updateTypes.join(', ')})`,
        optimisticState,
        async () => {
          // Simulate batch save
          await new Promise(resolve => setTimeout(resolve, 1500));

          return { success: true, updates: updateTypes };
        },
        {
          onSuccess: (result: unknown) => {
            const typedResult = result as { updates: string[]; [key: string]: unknown };
            toast.success('Changes saved', {
              description: `Updated: ${typedResult.updates.join(', ')}`,
            });
          },
        }
      );
    },
    [registrationState, executeOptimisticUpdate]
  );

  return {
    // Current state
    registrationState,

    // Optimistic operations
    updateDogSelection,
    updateClassSelections,
    updateHandlerAssignments,
    updatePaymentStatus: updatePaymentStatusOptimistic,
    updateEntryStatus: updateEntryStatusOptimistic,
    completeStep,
    submitRegistration: submitRegistrationOptimistic,
    createRegistration: createRegistrationOptimistic,
    batchUpdate,

    // Management
    rollbackUpdate,
    rollbackAll,

    // Status
    isLoading,
    hasOptimisticChanges,
    pendingUpdatesCount,

    // Computed state
    hasUnsavedChanges: hasOptimisticChanges,
    isProcessing: isLoading,
  };
}
