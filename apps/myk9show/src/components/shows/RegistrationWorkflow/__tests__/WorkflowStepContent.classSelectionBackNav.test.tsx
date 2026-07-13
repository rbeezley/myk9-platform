/**
 * Codex review finding (PR #1298): after a submission where every entry was
 * denied or waitlisted, navigating back to class-selection must still show
 * the exhibitor's ORIGINAL selections (so they can pick an alternative
 * class), not the outcome-filtered "created only" list used for the
 * confirmation/receipt view.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { ClassSelectionData } from '@/types/show-registration-types';
import type { EntrySubmissionOutcome } from '@/services/database/entries/writes';
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

vi.mock('@/components/shows/RegistrationWorkflow/ClassSelectionStep', () => ({
  ClassSelectionStep: (props: {
    selectedDogs: string[];
    classSelections: ClassSelectionData[];
  }) => (
    <div data-testid="class-selection-step">
      <div data-testid="selected-dogs">{JSON.stringify(props.selectedDogs)}</div>
      <div data-testid="class-selections">{JSON.stringify(props.classSelections)}</div>
    </div>
  ),
}));

vi.mock('@/components/shows/RegistrationWorkflow/DogSelectionStep', () => ({
  DogSelectionStep: () => <div data-testid="dog-selection-step" />,
}));
vi.mock('@/components/shows/RegistrationWorkflow/DogSelectionStepEnhanced', () => ({
  DogSelectionStepEnhanced: () => <div data-testid="dog-selection-step-enhanced" />,
}));
vi.mock('@/components/shows/RegistrationWorkflow/PaymentStep', () => ({
  PaymentStep: () => <div data-testid="payment-step" />,
}));
vi.mock('@/components/shows/RegistrationWorkflow/ConfirmationStep', () => ({
  ConfirmationStep: () => <div data-testid="confirmation-step" />,
}));
vi.mock('@/components/shows/RegistrationWorkflow/HandlerAssignmentStep', () => ({
  HandlerAssignmentStep: () => <div data-testid="handler-assignment-step" />,
}));

mockUseShowStore.mockImplementation(() => []);
mockUseTrialStore.mockImplementation(() => []);
mockUseDogStoreCompat.mockReturnValue({ dogs: [] });
mockUseClassStoreCompat.mockReturnValue({ classes: [] });

import { WorkflowStepContent } from '@/components/shows/RegistrationWorkflow/WorkflowStepContent';

const workflowConfig: WorkflowConfig = {
  steps: ['class-selection', 'payment', 'confirmation'],
  features: {
    bulkSelection: false,
    createNew: false,
    advancedSearch: false,
    handlerAssignment: false,
    paymentOverride: false,
    statusManagement: false,
  },
  smartDefaults: {
    autoAssignHandler: false,
    autoCalculateFees: false,
    delayRegistrationCreation: false,
  },
};

const originalClassSelections: ClassSelectionData[] = [
  { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
  { dogId: 'dog-2', trialId: 'trial-1', selectedClasses: [{ classId: 'class-2' }] },
];

// Both entries were denied/waitlisted — nothing has outcome 'created'.
const deniedAndWaitlistedOutcomes: EntrySubmissionOutcome[] = [
  {
    dogId: 'dog-1',
    classId: 'class-1',
    outcome: 'denied',
    entryId: null,
    waitlistEntryId: null,
    feeCents: 0,
    capacityOverride: false,
  },
  {
    dogId: 'dog-2',
    classId: 'class-2',
    outcome: 'waitlisted',
    entryId: null,
    waitlistEntryId: 'wl-1',
    feeCents: 0,
    capacityOverride: false,
  },
];

function baseProps() {
  return {
    currentStepId: 'class-selection',
    currentWorkflowConfig: workflowConfig,
    currentWorkflowMode: 'exhibitor' as const,
    registrationData: {
      selectedDogs: ['dog-1', 'dog-2'],
      classSelections: originalClassSelections,
      handlerAssignments: {},
      paymentMethod: '',
    } as never,
    optimisticState: {
      formData: { selectedDogs: ['dog-1', 'dog-2'] } as never,
      classSelections: originalClassSelections,
      handlerAssignments: {},
      paymentStatus: 'pending' as never,
      entryStatus: 'pending' as never,
    },
    showId: 'show-1',
    registrationId: 'reg-1',
    registrationNumber: '100',
    currentRegistrationTotalFees: 0,
    entryOutcomes: deniedAndWaitlistedOutcomes,
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

describe('WorkflowStepContent — class-selection back-navigation after denial/waitlist', () => {
  it('passes the original (unfiltered) selected dogs to ClassSelectionStep, not the created-only receipt list', () => {
    render(<WorkflowStepContent {...baseProps()} />);

    const selectedDogs = JSON.parse(screen.getByTestId('selected-dogs').textContent ?? '[]');
    expect(selectedDogs).toEqual(['dog-1', 'dog-2']);
  });

  it('passes the original (unfiltered) class selections to ClassSelectionStep', () => {
    render(<WorkflowStepContent {...baseProps()} />);

    const classSelections = JSON.parse(screen.getByTestId('class-selections').textContent ?? '[]');
    expect(classSelections).toEqual(originalClassSelections);
  });
});
