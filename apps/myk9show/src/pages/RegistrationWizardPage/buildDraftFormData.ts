/**
 * Pure builder for the draft-persistence payload.
 *
 * The wizard mirrors its live state into the draft store on every change so a
 * reload (or the 30s autosave) can restore exactly where the user left off. The
 * shape is an envelope: the user-facing fields (`selectedDogs`, `entries`, …)
 * alongside an opaque `_workflowState` snapshot used only to rehydrate the
 * stepper. Keeping this construction pure lets us pin the envelope shape in a
 * unit test rather than asserting against a rendered effect.
 */

import type {
  RegistrationFormData,
  ClassSelectionData,
  HandlerInfo,
  PaymentStatus,
  EntryStatus,
} from '@/types/show-registration-types';
import type { StepId } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';

export interface BuildDraftFormDataInput {
  registrationData: RegistrationFormData;
  currentStepId: StepId;
  stepCompletionState: Record<string, boolean>;
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  paymentStatus: PaymentStatus;
  entryStatus: EntryStatus;
}

export function buildDraftFormData(input: BuildDraftFormDataInput): Partial<RegistrationFormData> {
  return {
    selectedDogs: input.registrationData.selectedDogs,
    entries: input.registrationData.entries,
    paymentMethod: input.registrationData.paymentMethod,
    specialRequests: input.registrationData.specialRequests,
    _workflowState: {
      currentStep: input.currentStepId,
      stepCompletionState: input.stepCompletionState,
      classSelections: input.classSelections,
      handlerAssignments: input.handlerAssignments,
      paymentStatus: input.paymentStatus,
      entryStatus: input.entryStatus,
    },
  };
}
