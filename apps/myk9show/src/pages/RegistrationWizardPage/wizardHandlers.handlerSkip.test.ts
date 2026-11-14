/**
 * MYK9-2020: a secretary keys in forty forms in a row, and on almost every one
 * each dog is handled by its owner. Next from Classes then goes straight to
 * Payment (the Handlers step is marked done, so the rail still opens it), and
 * Back from Payment returns to Classes.
 */
import { describe, expect, it, vi } from 'vitest';
import { createWizardHandlers } from './wizardHandlers';
import type { RegistrationWizardState } from './useRegistrationWizardState';
import { WORKFLOW_CONFIGS } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.constants';

vi.mock('./submitPaymentStep', () => ({ submitPaymentStep: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const STEPS = WORKFLOW_CONFIGS.secretary_new.steps;
const CLASS_STEP = STEPS.indexOf('class-selection');
const HANDLER_STEP = STEPS.indexOf('handler-assignment');
const PAYMENT_STEP = STEPS.indexOf('payment');

function stateAt(stepIndex: number, handlerIsOwner: boolean) {
  let step = stepIndex;
  const setCurrentStep = vi.fn((next: number | ((prev: number) => number)) => {
    step = typeof next === 'function' ? next(step) : next;
  });
  const markStepComplete = vi.fn();
  const state = {
    currentStepId: STEPS[stepIndex],
    currentStep: stepIndex,
    currentWorkflowConfig: WORKFLOW_CONFIGS.secretary_new,
    canProceed: () => true,
    isLastStep: false,
    submittingRef: { current: false },
    classSelections: [{ dogId: 'dog-1', selectedClasses: [{ classId: 'c1' }] }],
    handlerAssignments: {
      'dog-1|c1': { handlerId: 'p-1', handlerName: 'Pat Owner', isOwner: handlerIsOwner },
    },
    setCurrentStep,
    markStepComplete,
  } as unknown as RegistrationWizardState;
  return { handlers: createWizardHandlers(state), step: () => step, markStepComplete };
}

describe('the secretary Handlers step when owners handle every dog (MYK9-2020)', () => {
  it('Next from Classes lands on Payment and marks Handlers done', async () => {
    const { handlers, step, markStepComplete } = stateAt(CLASS_STEP, true);
    await handlers.handleNext();
    expect(step()).toBe(PAYMENT_STEP);
    expect(markStepComplete).toHaveBeenCalledWith(CLASS_STEP);
    expect(markStepComplete).toHaveBeenCalledWith(HANDLER_STEP);
  });

  it('Back from Payment returns to Classes', () => {
    const { handlers, step } = stateAt(PAYMENT_STEP, true);
    handlers.handleBack();
    expect(step()).toBe(CLASS_STEP);
  });

  it('stops on Handlers when a dog has someone else handling it', async () => {
    const { handlers, step, markStepComplete } = stateAt(CLASS_STEP, false);
    await handlers.handleNext();
    expect(step()).toBe(HANDLER_STEP);
    expect(markStepComplete).not.toHaveBeenCalledWith(HANDLER_STEP);

    const back = stateAt(PAYMENT_STEP, false);
    back.handlers.handleBack();
    expect(back.step()).toBe(HANDLER_STEP);
  });
});
