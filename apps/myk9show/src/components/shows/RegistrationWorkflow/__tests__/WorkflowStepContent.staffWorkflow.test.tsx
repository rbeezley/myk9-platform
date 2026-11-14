/**
 * MYK9-2020: the secretary's wizard says on the Classes step that Next skips
 * Handlers when every dog is handled by its owner, and tells the Payment step it
 * is the staff workflow. The exhibitor's wizard gets neither.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { makePaymentResolution } from '@/test/utils/paymentResolution';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import { WORKFLOW_CONFIGS } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.constants';
import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';

const { mockUseShowStore, mockUseTrialStore, mockUseDogStoreCompat, mockUseClassStoreCompat } =
  vi.hoisted(() => ({
    mockUseShowStore: vi.fn(),
    mockUseTrialStore: vi.fn(),
    mockUseDogStoreCompat: vi.fn(),
    mockUseClassStoreCompat: vi.fn(),
  }));

vi.mock('@/store/showStore', () => ({ useShowStore: mockUseShowStore }));
vi.mock('@/store/trialStore', () => ({ useTrialStore: mockUseTrialStore }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: mockUseDogStoreCompat }));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: mockUseClassStoreCompat }));
vi.mock('@/components/shows/RegistrationWorkflow/ClassSelectionStep', () => ({
  ClassSelectionStep: () => <div data-testid="class-selection-step" />,
}));
vi.mock('@/components/shows/RegistrationWorkflow/PaymentStep', () => ({
  PaymentStep: (props: { staffWorkflow?: boolean }) => (
    <div data-testid="payment-step" data-staff={String(props.staffWorkflow)} />
  ),
}));

mockUseShowStore.mockImplementation(() => []);
mockUseTrialStore.mockImplementation(() => []);
mockUseDogStoreCompat.mockReturnValue({ dogs: [] });
mockUseClassStoreCompat.mockReturnValue({ classes: [] });

import { WorkflowStepContent } from '@/components/shows/RegistrationWorkflow/WorkflowStepContent';

const classSelections: ClassSelectionData[] = [
  { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
];
const OWNER: HandlerInfo = { handlerId: 'p-1', handlerName: 'Pat Owner', isOwner: true };
const OTHER: HandlerInfo = { handlerId: 'p-2', handlerName: 'Sam Handler', isOwner: false };
const NOTE = /Each dog is handled by its owner, so Next goes straight to Payment/;

function renderStep(stepId: string, mode: WorkflowMode, handler: HandlerInfo) {
  const handlerAssignments = { 'dog-1|class-1': handler };
  return render(
    <WorkflowStepContent
      paymentResolution={makePaymentResolution()}
      currentStepId={stepId}
      currentWorkflowConfig={WORKFLOW_CONFIGS[mode]}
      currentWorkflowMode={mode}
      registrationData={{ selectedDogs: ['dog-1'], entries: [], documents: [] }}
      optimisticState={{
        formData: { selectedDogs: ['dog-1'] } as never,
        classSelections,
        handlerAssignments,
        paymentStatus: 'pending' as never,
        entryStatus: 'pending' as never,
      }}
      showId="show-1"
      registrationId="reg-1"
      registrationNumber="100"
      currentRegistrationTotalFees={0}
      onDogSelectionChange={vi.fn()}
      onClassSelectionChange={vi.fn()}
      onHandlerAssignmentChange={vi.fn()}
      onPaymentMethodChange={vi.fn()}
      onEntryStatusChange={vi.fn()}
      setEntryStatus={vi.fn()}
    />
  );
}

describe('WorkflowStepContent in the secretary workflow (MYK9-2020)', () => {
  it('says on the Classes step that Next skips Handlers when the owner handles every dog', () => {
    renderStep('class-selection', 'secretary_new', OWNER);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('says nothing when a dog has another handler, because Next stops on Handlers', () => {
    renderStep('class-selection', 'secretary_new', OTHER);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("never shows the note in the exhibitor's wizard, which has no Handlers step", () => {
    renderStep('class-selection', 'exhibitor', OWNER);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('tells the Payment step it is the staff workflow, and the exhibitor step that it is not', () => {
    const { unmount } = renderStep('payment', 'secretary_new', OWNER);
    expect(screen.getByTestId('payment-step')).toHaveAttribute('data-staff', 'true');
    unmount();
    renderStep('payment', 'exhibitor', OWNER);
    expect(screen.getByTestId('payment-step')).toHaveAttribute('data-staff', 'false');
  });
});
