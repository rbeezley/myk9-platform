import { makePaymentResolution } from '@/test/utils/paymentResolution';
/**
 * MYK9-1059 — the wizard's own show id is what reaches the dog step, in both the
 * advanced and the simple variants. Real WorkflowStepContent, stubbed leaves.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { WorkflowConfig } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';

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
vi.mock('@/components/shows/RegistrationWorkflow/DogSelectionStep', () => ({
  DogSelectionStep: (props: { createdFromShowId?: string }) => (
    <div data-testid="simple">{props.createdFromShowId}</div>
  ),
}));
vi.mock('@/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced', () => ({
  DogSelectionStepEnhanced: (props: { createdFromShowId?: string }) => (
    <div data-testid="enhanced">{props.createdFromShowId}</div>
  ),
}));

mockUseShowStore.mockImplementation(() => []);
mockUseTrialStore.mockImplementation(() => []);
mockUseDogStoreCompat.mockReturnValue({ dogs: [] });
mockUseClassStoreCompat.mockReturnValue({ classes: [] });

import { WorkflowStepContent } from '@/components/shows/RegistrationWorkflow/WorkflowStepContent';

const config = (advancedSearch: boolean): WorkflowConfig => ({
  steps: ['dog-selection', 'class-selection'],
  features: {
    bulkSelection: false,
    createNew: true,
    advancedSearch,
    handlerAssignment: false,
    paymentOverride: false,
    statusManagement: false,
  },
  smartDefaults: {
    autoAssignHandler: false,
    autoCalculateFees: false,
    delayRegistrationCreation: false,
  },
});

function props(advancedSearch: boolean) {
  return {
    currentStepId: 'dog-selection',
    currentWorkflowConfig: config(advancedSearch),
    currentWorkflowMode: 'secretary' as never,
    registrationData: { selectedDogs: [], classSelections: [], handlerAssignments: {} } as never,
    optimisticState: {
      formData: { selectedDogs: [] } as never,
      classSelections: [],
      handlerAssignments: {},
      paymentStatus: 'pending' as never,
      entryStatus: 'pending' as never,
    },
    showId: 'show-xyz',
    registrationId: undefined,
    registrationNumber: undefined,
    currentRegistrationTotalFees: 0,
    onDogSelectionChange: vi.fn(),
    onClassSelectionChange: vi.fn(),
    onHandlerAssignmentChange: vi.fn(),
    onPaymentMethodChange: vi.fn(),
    onPaymentStatusChange: vi.fn(),
    onEntryStatusChange: vi.fn(),
    setPaymentStatus: vi.fn(),
    setEntryStatus: vi.fn(),
  };
}

describe('WorkflowStepContent createdFromShowId', () => {
  it('gives the advanced dog step the wizard show id', () => {
    render(<WorkflowStepContent {...props(true)} paymentResolution={makePaymentResolution()} />);
    expect(screen.getByTestId('enhanced')).toHaveTextContent('show-xyz');
  });

  it('gives the simple dog step the wizard show id', () => {
    render(<WorkflowStepContent {...props(false)} paymentResolution={makePaymentResolution()} />);
    expect(screen.getByTestId('simple')).toHaveTextContent('show-xyz');
  });
});
