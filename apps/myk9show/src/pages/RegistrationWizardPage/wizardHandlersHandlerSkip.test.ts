/**
 * MYK9-2020: Next on Classes goes straight to Payment in the staff wizard when
 * every dog is handled by its owner, and the skipped Handlers step is marked
 * complete so it stays reachable (Back from Payment, or the rail).
 *
 * Mutation check: drop `canSkipHandlerStep` from the generic advance in
 * `wizardHandlers.ts` and the first case goes red (the step moves by 1).
 */

import { describe, expect, it, vi } from 'vitest';
import { createWizardHandlers } from './wizardHandlers';
import type { RegistrationWizardState } from './useRegistrationWizardState';
import { WORKFLOW_CONFIGS } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.constants';

vi.mock('./submitPaymentStep', () => ({ submitPaymentStep: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const SELECTIONS = [{ dogId: 'd1', selectedClasses: [{ classId: 'c1' }] }];
const OWNER = { handlerId: 'p1', handlerName: 'Pat Owner', isOwner: true };
const OTHER = { handlerId: 'p2', handlerName: 'Sam Handler', isOwner: false };

function run(mode: 'secretary_new' | 'exhibitor', handler: typeof OWNER) {
  const setCurrentStep = vi.fn();
  const markStepComplete = vi.fn();
  const state = {
    currentStepId: 'class-selection',
    currentStep: 1,
    currentWorkflowConfig: WORKFLOW_CONFIGS[mode],
    canProceed: () => true,
    isLastStep: false,
    submittingRef: { current: false },
    classSelections: SELECTIONS,
    handlerAssignments: { 'd1|c1': handler },
    setCurrentStep,
    markStepComplete,
  } as unknown as RegistrationWizardState;
  void createWizardHandlers(state).handleNext();
  const updater = setCurrentStep.mock.calls[0]?.[0] as (prev: number) => number;
  return { nextStep: updater(1), completed: markStepComplete.mock.calls.map(call => call[0]) };
}

describe('handleNext: the Handlers step when every dog is handled by its owner (MYK9-2020)', () => {
  it('goes from Classes straight to Payment and marks Handlers complete', () => {
    const { nextStep, completed } = run('secretary_new', OWNER);
    expect(WORKFLOW_CONFIGS.secretary_new.steps[nextStep]).toBe('payment');
    expect(completed).toEqual([1, 2]);
  });

  it('stops on Handlers when a dog has another handler', () => {
    const { nextStep, completed } = run('secretary_new', OTHER);
    expect(WORKFLOW_CONFIGS.secretary_new.steps[nextStep]).toBe('handler-assignment');
    expect(completed).toEqual([1]);
  });

  it('leaves the exhibitor wizard, which has no Handlers step, as it was', () => {
    const { nextStep } = run('exhibitor', OWNER);
    expect(WORKFLOW_CONFIGS.exhibitor.steps[nextStep]).toBe('payment');
    expect(nextStep).toBe(2);
  });
});
