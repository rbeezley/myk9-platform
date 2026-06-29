import { describe, it, expect } from 'vitest';
import { buildDraftFormData, type BuildDraftFormDataInput } from './buildDraftFormData';
import {
  PaymentStatus,
  EntryStatus,
  type RegistrationFormData,
  type ClassSelectionData,
  type HandlerInfo,
} from '@/types/show-registration-types';

const registrationData: RegistrationFormData = {
  selectedDogs: ['dog-1', 'dog-2'],
  entries: [],
  documents: [],
  paymentMethod: 'check',
  specialRequests: 'Ringside crating please',
};

const classSelections: ClassSelectionData[] = [
  { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
];

const handlerAssignments: Record<string, HandlerInfo> = {
  'dog-1|class-1': { handlerId: 'owner-1', handlerName: 'Pat Owner', isOwner: true },
};

function input(overrides: Partial<BuildDraftFormDataInput> = {}): BuildDraftFormDataInput {
  return {
    registrationData,
    currentStepId: 'payment',
    stepCompletionState: { 'class-selection': true },
    classSelections,
    handlerAssignments,
    paymentStatus: PaymentStatus.PENDING,
    entryStatus: EntryStatus.PENDING,
    ...overrides,
  };
}

describe('buildDraftFormData', () => {
  it('copies the user-facing fields verbatim', () => {
    const result = buildDraftFormData(input());
    expect(result.selectedDogs).toEqual(['dog-1', 'dog-2']);
    expect(result.entries).toEqual([]);
    expect(result.paymentMethod).toBe('check');
    expect(result.specialRequests).toBe('Ringside crating please');
  });

  it('does NOT copy `documents` into the draft payload', () => {
    // documents are File objects — not serializable into a draft snapshot.
    const result = buildDraftFormData(input());
    expect('documents' in result).toBe(false);
  });

  it('wraps stepper state in the _workflowState envelope', () => {
    const result = buildDraftFormData(input());
    expect(result._workflowState).toEqual({
      currentStep: 'payment',
      stepCompletionState: { 'class-selection': true },
      classSelections,
      handlerAssignments,
      paymentStatus: PaymentStatus.PENDING,
      entryStatus: EntryStatus.PENDING,
    });
  });

  it('threads the current step id through as the resume point', () => {
    const result = buildDraftFormData(input({ currentStepId: 'class-selection' }));
    expect(result._workflowState?.currentStep).toBe('class-selection');
  });

  it('preserves non-pending statuses', () => {
    const result = buildDraftFormData(
      input({ paymentStatus: PaymentStatus.PAID_BY_CHECK, entryStatus: EntryStatus.ACCEPTED })
    );
    expect(result._workflowState?.paymentStatus).toBe(PaymentStatus.PAID_BY_CHECK);
    expect(result._workflowState?.entryStatus).toBe(EntryStatus.ACCEPTED);
  });
});
